import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { repository, type Memory } from '../db/repository.js';

const router = new Hono();

router.get('/', async c => {
  const memories = await repository.memories.list();
  return c.json({ memories });
});

router.post('/', async c => {
  const body = await c.req.json().catch(() => ({}));
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content) return c.json({ error: 'Memory content is required' }, 400);

  const now = Date.now();
  const memory: Memory = {
    id: nanoid(10),
    content,
    category: typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'general',
    createdAt: now,
    updatedAt: now,
  };

  await repository.memories.create(memory);
  return c.json({ memory }, 201);
});

router.put('/:id', async c => {
  const id = c.req.param('id');
  const record = await repository.memories.get(id);
  if (!record) return c.json({ error: 'Memory not found' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const fields: Partial<Memory> = { updatedAt: Date.now() };
  if (typeof body.content === 'string' && body.content.trim()) {
    fields.content = body.content.trim();
  }
  if (typeof body.category === 'string') {
    fields.category = body.category.trim();
  }

  const updated = await repository.memories.update(record, fields);
  return c.json({ memory: updated.value });
});

router.delete('/:id', async c => {
  const id = c.req.param('id');
  const record = await repository.memories.get(id);
  if (!record) return c.json({ success: true });

  await repository.memories.delete(record);
  return c.json({ success: true });
});

export default router;
