import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { repository, publicConversation, conversationPreview, type Conversation } from '../db/repository.js';
import { getAvailableModels } from '../services/nio-runner.js';
import { getPreferredNioModelId } from '../../../../packages/shared/src/nio-models.js';
import { isConversationRunning } from './chat.js';

const router = new Hono();

router.get('/', async c => {
  const conversations = (await repository.conversations.list(c.req.query('guruId')))
    .map(item => item.value)
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt);
  const gurus = new Map((await repository.gurus.list()).map(item => [item.value.id, item.value]));
  return c.json({ conversations: conversations.map(conversation => {
    const guru = gurus.get(conversation.guruId);
    const preview = conversationPreview(conversation);
    return { ...publicConversation(conversation),
      guru: guru ? { id: guru.id, name: guru.name, icon: guru.icon, color: guru.color } : null,
      lastMessage: preview ? { ...preview, content: Array.from(preview.content).slice(0, 100).join('') } : null };
  }) });
});

router.post('/', async c => {
  const body = await c.req.json().catch(() => ({}));
  const guruId = typeof body.guruId === 'string' && body.guruId ? body.guruId : 'direct-chat';
  if (!await repository.gurus.get(guruId)) return c.json({ error: 'Guru not found' }, 404);
  const now = Date.now();
  const conversation: Conversation = {
    id: nanoid(10), guruId,
    title: typeof body.title === 'string' && body.title ? body.title : 'New Conversation',
    model: typeof body.model === 'string' && body.model.trim() ? body.model.trim()
      : getPreferredNioModelId(await getAvailableModels()),
    isPinned: false, createdAt: now, updatedAt: now,
  };
  await repository.conversations.create(conversation);
  return c.json({ conversation: publicConversation(conversation) }, 201);
});

router.get('/:id', async c => {
  const record = await repository.conversations.get(c.req.param('id'));
  if (!record) return c.json({ error: 'Conversation not found' }, 404);
  const guru = (await repository.gurus.get(record.value.guruId))?.value;
  const page = await repository.messages.page(record.value.id);
  return c.json({ conversation: { ...publicConversation(record.value), guru: guru ?? null,
    messages: page.messages, hasMoreMessages: page.hasMore } });
});

router.get('/:id/messages', async c => {
  const id = c.req.param('id');
  if (!await repository.conversations.get(id)) return c.json({ error: 'Conversation not found' }, 404);
  const beforeAt = Number(c.req.query('beforeAt'));
  const beforeId = c.req.query('beforeId');
  if (!Number.isSafeInteger(beforeAt) || beforeAt <= 0 || !beforeId || beforeId.length > 100)
    return c.json({ error: 'A valid message cursor is required.' }, 400);
  return c.json(await repository.messages.page(id, beforeAt, beforeId));
});

router.put('/:id', async c => {
  const id = c.req.param('id');
  const record = await repository.conversations.get(id);
  if (!record) return c.json({ error: 'Conversation not found' }, 404);
  if (isConversationRunning(id)) return c.json({ error: 'Stop this conversation’s current response before editing it.' }, 409);
  const body = await c.req.json().catch(() => ({}));
  const fields: Partial<Conversation> = { updatedAt: Date.now() };
  if (typeof body.title === 'string') fields.title = body.title;
  if (typeof body.isPinned === 'boolean') fields.isPinned = body.isPinned;
  if (typeof body.model === 'string') fields.model = body.model;
  try {
    const updated = await repository.conversations.update(record, fields);
    return c.json({ conversation: publicConversation(updated.value) });
  } catch (error) {
    if ((error as { code?: string }).code === 'lease_conflict') return c.json({ error: 'Conversation is in use.' }, 409);
    throw error;
  }
});

router.delete('/:id/messages/:messageId', async c => {
  const conversationId = c.req.param('id');
  const messageId = c.req.param('messageId');
  if (isConversationRunning(conversationId)) return c.json({ error: 'Stop this conversation’s current response before editing it.' }, 409);
  try { await repository.messages.delete(conversationId, messageId); }
  catch (error) {
    if ((error as { code?: string }).code === 'lease_conflict') return c.json({ error: 'Conversation is in use.' }, 409);
    throw error;
  }
  return c.json({ success: true });
});

router.delete('/:id', async c => {
  const id = c.req.param('id');
  if (isConversationRunning(id)) return c.json({ error: 'Stop this conversation’s current response before deleting it.' }, 409);
  const record = await repository.conversations.get(id);
  if (!record) return c.json({ success: true });
  try { await repository.conversations.delete(record); }
  catch (error) {
    if (['lease_conflict', 'deletion_in_progress'].includes((error as { code?: string }).code || ''))
      return c.json({ error: 'Conversation is in use.' }, 409);
    throw error;
  }
  return c.json({ success: true });
});

router.post('/:id/fork', async c => {
  const sourceId = c.req.param('id');
  const sourceRecord = await repository.conversations.get(sourceId);
  if (!sourceRecord) return c.json({ error: 'Source conversation not found' }, 404);
  if (isConversationRunning(sourceId)) return c.json({ error: 'Wait for this response to finish before branching.' }, 409);

  const body = await c.req.json().catch(() => ({}));
  const atMessageId = typeof body.atMessageId === 'string' ? body.atMessageId : undefined;

  // Retrieve source messages up to atMessageId
  const allMessages = await repository.messages.listByConversation(sourceId);
  let messagesToCopy = allMessages;
  if (atMessageId) {
    const idx = allMessages.findIndex(m => m.id === atMessageId);
    if (idx !== -1) {
      messagesToCopy = allMessages.slice(0, idx + 1);
    }
  }

  const now = Date.now();
  const lastMsg = messagesToCopy.at(-1);
  const newConvId = nanoid(10);
  const title = (sourceRecord.value.title || 'Conversation') + ' (Branch)';
  const newConversation: Conversation = {
    id: newConvId,
    guruId: sourceRecord.value.guruId,
    title,
    model: sourceRecord.value.model,
    isPinned: false,
    createdAt: now,
    updatedAt: now,
    previewRole: lastMsg?.role ?? null,
    previewContent: lastMsg ? Array.from(lastMsg.content).slice(0, 100).join('') : null,
    previewAt: lastMsg?.createdAt ?? now,
  };

  await repository.conversations.create(newConversation);

  // Copy messages to the new conversation
  const messageIdMap = new Map<string, string>();
  const clonedMessages: Message[] = [];
  for (const orig of messagesToCopy) {
    const clonedId = nanoid(10);
    messageIdMap.set(orig.id, clonedId);
    clonedMessages.push({
      ...orig,
      id: clonedId,
      conversationId: newConvId,
      parentMessageId: orig.parentMessageId ? (messageIdMap.get(orig.parentMessageId) ?? orig.parentMessageId) : null,
    });
  }

  if (clonedMessages.length > 0) {
    await repository.messages.createMany(clonedMessages, newConvId);
  }

  const guru = (await repository.gurus.get(newConversation.guruId))?.value;
  return c.json({
    conversation: {
      ...publicConversation(newConversation),
      guru: guru ? { id: guru.id, name: guru.name, icon: guru.icon, color: guru.color } : null,
      lastMessage: lastMsg ? { role: lastMsg.role, content: Array.from(lastMsg.content).slice(0, 100).join(''), createdAt: lastMsg.createdAt } : null,
    },
  }, 201);
});

export default router;
