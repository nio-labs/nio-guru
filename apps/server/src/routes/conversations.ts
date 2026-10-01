import { Hono } from 'hono';
import { db } from '../db/index.js';
import { conversationsTable, messagesTable, gurusTable } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const router = new Hono();

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
  const model = body.model || 'kilo-auto/free';
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

  const msgs = db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, id))
    .orderBy(messagesTable.createdAt)
    .all()
    .map((m) => ({
      ...m,
      toolCalls: JSON.parse(m.toolCalls || '[]'),
    }));

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
      messages: msgs,
    },
  });
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
