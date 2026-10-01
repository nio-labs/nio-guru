import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db } from '../db/index.js';
import { conversationsTable, messagesTable, gurusTable } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { streamNioTurn, ChatStreamEvent } from '../services/nio-runner.js';

const router = new Hono();

router.post('/stream', async (c) => {
  const body = await c.req.json();
  const { conversationId, prompt, mode } = body;

  if (!conversationId || !prompt || !prompt.trim()) {
    return c.json({ error: 'conversationId and prompt are required' }, 400);
  }

  // Verify conversation exists
  const conv = db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId)).get();
  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  // Get Guru details
  const guru = db.select().from(gurusTable).where(eq(gurusTable.id, conv.guruId)).get();
  const systemPrompt = guru?.systemPrompt || '';

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

  // Return SSE stream
  return streamSSE(c, async (stream) => {
    let accumulatedContent = '';
    let accumulatedThought = '';
    const toolCallsMap = new Map<string, any>();
    let runnerHandle: { kill: () => void } | null = null;
    let isStreamEnded = false;

    stream.onAbort(() => {
      console.log(`[chat-stream] Client aborted stream for conversation ${conversationId}`);
      if (runnerHandle) {
        runnerHandle.kill();
      }
    });

    const finishAssistantTurn = () => {
      if (isStreamEnded) return;
      isStreamEnded = true;

      // Save assistant message to database
      const assistantMsgId = nanoid(10);
      const toolCallsList = Array.from(toolCallsMap.values());

      try {
        db.insert(messagesTable)
          .values({
            id: assistantMsgId,
            conversationId,
            role: 'assistant',
            content: accumulatedContent,
            thought: accumulatedThought,
            toolCalls: JSON.stringify(toolCallsList),
            createdAt: Date.now(),
          })
          .run();
      } catch (err: any) {
        console.error(`[chat-stream] Error persisting assistant message: ${err.message}`);
      }
    };

    try {
      await new Promise<void>((resolve) => {
        runnerHandle = streamNioTurn({
          conversationId,
          guruId: conv.guruId,
          systemPrompt,
          userPrompt: prompt,
          model: body.model || conv.model,
          mode: mode || 'ask',
          onEvent: async (event: ChatStreamEvent) => {
            try {
              if (event.type === 'token' && event.text) {
                accumulatedContent += event.text;
                await stream.writeSSE({
                  event: 'token',
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
              resolve();
            }
          },
        });
      });
    } catch (err: any) {
      console.error(`[chat-stream] Exception in stream execution: ${err.message}`);
      finishAssistantTurn();
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ error: err.message }),
      });
    }
  });
});

export default router;
