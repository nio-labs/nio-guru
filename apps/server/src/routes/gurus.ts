import { Hono } from 'hono';
import { db } from '../db/index.js';
import { gurusTable, conversationsTable, messagesTable } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const router = new Hono();

// GET /api/gurus
router.get('/', (c) => {
  const gurus = db
    .select()
    .from(gurusTable)
    .all()
    .map((g) => {
      // Find the most recent conversation for this guru
      const latestConv = db
        .select()
        .from(conversationsTable)
        .where(eq(conversationsTable.guruId, g.id))
        .orderBy(desc(conversationsTable.updatedAt))
        .limit(1)
        .get();

      let lastMessage: { role: string; content: string; createdAt: number } | null = null;
      if (latestConv) {
        const lastMsg = db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, latestConv.id))
          .orderBy(desc(messagesTable.createdAt))
          .limit(1)
          .get();

        if (lastMsg) {
          lastMessage = {
            role: lastMsg.role,
            content: lastMsg.content,
            createdAt: lastMsg.createdAt,
          };
        }
      }

      return {
        ...g,
        lastMessage,
        defaultSkills: JSON.parse(g.defaultSkills || '[]'),
        samplePrompts: JSON.parse(g.samplePrompts || '[]'),
      };
    })
    .sort((a, b) => {
      // Pinned first
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      // Direct chat always at top of its section
      if (a.id === 'direct-chat') return -1;
      if (b.id === 'direct-chat') return 1;
      return a.name.localeCompare(b.name);
    });

  return c.json({ gurus });
});

// GET /api/gurus/:id
router.get('/:id', (c) => {
  const id = c.req.param('id');
  const guru = db.select().from(gurusTable).where(eq(gurusTable.id, id)).get();
  if (!guru) {
    return c.json({ error: 'Guru not found' }, 404);
  }
  return c.json({
    guru: {
      ...guru,
      defaultSkills: JSON.parse(guru.defaultSkills || '[]'),
      samplePrompts: JSON.parse(guru.samplePrompts || '[]'),
    },
  });
});

// PUT /api/gurus/:id/pin
router.put('/:id/pin', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const guru = db.select().from(gurusTable).where(eq(gurusTable.id, id)).get();
  if (!guru) {
    return c.json({ error: 'Guru not found' }, 404);
  }

  const newPinned = typeof body.isPinned === 'boolean' ? body.isPinned : !guru.isPinned;
  db.update(gurusTable)
    .set({ isPinned: newPinned, updatedAt: Date.now() })
    .where(eq(gurusTable.id, id))
    .run();

  return c.json({ success: true, isPinned: newPinned });
});

// POST /api/gurus (Create custom Guru)
router.post('/', async (c) => {
  const body = await c.req.json();
  const id = `custom-${nanoid(8)}`;
  const now = Date.now();

  const newGuru = {
    id,
    name: body.name || 'Custom Guru',
    tagline: body.tagline || 'Custom user-created Guru',
    category: 'custom' as const,
    categoryLabel: 'Custom',
    icon: body.icon || 'Sparkles',
    color: body.color || 'blue',
    isPinned: false,
    isCustom: true,
    systemPrompt: body.systemPrompt || '',
    defaultSkills: JSON.stringify(body.defaultSkills || []),
    widgetType: 'none',
    samplePrompts: JSON.stringify(body.samplePrompts || []),
    createdAt: now,
    updatedAt: now,
  };

  db.insert(gurusTable).values(newGuru).run();
  return c.json({ guru: newGuru }, 201);
});

export default router;
