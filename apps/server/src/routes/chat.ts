import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { nanoid } from 'nanoid';
import { bodyLimit } from 'hono/body-limit';
import { repository, type Lease, type Message, type Stored, type Conversation } from '../db/repository.js';
import { streamNioTurn, type ChatStreamEvent } from '../services/nio-runner.js';
import { parseGuruSkills } from '../services/nio-skills.js';
import { stageAttachments } from '../services/attachments.js';
import { MAX_ATTACHMENT_BYTES, MAX_TEXT_BYTES, IMAGE_EXTENSIONS, attachmentExtension } from '../../../../packages/shared/src/attachments.js';

const router = new Hono();
type ActiveRun = ReturnType<typeof streamNioTurn>;
interface RunState { handle: ActiveRun | null; cancelled: boolean; finished: Promise<void>; complete: () => void; }
const activeRuns = new Map<string, RunState>();
export function isConversationRunning(id: string): boolean { return activeRuns.has(id); }

router.post('/:conversationId/stop', async c => {
  const state = activeRuns.get(c.req.param('conversationId'));
  if (state) {
    state.cancelled = true;
    state.handle?.kill();
    await state.finished;
  }
  return c.json({ stopped: true });
});

router.post('/stream', bodyLimit({ maxSize: MAX_ATTACHMENT_BYTES + 128 * 1024,
  onError: c => c.json({ error: 'Attachments must total 20 MB or less.' }, 413) }), async c => {
  let body: Record<string, any>;
  let files: File[] = [];
  try {
    if (c.req.header('content-type')?.includes('multipart/form-data')) {
      const form = await c.req.formData();
      const attached = form.getAll('files');
      if (attached.some(file => !(file instanceof File))) return c.json({ error: 'Invalid attachment upload.' }, 400);
      files = attached as File[];
      body = { conversationId: form.get('conversationId'), prompt: form.get('prompt'), model: form.get('model') };
    } else body = await c.req.json();
  } catch { return c.json({ error: 'Could not read this message or its attachments.' }, 400); }
  const conversationId = body.conversationId;
  const prompt = typeof body.prompt === 'string' && body.prompt.trim()
    ? body.prompt : files.length ? 'Please inspect the attached files.' : '';
  if (typeof conversationId !== 'string' || !conversationId || !prompt.trim())
    return c.json({ error: 'conversationId and prompt are required' }, 400);
  if (body.mode !== undefined && body.mode !== 'ask') return c.json({ error: 'NioGuru supports chat mode only.' }, 400);
  const textBytes = files.filter(file => !IMAGE_EXTENSIONS.has(attachmentExtension(file.name)))
    .reduce((size, file) => size + file.size, 0);
  if (files.length && Buffer.byteLength(prompt) + textBytes > MAX_TEXT_BYTES)
    return c.json({ error: 'Your message and text attachments must total 16 KB or less.' }, 400);
  if (c.req.raw.signal.aborted) return c.json({ error: 'Request cancelled.' }, 408);
  if (activeRuns.has(conversationId)) return c.json({ error: 'This conversation already has a response in progress.' }, 409);

  let complete!: () => void;
  const finished = new Promise<void>(resolve => { complete = resolve; });
  const state: RunState = { handle: null, cancelled: false, finished, complete };
  activeRuns.set(conversationId, state);
  let handedToStream = false;
  let lease: Lease | undefined;
  let uploads: Awaited<ReturnType<typeof stageAttachments>> | undefined;
  try {
    try { lease = await repository.leases.acquire(conversationId, `turn:${nanoid(16)}`); }
    catch (error) {
      if ((error as { code?: string }).code === 'lease_conflict')
        return c.json({ error: 'This conversation already has a response in progress.' }, 409);
      throw error;
    }
    let conversation = await repository.conversations.get(conversationId);
    if (!conversation) return c.json({ error: 'Conversation not found' }, 404);
    const guru = (await repository.gurus.get(conversation.value.guruId))?.value;
    const systemPrompt = guru?.systemPrompt || '';
    let skills: string[];
    try { skills = parseGuruSkills(JSON.stringify(guru?.defaultSkills ?? [])); }
    catch (error) { return c.json({ error: (error as Error).message }, 400); }
    try { uploads = await stageAttachments(files); }
    catch (error) { return c.json({ error: (error as Error).message }, 400); }
    if (c.req.raw.signal.aborted || state.cancelled) return c.json({ error: 'Request cancelled.' }, 408);

    const now = Date.now();
    const userMessage: Message = {
      id: nanoid(10), conversationId, role: 'user', content: prompt, thought: '',
      toolCalls: [], attachments: uploads.metadata, createdAt: now,
    };
    const title = conversation.value.title === 'New Conversation'
      ? Array.from(prompt.trim().replace(/\s+/g, ' ')).slice(0, 45).join('') : conversation.value.title;
    const saved = await repository.messages.createWithConversationUpdate(userMessage, conversation, {
      title, updatedAt: now, previewRole: 'user', previewContent: Array.from(prompt).slice(0, 100).join(''), previewAt: now,
    }, lease);
    conversation = saved.conversation;
    if (c.req.raw.signal.aborted || state.cancelled) return c.json({ error: 'Request cancelled.' }, 408);
    const streamLease = lease;
    const staged = uploads;
    const response = streamSSE(c, async stream => {
      let currentLease = streamLease;
      let currentConversation: Stored<Conversation> = conversation!;
      let accumulatedContent = '';
      let accumulatedThought = '';
      const toolCalls = new Map<string, NonNullable<ChatStreamEvent['toolCall']>>();
      const assistantId = nanoid(10);
      let terminal = false;
      let lostLease = false;
      let renewing = false;
      const renew = setInterval(async () => {
        if (renewing) return;
        renewing = true;
        try { currentLease = await repository.leases.renew(currentLease); }
        catch { lostLease = true; state.handle?.kill(); }
        finally { renewing = false; }
      }, 10_000);
      stream.onAbort(() => { state.cancelled = true; state.handle?.kill(); });

      function messageTime() {
        return Math.max(Date.now(), (currentConversation.value.previewAt || 0) + 1);
      }

      async function persist(message: Message) {
        const updated = await repository.messages.createWithConversationUpdate(message, currentConversation, {
          updatedAt: message.createdAt, previewRole: message.role,
          previewContent: Array.from(message.content).slice(0, 100).join(''), previewAt: message.createdAt,
        }, currentLease);
        currentConversation = updated.conversation;
      }
      async function finish(event: ChatStreamEvent) {
        if (terminal) return;
        terminal = true;
        try {
          if (lostLease) throw new Error('Conversation ownership was lost.');
          const assistant: Message = {
            id: assistantId, conversationId, role: 'assistant', content: accumulatedContent,
            thought: accumulatedThought, toolCalls: Array.from(toolCalls.values()),
            attachments: [], createdAt: messageTime(),
          };
          await persist(assistant);
          if (lostLease) throw new Error('Conversation ownership was lost.');
          if (event.type === 'error') {
            await persist({ id: nanoid(10), conversationId, role: 'system',
              content: `Error: ${event.error || 'Nio could not complete the turn.'}`,
              thought: '', toolCalls: [], attachments: [], createdAt: messageTime() });
            await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: event.error }) });
          } else if (event.type === 'cancelled') {
            await stream.writeSSE({ event: 'cancelled', data: JSON.stringify({}) });
          } else {
            await stream.writeSSE({ event: 'done', data: JSON.stringify({
              content: accumulatedContent, thought: accumulatedThought,
              toolCalls: Array.from(toolCalls.values()),
            }) });
          }
        } catch (error) {
          state.handle?.kill();
          console.error('[chat-stream] Could not persist terminal event:', error);
          try { await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'Could not save this response. Please retry.' }) }); }
          catch { /* The client already disconnected. */ }
        }
      }
      try {
        state.handle = streamNioTurn({
          conversationId, guruId: currentConversation.value.guruId, systemPrompt,
          skills, userPrompt: prompt, files: staged.paths,
          model: typeof body.model === 'string' && body.model ? body.model : currentConversation.value.model,
          onEvent: async event => {
            try {
              if (terminal) return;
              if (event.type === 'token' && event.text) {
                accumulatedContent += event.text;
                await stream.writeSSE({ event: 'token', data: JSON.stringify({ text: event.text }) });
              } else if (event.type === 'thought' && event.text) {
                accumulatedThought += (accumulatedThought ? '\n' : '') + event.text;
                await stream.writeSSE({ event: 'thought', data: JSON.stringify({ text: event.text }) });
              } else if (event.type === 'tool_call' && event.toolCall) {
                toolCalls.set(event.toolCall.id, event.toolCall);
                await stream.writeSSE({ event: 'tool_call', data: JSON.stringify({ toolCall: event.toolCall }) });
              } else if (event.type === 'warning') {
                const text = event.text || 'Some selected skills are unavailable.';
                await persist({ id: nanoid(10), conversationId, role: 'system', content: text,
                  thought: '', toolCalls: [], attachments: [], createdAt: messageTime() });
                await stream.writeSSE({ event: 'warning', data: JSON.stringify({ text }) });
              } else if (['done', 'error', 'cancelled'].includes(event.type)) await finish(event);
            } catch (error) {
              state.handle?.kill();
              await finish({ type: 'error', error: (error as Error).message });
            }
          },
        });
        if (c.req.raw.signal.aborted || state.cancelled) state.handle.kill();
        await state.handle.finished;
        if (!terminal) await finish({ type: 'error', error: 'Nio stopped before completing this turn.' });
      } catch (error) {
        await finish({ type: 'error', error: (error as Error).message });
      } finally {
        clearInterval(renew);
        try { await repository.leases.release(currentLease); }
        catch (error) { console.warn('[chat-stream] Lease release failed:', error); }
        staged.cleanup();
        if (activeRuns.get(conversationId) === state) activeRuns.delete(conversationId);
        state.complete();
      }
    });
    handedToStream = true;
    return response;
  } catch (error) {
    console.error('[chat-stream] Could not start response:', error);
    return c.json({ error: 'Could not save your message or start this response. Please retry.' }, 503);
  } finally {
    if (!handedToStream) {
      uploads?.cleanup();
      if (lease) {
        try { await repository.leases.release(lease); }
        catch (error) { console.warn('[chat-stream] Lease release failed:', error); }
      }
      if (activeRuns.get(conversationId) === state) activeRuns.delete(conversationId);
      state.complete();
    }
  }
});

export default router;
