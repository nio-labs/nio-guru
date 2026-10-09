import 'dotenv/config';
import { NioDB, type Lease, type Mutation, type MutationResult } from '@nio-labs/nio-db.js';
import { nanoid } from 'nanoid';
import { DEFAULT_GURUS } from '../../../../packages/gurus/src/index.js';

const COLLECTION = {
  guru: 'nioguru_gurus', conversation: 'nioguru_conversations',
  message: 'nioguru_messages', setting: 'nioguru_settings',
  document: 'nioguru_documents',
} as const;
type Collection = typeof COLLECTION[keyof typeof COLLECTION];
export type { Lease };
export interface Guru {
  id: string; name: string; tagline: string; category: string; categoryLabel: string;
  icon: string; color: string; isPinned: boolean; isCustom: boolean;
  systemPrompt: string; defaultSkills: string[]; widgetType: string;
  samplePrompts: string[]; createdAt: number; updatedAt: number;
}
export interface GuruDocument {
  id: string; guruId: string; filename: string; fileType: string;
  fileSize: number; content: string; createdAt: number;
}
export interface Conversation {
  id: string; guruId: string; title: string; model: string;
  isPinned: boolean; createdAt: number; updatedAt: number;
  previewRole?: string | null; previewContent?: string | null; previewAt?: number | null;
}
export interface Message {
  id: string; conversationId: string; role: 'user' | 'assistant' | 'system';
  content: string; thought: string; toolCalls: unknown[];
  attachments: unknown[]; createdAt: number;
}
export interface Stored<T> { recordId: string; revision: number; value: T; }
export function publicConversation(conversation: Conversation) {
  const { previewRole: _role, previewContent: _content, previewAt: _at, ...publicValue } = conversation;
  return publicValue;
}
export function conversationPreview(conversation: Conversation) {
  return conversation.previewRole && conversation.previewAt
    ? { role: conversation.previewRole, content: conversation.previewContent || '', createdAt: conversation.previewAt }
    : null;
}

let client: NioDB | undefined;
function db(): NioDB {
  if (client) return client;
  const url = process.env.NIODB_URL;
  const token = process.env.NIODB_TOKEN;
  if (!url || !token) throw new Error('NIODB_URL and NIODB_TOKEN are required');
  client = new NioDB({ url, token, timeoutMs: 15_000, maxResponseBytes: 8 * 1024 * 1024 });
  return client;
}
function decode<T>(row: Record<string, unknown>): Stored<T> {
  const { id, appId, revision, type: _type, collection: _collection,
    created_at: _created, updated_at: _updated, ...data } = row;
  if (typeof id !== 'string' || typeof appId !== 'string' || typeof revision !== 'number')
    throw new Error('NioDB returned an invalid application record');
  return { recordId: id, revision, value: { id: appId, ...data } as T };
}
function fromMutation<T>(result: MutationResult): Stored<T> {
  const record = result.records[0];
  if (!record) throw new Error('NioDB mutation returned no record');
  return decode<T>({ ...record.data, id: record.id, revision: record.revision });
}
function encode<T extends { id: string }>(value: T): Record<string, unknown> {
  const { id, ...data } = value;
  return { appId: id, ...data };
}
async function rows<T>(sql: string, parameters: unknown[] = []): Promise<Stored<T>[]> {
  const result = await db().query(sql, parameters);
  return result.items.map((item: Record<string, unknown>) => decode<T>(item));
}
async function get<T>(collection: Collection, appId: string): Promise<Stored<T> | null> {
  return (await rows<T>(`SELECT * FROM ${collection} WHERE appId = $1 LIMIT 1`, [appId]))[0] ?? null;
}
async function list<T>(collection: Collection, filter?: { field: 'guruId' | 'conversationId'; value: string }): Promise<Stored<T>[]> {
  const all: Stored<T>[] = [];
  let cursor = '';
  for (;;) {
    const where = filter ? `${filter.field} = $1 AND appId > $2` : 'appId > $1';
    const parameters = filter ? [filter.value, cursor] : [cursor];
    const page = await rows<T>(`SELECT * FROM ${collection} WHERE ${where} ORDER BY appId LIMIT 200`, parameters);
    all.push(...page);
    if (page.length < 200) return all;
    if (all.length >= 100_000) throw new Error('NioDB application collection exceeds list capacity');
    cursor = (page.at(-1)!.value as { id: string }).id;
  }
}
async function commit(operations: Mutation[], key: string, lease?: Lease): Promise<MutationResult> {
  const request = { idempotency_key: key, operations,
    ...(lease ? { leases: [{ resource: lease.resource, owner: lease.owner, fence: lease.fence }] } : {}) };
  return db().mutate(request);
}
async function create<T extends { id: string }>(collection: Collection, value: T, key = `create:${collection}:${value.id}`, lease?: Lease): Promise<Stored<T>> {
  return fromMutation<T>(await commit([{ action: 'create', collection, data: encode(value) }], key, lease));
}
async function update<T>(record: Stored<T>, fields: Partial<T>, lease?: Lease): Promise<Stored<T>> {
  return fromMutation<T>(await commit([{ action: 'update', id: record.recordId,
    expected_revision: record.revision, data: fields as Record<string, unknown> }], `update:${nanoid()}`, lease));
}
async function removeTree(recordId: string): Promise<void> {
  let job = (await db().startDeletionJob(recordId, `delete:${recordId}`)).job;
  const deadline = Date.now() + 120_000;
  while (job.status !== 'complete' && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
    job = (await db().getDeletionJob(job.id)).job;
  }
  if (job.status !== 'complete') throw new Error(`Deletion job ${job.id} remains pending`);
}
async function withConversationLease<T>(id: string, operation: (lease: Lease) => Promise<T>): Promise<T> {
  const lease = (await db().acquireLease(`conversation:${id}`, `edit:${nanoid()}`)).lease;
  try { return await operation(lease); }
  finally {
    try { await db().releaseLease(lease); }
    catch (error) { console.warn('[nio-guru-server] Lease release failed; it will expire:', error); }
  }
}

export const repository = {
  health: () => db().getPersistenceStatus(),
  gurus: {
    get: (id: string) => get<Guru>(COLLECTION.guru, id),
    list: () => list<Guru>(COLLECTION.guru),
    create: (value: Guru, key?: string) => create<Guru>(COLLECTION.guru, value, key),
    update: (record: Stored<Guru>, fields: Partial<Guru>) => update(record, fields),
    delete: (record: Stored<Guru>) => removeTree(record.recordId),
  },
  conversations: {
    get: (id: string) => get<Conversation>(COLLECTION.conversation, id),
    list: (guruId?: string) => list<Conversation>(COLLECTION.conversation, guruId ? { field: 'guruId', value: guruId } : undefined),
    create: (value: Conversation) => withConversationLease(value.id, lease => create<Conversation>(COLLECTION.conversation, value, `conversation:${value.id}`, lease)),
    update: (record: Stored<Conversation>, fields: Partial<Conversation>, lease?: Lease) => lease
      ? update(record, fields, lease)
      : withConversationLease(record.value.id, owned => update(record, fields, owned)),
    delete: (record: Stored<Conversation>) => removeTree(record.recordId),
  },
  messages: {
    async page(conversationId: string, beforeAt?: number, beforeId?: string) {
      const cursor = beforeAt !== undefined && beforeId ? ' AND (createdAt < $2 OR (createdAt = $2 AND appId < $3))' : '';
      const params = cursor ? [conversationId, beforeAt, beforeId] : [conversationId];
      const result = await rows<Message>(`SELECT * FROM ${COLLECTION.message} WHERE conversationId = $1${cursor} ORDER BY createdAt DESC, appId DESC LIMIT 31`, params);
      return { messages: result.slice(0, 30).map(item => item.value).reverse(), hasMore: result.length > 30 };
    },
    async latest(conversationId: string): Promise<Message | null> {
      const result = await rows<Message>(`SELECT * FROM ${COLLECTION.message} WHERE conversationId = $1 ORDER BY createdAt DESC, appId DESC LIMIT 1`, [conversationId]);
      return result[0]?.value ?? null;
    },
    async delete(conversationId: string, messageId: string): Promise<void> {
      await withConversationLease(conversationId, async lease => {
        const conversation = await get<Conversation>(COLLECTION.conversation, conversationId);
        if (!conversation) return;
        const [message] = await rows<Message>(
          `SELECT * FROM ${COLLECTION.message} WHERE appId = $1 AND conversationId = $2 LIMIT 1`,
          [messageId, conversationId]);
        if (!message) return;
        const [latest] = await rows<Message>(
          `SELECT * FROM ${COLLECTION.message} WHERE conversationId = $1 ORDER BY createdAt DESC, appId DESC LIMIT 1`,
          [conversationId]);
        const operations: Mutation[] = [{ action: 'delete', id: message.recordId, expected_revision: message.revision }];
        if (latest?.value.id === messageId) {
          const [previous] = await rows<Message>(
            `SELECT * FROM ${COLLECTION.message} WHERE conversationId = $1 AND (createdAt < $2 OR (createdAt = $2 AND appId < $3)) ORDER BY createdAt DESC, appId DESC LIMIT 1`,
            [conversationId, message.value.createdAt, messageId]);
          const preview = previous?.value;
          operations.push({ action: 'update', id: conversation.recordId,
            expected_revision: conversation.revision, data: {
              previewRole: preview?.role ?? null,
              previewContent: preview ? Array.from(preview.content).slice(0, 100).join('') : null,
              previewAt: preview?.createdAt ?? null,
              updatedAt: preview?.createdAt ?? conversation.value.createdAt,
            } });
        }
        await commit(operations, `delete-message:${messageId}`, lease);
      });
    },
    create: (value: Message, lease: Lease) => create<Message>(COLLECTION.message, value, `message:${value.id}`, lease),
    async createWithConversationUpdate(value: Message, conversation: Stored<Conversation>, fields: Partial<Conversation>, lease: Lease) {
      const result = await commit([
        { action: 'create', collection: COLLECTION.message, data: encode(value) },
        { action: 'update', id: conversation.recordId, expected_revision: conversation.revision, data: fields as Record<string, unknown> },
      ], `message:${value.id}`, lease);
      if (!result.records[1]) throw new Error('NioDB mutation omitted conversation update');
      return {
        message: fromMutation<Message>(result),
        conversation: decode<Conversation>({ ...result.records[1].data, id: result.records[1].id, revision: result.records[1].revision }),
      };
    },
    async search(query: string, options?: { guruId?: string; limit?: number }) {
      const trimmed = query.trim();
      if (!trimmed) return [];
      const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
      const pattern = `%${trimmed}%`;
      const sql = `SELECT * FROM ${COLLECTION.message} WHERE content LIKE $1 ORDER BY createdAt DESC LIMIT $2`;
      const matches = await rows<Message>(sql, [pattern, limit]);
      return matches.map(m => m.value);
    },
  },
  documents: {
    get: (id: string) => get<GuruDocument>(COLLECTION.document, id),
    list: async (guruId: string) => {
      const docs = await rows<GuruDocument>(
        `SELECT * FROM ${COLLECTION.document} WHERE guruId = $1 ORDER BY createdAt DESC LIMIT 100`,
        [guruId]
      );
      return docs.map(d => d.value);
    },
    create: (value: GuruDocument) => create<GuruDocument>(COLLECTION.document, value, `doc:${value.id}`),
    delete: (record: Stored<GuruDocument>) => removeTree(record.recordId),
  },
  leases: {
    acquire: async (id: string, owner: string) => (await db().acquireLease(`conversation:${id}`, owner)).lease,
    renew: async (lease: Lease) => (await db().renewLease(lease)).lease,
    release: async (lease: Lease) => { await db().releaseLease(lease); },
  },
};

export async function initDatabase(): Promise<void> {
  await repository.health();
  await db().configureCollection(COLLECTION.guru, { unique: ['appId'] });
  await db().configureCollection(COLLECTION.document, { unique: ['appId'],
    references: [{ field: 'guruId', collection: COLLECTION.guru, target_field: 'appId' }] });
  await db().configureCollection(COLLECTION.conversation, { unique: ['appId'],
    references: [{ field: 'guruId', collection: COLLECTION.guru, target_field: 'appId' }],
    lease: { field: 'appId', prefix: 'conversation:' } });
  await db().configureCollection(COLLECTION.message, { unique: ['appId'],
    references: [{ field: 'conversationId', collection: COLLECTION.conversation, target_field: 'appId' }],
    lease: { field: 'conversationId', prefix: 'conversation:' } });
  await db().configureCollection(COLLECTION.setting, { unique: ['appId'] });
  for (const guru of DEFAULT_GURUS) {
    const existing = await repository.gurus.get(guru.id);
    if (!existing) {
      await repository.gurus.create({ ...guru, isCustom: false, createdAt: 0, updatedAt: 0 }, `seed:guru:${guru.id}:v1`);
    } else if (!existing.value.isCustom) {
      const { id: _id, isPinned: _pinned, defaultSkills: _skills, ...metadata } = guru;
      const changed = Object.entries(metadata).some(([field, value]) => JSON.stringify((existing.value as unknown as Record<string, unknown>)[field]) !== JSON.stringify(value));
      if (changed) await repository.gurus.update(existing, { ...metadata, updatedAt: Date.now() });
    }
  }
  console.log('[nio-guru-server] NioDB connected and built-in Gurus seeded');
}
