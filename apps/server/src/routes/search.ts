import { Hono } from 'hono';
import { repository } from '../db/repository.js';

const router = new Hono();

router.get('/', async (c) => {
  const q = c.req.query('q')?.trim() || '';
  const guruId = c.req.query('guruId')?.trim() || '';
  const limit = Number(c.req.query('limit')) || 25;

  if (!q) {
    return c.json({ query: q, results: [], total: 0 });
  }

  // Find messages matching query in NioDB
  const messages = await repository.messages.search(q, { limit: 50 });

  if (messages.length === 0) {
    return c.json({ query: q, results: [], total: 0 });
  }

  // Load conversation & guru metadata for matches
  const conversationIds = Array.from(new Set(messages.map(m => m.conversationId)));
  const conversationsMap = new Map();
  await Promise.all(
    conversationIds.map(async (id) => {
      const conv = await repository.conversations.get(id);
      if (conv) {
        conversationsMap.set(id, conv.value);
      }
    })
  );

  const gurusList = await repository.gurus.list();
  const gurusMap = new Map(gurusList.map(g => [g.value.id, g.value]));

  // Build rich search results
  const results = [];
  for (const msg of messages) {
    const conv = conversationsMap.get(msg.conversationId);
    if (!conv) continue;

    if (guruId && conv.guruId !== guruId) {
      continue;
    }

    const guru = gurusMap.get(conv.guruId);

    // Extract match context snippet
    const content = msg.content || '';
    const lowerContent = content.toLowerCase();
    const matchIdx = lowerContent.indexOf(q.toLowerCase());
    let snippet = '';

    if (matchIdx !== -1) {
      const start = Math.max(0, matchIdx - 40);
      const end = Math.min(content.length, matchIdx + q.length + 60);
      snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
    } else {
      snippet = content.slice(0, 100) + (content.length > 100 ? '…' : '');
    }

    results.push({
      messageId: msg.id,
      conversationId: msg.conversationId,
      conversationTitle: conv.title,
      guruId: conv.guruId,
      guruName: guru ? guru.name : 'Unknown Guru',
      guruIcon: guru ? guru.icon : 'Bot',
      guruColor: guru ? guru.color : 'slate',
      role: msg.role,
      snippet,
      fullContent: content,
      createdAt: msg.createdAt,
    });

    if (results.length >= limit) break;
  }

  return c.json({
    query: q,
    results,
    total: results.length,
  });
});

export default router;
