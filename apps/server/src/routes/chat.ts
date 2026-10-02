import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db } from '../db/index.js';
import { conversationsTable, messagesTable, gurusTable } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { streamNioTurn, ChatStreamEvent } from '../services/nio-runner.js';
import { parseGuruSkills } from '../services/nio-skills.js';

const router = new Hono();
type ActiveRun = ReturnType<typeof streamNioTurn>;
const activeRuns = new Map<string, ActiveRun>();
export function isConversationRunning(id: string): boolean { return activeRuns.has(id); }

router.post('/:conversationId/stop', async (c) => {
  const handle = activeRuns.get(c.req.param('conversationId'));
  if (handle) { handle.kill(); await handle.finished; }
  return c.json({ stopped: true });
});

router.post('/stream', async (c) => {
  const body = await c.req.json();
  const { conversationId, prompt, mode } = body;

  if (typeof conversationId !== 'string' || typeof prompt !== 'string' || !prompt.trim()) {
    return c.json({ error: 'conversationId and prompt are required' }, 400);
  }

  if (activeRuns.has(conversationId)) return c.json({ error: 'This conversation already has a response in progress.' }, 409);
  if (c.req.raw.signal.aborted) return c.json({ error: 'Request cancelled.' }, 408);

  // Verify conversation exists
  const conv = db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId)).get();
  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  // Get Guru details
  const guru = db.select().from(gurusTable).where(eq(gurusTable.id, conv.guruId)).get();
  const systemPrompt = guru?.systemPrompt || '';

  let selectedSkills: string[];
  try { selectedSkills = parseGuruSkills(guru?.defaultSkills || '[]'); }
  catch (error) { return c.json({ error: (error as Error).message }, 400); }
  if (mode !== undefined && mode !== 'ask') {
    return c.json({ error: 'NioGuru supports chat mode only.' }, 400);
  }

  // Auto-update conversation title if it was "New Conversation"
  if (conv.title === 'New Conversation') {
    const cleanTitle = prompt.trim().replace(/\s+/g, ' ').slice(0, 45);
    db.update(conversationsTable)
      .set({ title: cleanTitle, updatedAt: Date.now() })
      .where(eq(conversationsTable.id, conversationId))
      .run();
  } else {
    db.update(conversationsTable)
      .set({ updatedAt: Date.now() })
      .where(eq(conversationsTable.id, conversationId))
      .run();
  }

  // 1. Insert user message into database
  const userMsgId = nanoid(10);
  const now = Date.now();
  db.insert(messagesTable)
    .values({
      id: userMsgId,
      conversationId,
      role: 'user',
      content: prompt,
      thought: '',
      toolCalls: '[]',
      createdAt: now,
    })
    .run();

  // Update conversation updatedAt
  db.update(conversationsTable)
    .set({ updatedAt: now })
    .where(eq(conversationsTable.id, conversationId))
    .run();

  // Return SSE stream
  return streamSSE(c, async (stream) => {
    let accumulatedContent = '';
    let accumulatedThought = '';
    const toolCallsMap = new Map<string, any>();
    let runnerHandle: ActiveRun | null = null;
    let isStreamEnded = false;

    stream.onAbort(() => {
      console.log(`[chat-stream] Client aborted stream for conversation ${conversationId}`);
      if (runnerHandle) {
        runnerHandle.kill();
      }
    });

    const persistNotice = (text: string) => {
      db.insert(messagesTable).values({
        id: nanoid(10), conversationId, role: 'system', content: text,
        thought: '', toolCalls: '[]', createdAt: Date.now(),
      }).run();
    };

    const finishAssistantTurn = () => {
      if (isStreamEnded) return;
      isStreamEnded = true;

      // Save assistant message to database
      const assistantMsgId = nanoid(10);
      const toolCallsList = Array.from(toolCallsMap.values());
      const nowEnd = Date.now();

      try {
        db.insert(messagesTable)
          .values({
            id: assistantMsgId,
            conversationId,
            role: 'assistant',
            content: accumulatedContent,
            thought: accumulatedThought,
            toolCalls: JSON.stringify(toolCallsList),
            createdAt: nowEnd,
          })
          .run();

        db.update(conversationsTable)
          .set({ updatedAt: nowEnd })
          .where(eq(conversationsTable.id, conversationId))
          .run();
      } catch (err: any) {
        console.error(`[chat-stream] Error persisting assistant message: ${err.message}`);
      }
    };

    try {
      await new Promise<void>((resolve) => {
        if (c.req.raw.signal.aborted) { resolve(); return; }
        runnerHandle = streamNioTurn({
          conversationId,
          guruId: conv.guruId,
          systemPrompt,
          skills: selectedSkills,
          userPrompt: prompt,
          model: body.model || conv.model,
          onEvent: async (event: ChatStreamEvent) => {
            try {
              if (event.type === 'token' && event.text) {
                accumulatedContent += event.text;
                await stream.writeSSE({
                  event: 'token',
                  data: JSON.stringify({ text: event.text }),
                });
              } else if (event.type === 'warning') {
                persistNotice(event.text || 'Some selected skills are unavailable.');
                await stream.writeSSE({
                  event: 'warning',
                  data: JSON.stringify({ text: event.text }),
                });
              } else if (event.type === 'thought' && event.text) {
                accumulatedThought += (accumulatedThought ? '\n' : '') + event.text;
                await stream.writeSSE({
                  event: 'thought',
                  data: JSON.stringify({ text: event.text }),
                });
              } else if (event.type === 'tool_call' && event.toolCall) {
                toolCallsMap.set(event.toolCall.id, event.toolCall);
                await stream.writeSSE({
                  event: 'tool_call',
                  data: JSON.stringify({ toolCall: event.toolCall }),
                });
              } else if (event.type === 'done') {
                finishAssistantTurn();
                await stream.writeSSE({
                  event: 'done',
                  data: JSON.stringify({
                    content: accumulatedContent,
                    thought: accumulatedThought,
                    toolCalls: Array.from(toolCallsMap.values()),
                  }),
                });
                resolve();
              } else if (event.type === 'error') {
                persistNotice(`Error: ${event.error || 'Nio could not complete the turn.'}`);
                finishAssistantTurn();
                await stream.writeSSE({
                  event: 'error',
                  data: JSON.stringify({ error: event.error }),
                });
                resolve();
              } else if (event.type === 'cancelled') {
                finishAssistantTurn();
                await stream.writeSSE({
                  event: 'cancelled',
                  data: JSON.stringify({}),
                });
                resolve();
              }
            } catch (writeErr) {
              runnerHandle?.kill();
              finishAssistantTurn();
              resolve();
            }
          },
        });
        activeRuns.set(conversationId, runnerHandle);
      });
    } catch (err: any) {
      console.error(`[chat-stream] Exception in stream execution: ${err.message}`);
      persistNotice(`Error: ${err.message}`);
      finishAssistantTurn();
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: err.message }),
      });
    } finally {
      if (runnerHandle && activeRuns.get(conversationId) === runnerHandle) activeRuns.delete(conversationId);
    }
  });
});

export default router;
