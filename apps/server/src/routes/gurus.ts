import { Hono } from 'hono';
import { db } from '../db/index.js';
import { gurusTable, conversationsTable, messagesTable } from '../db/schema.js';
import { eq, desc, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { listAvailableSkills, parseGuruSkills } from '../services/nio-skills.js';
import { isConversationRunning } from './chat.js';
import { streamNioTurn, getAvailableModels } from '../services/nio-runner.js';
import { getPreferredNioModelId } from '../../../../packages/shared/src/nio-models.js';
import { GURU_ICON_NAMES } from '../../../../packages/shared/src/guru-icons.js';

const router = new Hono();

// Generate a draft for the Add Guru form without creating a conversation.
router.post('/suggest', async (c) => {
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80) return c.json({ error: 'Enter a Guru name (up to 80 characters) first.' }, 400);
  const available = listAvailableSkills().filter(skill => skill.enabled);
  const skillList = available.map(skill => `${skill.name}: ${skill.description.slice(0, 120)}`).join('\n');
  const prompt = `Create a useful custom chat specialist named ${JSON.stringify(name)}. Return ONLY a JSON object with keys tagline, instructions, icon, skills.\n` +
    `tagline: one plain sentence, under 180 characters.\ninstructions: 3-6 concrete sentences describing expertise, response style, and boundaries. This is chat-only with no attached project folder or file tools. Do not promise to generate images or files.\n` +
    `icon: exactly one name from ${GURU_ICON_NAMES.join(', ')}.\n` +
    `skills: a REQUIRED JSON array. Automatically select 1-3 skills that support this Guru's work from the available list below. Prefer the strongest direct matches; use [] only when no available skill is relevant. Copy skill names EXACTLY, including hyphens. Never invent a skill name or replace hyphens with underscores.\nAvailable skills:\n${skillList || '(none)'}`;
  let content = '';
  let runError = '';
  try {
    const model = getPreferredNioModelId(await getAvailableModels());
    const handle = streamNioTurn({
      conversationId: `suggest-${nanoid(12)}`, guruId: 'guru-draft', userPrompt: prompt,
      model, skills: [],
      onEvent: event => {
        if (event.type === 'token') content += event.text || '';
        if (event.type === 'error') runError = event.error || 'Nio could not generate this Guru.';
        if (event.type === 'cancelled') runError = 'Generation was cancelled.';
      },
    });
    const timeout = setTimeout(() => handle.kill(), 90_000);
    const onAbort = () => handle.kill();
    c.req.raw.signal.addEventListener('abort', onAbort, { once: true });
    try { await handle.finished; }
    finally { clearTimeout(timeout); c.req.raw.signal.removeEventListener('abort', onAbort); }
    if (runError) return c.json({ error: runError }, 502);
    const json = content.match(/\{[\s\S]*\}/)?.[0];
    const draft = JSON.parse(json || '');
    const tagline = typeof draft.tagline === 'string' ? draft.tagline.trim().slice(0, 180) : '';
    const instructions = typeof draft.instructions === 'string' ? draft.instructions.trim().slice(0, 12000) : '';
    if (!tagline || !instructions || !Array.isArray(draft.skills)) throw new Error('Nio returned an incomplete Guru draft. Try again.');
    const icon = GURU_ICON_NAMES.find(candidate => candidate === draft.icon) || 'Sparkles';
    const enabled = new Set(available.map(skill => skill.name));
    const skills = [...new Set<string>(draft.skills.filter((skill: unknown) =>
      typeof skill === 'string' && enabled.has(skill)))].slice(0, 3);
    return c.json({ tagline, instructions, icon, skills });
  } catch (error) {
    console.warn('[nio-guru] Guru suggestion failed:', error);
    return c.json({ error: 'Could not generate a Guru draft right now. Please try again or fill the fields manually.' }, 502);
  }
});

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
          .orderBy(desc(messagesTable.createdAt), desc(messagesTable.id))
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
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const tagline = typeof body?.tagline === 'string' ? body.tagline.trim() : '';
  const systemPrompt = typeof body?.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
  const icon = typeof body?.icon === 'string' && GURU_ICON_NAMES.some(candidate => candidate === body.icon)
    ? body.icon : 'Sparkles';
  if (!name || name.length > 80 || tagline.length > 180 || !systemPrompt || systemPrompt.length > 12000) {
    return c.json({ error: 'Enter a name and instructions. Keep the name under 80 characters and instructions under 12,000 characters.' }, 400);
  }
  let skills: string[];
  try { skills = parseGuruSkills(JSON.stringify(body.defaultSkills ?? [])); }
  catch (error) { return c.json({ error: (error as Error).message }, 400); }
  const available = new Set(listAvailableSkills().filter(skill => skill.enabled).map(skill => skill.name));
  if (skills.some(skill => !available.has(skill))) {
    return c.json({ error: 'Some selected skills are unavailable. Refresh the list and try again.' }, 400);
  }
  const id = `custom-${nanoid(8)}`;
  const now = Date.now();

  const newGuru = {
    id,
    name,
    tagline: tagline || 'Custom Guru',
    category: 'custom' as const,
    categoryLabel: 'Custom',
    icon,
    color: 'teal',
    isPinned: false,
    isCustom: true,
    systemPrompt,
    defaultSkills: JSON.stringify(skills),
    widgetType: 'none',
    samplePrompts: '[]',
    createdAt: now,
    updatedAt: now,
  };

  db.insert(gurusTable).values(newGuru).run();
  return c.json({ guru: { ...newGuru, defaultSkills: skills, samplePrompts: [] } }, 201);
});

// Delete only user-created Gurus after the UI confirms the conversation loss.
router.delete('/:id', (c) => {
  const id = c.req.param('id');
  const guru = db.select().from(gurusTable).where(eq(gurusTable.id, id)).get();
  if (!guru) return c.json({ error: 'Guru not found.' }, 404);
  if (!guru.isCustom) return c.json({ error: 'Built-in Gurus cannot be deleted.' }, 403);
  const conversations = db.select({ id: conversationsTable.id }).from(conversationsTable)
    .where(eq(conversationsTable.guruId, id)).all();
  if (conversations.some(conversation => isConversationRunning(conversation.id))) {
    return c.json({ error: 'Stop this Guru’s current response before deleting it.' }, 409);
  }
  db.transaction(tx => {
    if (conversations.length) {
      tx.delete(messagesTable).where(inArray(messagesTable.conversationId, conversations.map(conversation => conversation.id))).run();
    }
    tx.delete(conversationsTable).where(eq(conversationsTable.guruId, id)).run();
    tx.delete(gurusTable).where(eq(gurusTable.id, id)).run();
  });
  return c.json({ deleted: true });
});

// Persist per-Guru selections, including an explicit empty list.
router.put('/:id/skills', async (c) => {
  const id = c.req.param('id');
  const guru = db.select().from(gurusTable).where(eq(gurusTable.id, id)).get();
  if (!guru) return c.json({ error: 'Guru not found' }, 404);
  const body = await c.req.json().catch(() => null);
  let skills: string[];
  try { skills = parseGuruSkills(JSON.stringify(body?.skills)); }
  catch (error) { return c.json({ error: (error as Error).message }, 400); }
  db.update(gurusTable).set({ defaultSkills: JSON.stringify(skills), updatedAt: Date.now() })
    .where(eq(gurusTable.id, id)).run();
  return c.json({ skills });
});

export default router;
