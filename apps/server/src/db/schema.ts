import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const gurusTable = sqliteTable('gurus', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull(),
  category: text('category').notNull(),
  categoryLabel: text('category_label').notNull(),
  icon: text('icon').notNull(),
  color: text('color').notNull(),
  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
  systemPrompt: text('system_prompt').notNull().default(''),
  defaultSkills: text('default_skills').notNull().default('[]'),
  widgetType: text('widget_type').notNull().default('none'),
  samplePrompts: text('sample_prompts').notNull().default('[]'),
  createdAt: integer('created_at').notNull().default(Date.now()),
  updatedAt: integer('updated_at').notNull().default(Date.now()),
});

export const conversationsTable = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  guruId: text('guru_id').notNull().references(() => gurusTable.id),
  title: text('title').notNull(),
  model: text('model').notNull().default('kilo-auto/free'),
  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(Date.now()),
  updatedAt: integer('updated_at').notNull().default(Date.now()),
});

export const messagesTable = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull().references(() => conversationsTable.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull().default(''),
  thought: text('thought').notNull().default(''),
  toolCalls: text('tool_calls').notNull().default('[]'),
  createdAt: integer('created_at').notNull().default(Date.now()),
});

export const settingsTable = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull().default(Date.now()),
});
