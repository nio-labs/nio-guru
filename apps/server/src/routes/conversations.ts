import { Hono } from 'hono';
import { db } from '../db/index.js';
import { conversationsTable, messagesTable, gurusTable } from '../db/schema.js';
import { eq, desc, and, lt, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getAvailableModels } from '../services/nio-runner.js';
import { getPreferredNioModelId } from '../../../../packages/shared/src/nio-models.js';

const router = new Hono();
const MESSAGE_PAGE_SIZE = 30;

function messagePage(conversationId: string, beforeAt?: number, beforeId?: string) {
  const cursor = beforeAt !== undefined && beforeId
    ? or(lt(messagesTable.createdAt, beforeAt),
      and(eq(messagesTable.createdAt, beforeAt), lt(messagesTable.id, beforeId)))
    : undefined;
  const rows = db.select().from(messagesTable)
    .where(cursor ? and(eq(messagesTable.conversationId, conversationId), cursor)
      : eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt), desc(messagesTable.id))
    .limit(MESSAGE_PAGE_SIZE + 1).all();
  const hasMore = rows.length > MESSAGE_PAGE_SIZE;
  const messages = rows.slice(0, MESSAGE_PAGE_SIZE).reverse().map(message => ({
    ...message, toolCalls: JSON.parse(message.toolCalls || '[]'),
  }));
  return { messages, hasMore };
}

// GET /api/conversations
router.get('/', (c) => {
  const guruId = c.req.query('guruId');
  let query = db.select().from(conversationsTable);

  const convos = (
    guruId
      ? db.select().from(conversationsTable).where(eq(conversationsTable.guruId, guruId)).all()
      : db.select().from(conversationsTable).all()
  ).sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  // Attach last message preview and guru info
  const result = convos.map((conv) => {
    const lastMsg = db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1)
      .get();

    const guru = db.select().from(gurusTable).where(eq(gurusTable.id, conv.guruId)).get();

    return {
      ...conv,
      guru: guru ? { id: guru.id, name: guru.name, icon: guru.icon, color: guru.color } : null,
      lastMessage: lastMsg
        ? {
            role: lastMsg.role,
            content: lastMsg.content.slice(0, 100),
            createdAt: lastMsg.createdAt,
          }
        : null,
    };
  });

  return c.json({ conversations: result });
});

// POST /api/conversations
router.post('/', async (c) => {
  const body = await c.req.json();
  const guruId = body.guruId || 'direct-chat';
  const title = body.title || 'New Conversation';
  const model = typeof body.model === 'string' && body.model.trim()
    ? body.model.trim() : getPreferredNioModelId(await getAvailableModels());
  const id = nanoid(10);
  const now = Date.now();

  db.insert(conversationsTable)
    .values({
      id,
      guruId,
      title,
      model,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const created = db.select().from(conversationsTable).where(eq(conversationsTable.id, id)).get();
  return c.json({ conversation: created }, 201);
});

// GET /api/conversations/:id
router.get('/:id', (c) => {
  const id = c.req.param('id');
  const conv = db.select().from(conversationsTable).where(eq(conversationsTable.id, id)).get();
  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  const guru = db.select().from(gurusTable).where(eq(gurusTable.id, conv.guruId)).get();

  const page = messagePage(id);

  return c.json({
    conversation: {
      ...conv,
      guru: guru
        ? {
            ...guru,
            defaultSkills: JSON.parse(guru.defaultSkills || '[]'),
            samplePrompts: JSON.parse(guru.samplePrompts || '[]'),
          }
        : null,
      messages: page.messages,
      hasMoreMessages: page.hasMore,
    },
  });
});

// GET /api/conversations/:id/messages?beforeAt=...&beforeId=...
router.get('/:id/messages', (c) => {
  const id = c.req.param('id');
  const conversation = db.select({ id: conversationsTable.id }).from(conversationsTable)
    .where(eq(conversationsTable.id, id)).get();
  if (!conversation) return c.json({ error: 'Conversation not found' }, 404);
  const beforeAt = Number(c.req.query('beforeAt'));
  const beforeId = c.req.query('beforeId');
  if (!Number.isSafeInteger(beforeAt) || beforeAt <= 0 || !beforeId || beforeId.length > 100) {
    return c.json({ error: 'A valid message cursor is required.' }, 400);
  }
  return c.json(messagePage(id, beforeAt, beforeId));
});

// PUT /api/conversations/:id
router.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const conv = db.select().from(conversationsTable).where(eq(conversationsTable.id, id)).get();
  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  const updates: any = { updatedAt: Date.now() };
  if (typeof body.title === 'string') updates.title = body.title;
  if (typeof body.isPinned === 'boolean') updates.isPinned = body.isPinned;
  if (typeof body.model === 'string') updates.model = body.model;

  db.update(conversationsTable).set(updates).where(eq(conversationsTable.id, id)).run();

  const updated = db.select().from(conversationsTable).where(eq(conversationsTable.id, id)).get();
  return c.json({ conversation: updated });
});

// DELETE /api/conversations/:id
router.delete('/:id', (c) => {
  const id = c.req.param('id');
  db.delete(messagesTable).where(eq(messagesTable.conversationId, id)).run();
  db.delete(conversationsTable).where(eq(conversationsTable.id, id)).run();
  return c.json({ success: true });
});

export default router;
