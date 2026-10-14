import { Hono } from 'hono';
import { repository, type Guru, type Conversation } from '../db/repository.js';
import { nanoid } from 'nanoid';
import { listAvailableSkills, parseGuruSkills } from '../services/nio-skills.js';
import { isConversationRunning } from './chat.js';
import { streamNioTurn, getAvailableModels } from '../services/nio-runner.js';
import { getPreferredNioModelId } from '../../../../packages/shared/src/nio-models.js';
import { GURU_ICON_NAMES } from '../../../../packages/shared/src/guru-icons.js';

const router = new Hono();

function parseGuruDraft(content: string, name: string, availableSkillNames: string[]): {
  tagline: string;
  instructions: string;
  icon: string;
  skills: string[];
} {
  let draft: any = null;

  // 1. Try standard JSON parsing on the matched object
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      draft = JSON.parse(jsonMatch[0]);
    } catch {
      // Clean potential unescaped newlines inside JSON string values
      try {
        const sanitized = jsonMatch[0].replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_, inner) => {
          return `"${inner.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
        });
        draft = JSON.parse(sanitized);
      } catch {
        // Fall back to regex-based extraction
      }
    }
  }

  // 2. Fallback to regex extraction if JSON.parse failed
  let tagline = typeof draft?.tagline === 'string' ? draft.tagline.trim().slice(0, 180) : '';
  let instructions = typeof draft?.instructions === 'string' ? draft.instructions.trim().slice(0, 12000) : '';
  let rawIcon = typeof draft?.icon === 'string' ? draft.icon.trim() : '';
  let rawSkills = Array.isArray(draft?.skills) ? draft.skills : [];

  if (!tagline) {
    const m = content.match(/(?:"tagline"|tagline)\s*:\s*"([^"]+)"/i);
    if (m) tagline = m[1].trim().slice(0, 180);
  }

  if (!instructions) {
    const m = content.match(/(?:"instructions"|instructions)\s*:\s*"([\s\S]*?)(?:"\s*,\s*"(?:icon|skills)"|"\s*\}|$)/i);
    if (m) instructions = m[1].trim().replace(/\\n/g, '\n').slice(0, 12000);
  }

  if (!rawIcon) {
    const m = content.match(/(?:"icon"|icon)\s*:\s*"([^"]+)"/i);
    if (m) rawIcon = m[1].trim();
  }

  if (!rawSkills.length) {
    const m = content.match(/(?:"skills"|skills)\s*:\s*\[([\s\S]*?)\]/i);
    if (m) {
      rawSkills = [...m[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
    }
  }

  // 3. Fallbacks if still missing
  if (!tagline) {
    tagline = `AI specialist focused on ${name} and related problem-solving.`;
  }
  if (!instructions) {
    instructions = `You are ${name}, a dedicated specialist. Provide thoughtful, well-reasoned answers tailored to the user's needs with clear structure and practical advice. Maintain focus on ${name} and avoid speculative or unverified claims.`;
  }

  const iconLower = rawIcon.toLowerCase();
  const icon = GURU_ICON_NAMES.find(candidate => candidate.toLowerCase() === iconLower)
    || (/(?:math|physics|scientist|einstein|think|brain|mind|analysis)/i.test(name) ? 'Brain' : 'Sparkles');

  const enabled = new Set(availableSkillNames);
  const skills = [...new Set<string>(rawSkills.filter((skill: unknown) =>
    typeof skill === 'string' && enabled.has(skill)))].slice(0, 3);

  return { tagline, instructions, icon, skills };
}

// Generate a draft for the Add Guru form without creating a conversation.
router.post('/suggest', async (c) => {
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80) return c.json({ error: 'Enter a Guru name (up to 80 characters) first.' }, 400);

  const available = listAvailableSkills().filter(skill => skill.enabled);
  const skillNames = available.map(s => s.name).join(', ');
  const prompt = `Create a custom AI chat specialist named ${JSON.stringify(name)}. Return ONLY a single raw JSON object with keys "tagline", "instructions", "icon", "skills". No markdown fences, no text before or after the JSON.\n` +
    `- tagline: one concise sentence (under 180 chars) describing what this specialist helps with.\n` +
    `- instructions: 3-5 sentences describing expertise, personality, and tone. Chat-only persona with no local filesystem access.\n` +
    `- icon: one relevant icon name (e.g. Brain, Lightbulb, Rocket, Cpu, Palette, CodeXml, Database, Globe, Scale, BookOpen, Sparkles).\n` +
    `- skills: array of 0-2 skill names chosen from: [${skillNames}]. Use [] if none match.`;

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
    const timeout = setTimeout(() => handle.kill(), 45_000);
    const onAbort = () => handle.kill();
    c.req.raw.signal.addEventListener('abort', onAbort, { once: true });
    try { await handle.finished; }
    finally { clearTimeout(timeout); c.req.raw.signal.removeEventListener('abort', onAbort); }

    if (runError && !content.trim()) return c.json({ error: runError }, 502);

    const draft = parseGuruDraft(content, name, available.map(s => s.name));
    return c.json(draft);
  } catch (error) {
    console.warn('[nio-guru] Guru suggestion failed:', error);
    // If generation threw but name is valid, provide a graceful fallback draft instead of a hard 502 error
    const fallback = parseGuruDraft('', name, available.map(s => s.name));
    return c.json(fallback);
  }
});

router.get('/', async c => {
  const gurus = (await repository.gurus.list()).map(item => item.value);
  const conversations = (await repository.conversations.list()).map(item => item.value);
  const latest = new Map<string, Conversation>();
  for (const conversation of conversations) {
    const previous = latest.get(conversation.guruId);
    if (!previous || conversation.updatedAt > previous.updatedAt) latest.set(conversation.guruId, conversation);
  }
  const result = await Promise.all(gurus.map(async guru => {
    const conversation = latest.get(guru.id);
    const message = conversation ? await repository.messages.latest(conversation.id) : null;
    return { ...guru, lastMessage: message ? {
      role: message.role, content: message.content, createdAt: message.createdAt,
    } : null };
  }));
  result.sort((a, b) => Number(b.isPinned) - Number(a.isPinned)
    || (a.id === 'direct-chat' ? -1 : b.id === 'direct-chat' ? 1 : a.name.localeCompare(b.name)));
  return c.json({ gurus: result });
});

router.get('/:id', async c => {
  const guru = (await repository.gurus.get(c.req.param('id')))?.value;
  return guru ? c.json({ guru }) : c.json({ error: 'Guru not found' }, 404);
});

router.put('/:id/pin', async c => {
  const record = await repository.gurus.get(c.req.param('id'));
  if (!record) return c.json({ error: 'Guru not found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const isPinned = typeof body.isPinned === 'boolean' ? body.isPinned : !record.value.isPinned;
  await repository.gurus.update(record, { isPinned, updatedAt: Date.now() });
  return c.json({ success: true, isPinned });
});

router.post('/', async c => {
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const tagline = typeof body?.tagline === 'string' ? body.tagline.trim() : '';
  const systemPrompt = typeof body?.systemPrompt === 'string' ? body.systemPrompt.trim() : '';
  const icon = typeof body?.icon === 'string' && GURU_ICON_NAMES.some(candidate => candidate === body.icon)
    ? body.icon : 'Sparkles';
  if (!name || name.length > 80 || tagline.length > 180 || !systemPrompt || systemPrompt.length > 12000)
    return c.json({ error: 'Enter a name and instructions. Keep the name under 80 characters and instructions under 12,000 characters.' }, 400);
  let skills: string[];
  try { skills = parseGuruSkills(JSON.stringify(body.defaultSkills ?? [])); }
  catch (error) { return c.json({ error: (error as Error).message }, 400); }
  const available = new Set(listAvailableSkills().filter(skill => skill.enabled).map(skill => skill.name));
  if (skills.some(skill => !available.has(skill)))
    return c.json({ error: 'Some selected skills are unavailable. Refresh the list and try again.' }, 400);
  const now = Date.now();
  const guru: Guru = {
    id: `custom-${nanoid(8)}`, name, tagline: tagline || 'Custom Guru',
    category: 'custom', categoryLabel: 'Custom', icon, color: 'teal',
    isPinned: false, isCustom: true, systemPrompt, defaultSkills: skills,
    widgetType: 'none', samplePrompts: [], createdAt: now, updatedAt: now,
  };
  await repository.gurus.create(guru);
  return c.json({ guru }, 201);
});

router.delete('/:id', async c => {
  const record = await repository.gurus.get(c.req.param('id'));
  if (!record) return c.json({ error: 'Guru not found.' }, 404);
  if (!record.value.isCustom) return c.json({ error: 'Built-in Gurus cannot be deleted.' }, 403);
  const conversations = await repository.conversations.list(record.value.id);
  if (conversations.some(conversation => isConversationRunning(conversation.value.id)))
    return c.json({ error: 'Stop this Guru’s current response before deleting it.' }, 409);
  try { await repository.gurus.delete(record); }
  catch (error) {
    if (['lease_conflict', 'deletion_in_progress'].includes((error as { code?: string }).code || ''))
      return c.json({ error: 'Stop this Guru’s current response before deleting it.' }, 409);
    throw error;
  }
  return c.json({ deleted: true });
});

router.put('/:id/skills', async c => {
  const record = await repository.gurus.get(c.req.param('id'));
  if (!record) return c.json({ error: 'Guru not found' }, 404);
  const body = await c.req.json().catch(() => null);
  let skills: string[];
  try { skills = parseGuruSkills(JSON.stringify(body?.skills)); }
  catch (error) { return c.json({ error: (error as Error).message }, 400); }
  await repository.gurus.update(record, { defaultSkills: skills, updatedAt: Date.now() });
  return c.json({ skills });
});

// Knowledge Base Endpoints
router.get('/:id/documents', async c => {
  const guruId = c.req.param('id');
  const guru = await repository.gurus.get(guruId);
  if (!guru) return c.json({ error: 'Guru not found' }, 404);
  const docs = await repository.documents.list(guruId);
  return c.json({ documents: docs });
});

router.post('/:id/documents', async c => {
  const guruId = c.req.param('id');
  const guru = await repository.gurus.get(guruId);
  if (!guru) return c.json({ error: 'Guru not found' }, 404);

  let filename = '';
  let content = '';
  let fileType = 'text/plain';
  let fileSize = 0;

  try {
    if (c.req.header('content-type')?.includes('multipart/form-data')) {
      const form = await c.req.formData();
      const file = form.get('file');
      if (file instanceof File) {
        filename = file.name;
        fileType = file.type || 'text/plain';
        fileSize = file.size;
        content = await file.text();
      }
    } else {
      const body = await c.req.json().catch(() => ({}));
      filename = typeof body.filename === 'string' ? body.filename.trim() : '';
      content = typeof body.content === 'string' ? body.content.trim() : '';
      fileType = typeof body.fileType === 'string' ? body.fileType : 'text/plain';
      fileSize = Buffer.byteLength(content, 'utf8');
    }
  } catch (err) {
    return c.json({ error: 'Could not parse document upload.' }, 400);
  }

  if (!filename || !content) {
    return c.json({ error: 'Filename and text content are required.' }, 400);
  }

  // Max 500KB per document
  if (fileSize > 500 * 1024) {
    return c.json({ error: 'Document must be 500 KB or less.' }, 413);
  }

  const docId = `doc-${nanoid(10)}`;
  const doc = {
    id: docId,
    guruId,
    filename,
    fileType,
    fileSize,
    content,
    createdAt: Date.now(),
  };

  await repository.documents.create(doc);
  return c.json({ document: doc }, 201);
});

router.delete('/:id/documents/:docId', async c => {
  const guruId = c.req.param('id');
  const docId = c.req.param('docId');
  const doc = await repository.documents.get(docId);
  if (!doc || doc.value.guruId !== guruId) {
    return c.json({ error: 'Document not found' }, 404);
  }

  await repository.documents.delete(doc);
  return c.json({ success: true, deletedId: docId });
});

export default router;
