import { DEFAULT_NIO_MODEL_ID } from '../../../../packages/shared/src/nio-models.js';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import * as schema from './schema.js';
import { DEFAULT_GURUS } from '../../../../packages/gurus/src/index.js';
import { eq } from 'drizzle-orm';

function getDatabasePath(): string {
  // Support persistent storage e.g. /data on Railway or custom env
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    const directory = process.env.RAILWAY_VOLUME_MOUNT_PATH;
    const current = path.join(directory, 'nioguru.db');
    const legacy = path.join(directory, 'openguru.db');
    return fs.existsSync(current) || !fs.existsSync(legacy) ? current : legacy;
  }
  const current = path.join(os.homedir(), '.nioguru', 'nioguru.db');
  const legacy = path.join(os.homedir(), '.openguru', 'openguru.db');
  const selected = fs.existsSync(current) || !fs.existsSync(legacy) ? current : legacy;
  fs.mkdirSync(path.dirname(selected), { recursive: true });
  return selected;
}

const dbPath = getDatabasePath();
console.log(`[nio-guru-server] SQLite database path: ${dbPath}`);

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export function initDatabase() {
  // Create tables if not exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS gurus (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      category TEXT NOT NULL,
      category_label TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_custom INTEGER NOT NULL DEFAULT 0,
      system_prompt TEXT NOT NULL DEFAULT '',
      default_skills TEXT NOT NULL DEFAULT '[]',
      widget_type TEXT NOT NULL DEFAULT 'none',
      sample_prompts TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      guru_id TEXT NOT NULL REFERENCES gurus(id),
      title TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '${DEFAULT_NIO_MODEL_ID}',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      thought TEXT NOT NULL DEFAULT '',
      tool_calls TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  sqlite.exec('CREATE INDEX IF NOT EXISTS messages_conversation_page_idx ON messages (conversation_id, created_at DESC, id DESC)');
  const messageColumns = sqlite.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>;
  if (!messageColumns.some(column => column.name === 'attachments')) {
    sqlite.exec("ALTER TABLE messages ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'");
  }

  const legacySkills: Record<string, string[]> = {"direct-chat": [], "frontend-guru": ["web-components", "css-animation", "bundle-analyzer"], "backend-guru": ["sql-optimizer", "api-benchmark", "schema-gen"], "architect-guru": ["system-design-eval", "cloud-cost", "mermaid-gen"], "devops-guru": ["dockerfile-linter", "k8s-validator", "ci-builder"], "security-guru": ["code-security-audit", "cve-scanner", "secret-detector"], "debug-guru": ["stacktrace-demangler", "heap-profiler", "repro-builder"], "finance-guru": ["sec-filings", "dcf-calculator", "financial-ratios"], "trading-guru": ["candlestick-scanner", "technical-indicators", "risk-model"], "product-guru": ["prd-generator", "user-story-mapper", "sprint-planner"], "research-guru": ["web-search", "paper-summarizer", "citation-linker"]};

  // Seed defaults and migrate only untouched legacy skill lists.
  const now = Date.now();
  for (const guru of DEFAULT_GURUS) {
    const existing = db.select().from(schema.gurusTable).where(eq(schema.gurusTable.id, guru.id)).get();
    if (existing && !existing.isCustom) {
      let previous: unknown;
      try { previous = JSON.parse(existing.defaultSkills); } catch { previous = null; }
      const old = legacySkills[guru.id];
      const shouldUpdateSkills = !existing.defaultSkills || (old?.length && Array.isArray(previous) && previous.length === old.length
        && old.every(name => previous.includes(name)));

      db.update(schema.gurusTable).set({
        name: guru.name,
        tagline: guru.tagline,
        category: guru.category,
        categoryLabel: guru.categoryLabel,
        icon: guru.icon,
        color: guru.color,
        systemPrompt: guru.systemPrompt,
        widgetType: guru.widgetType,
        samplePrompts: JSON.stringify(guru.samplePrompts),
        ...(shouldUpdateSkills ? { defaultSkills: JSON.stringify(guru.defaultSkills) } : {}),
        updatedAt: now,
      }).where(eq(schema.gurusTable.id, guru.id)).run();
    }
    if (!existing) {
      db.insert(schema.gurusTable).values({
        id: guru.id,
        name: guru.name,
        tagline: guru.tagline,
        category: guru.category,
        categoryLabel: guru.categoryLabel,
        icon: guru.icon,
        color: guru.color,
        isPinned: guru.isPinned,
        isCustom: false,
        systemPrompt: guru.systemPrompt,
        defaultSkills: JSON.stringify(guru.defaultSkills),
        widgetType: guru.widgetType,
        samplePrompts: JSON.stringify(guru.samplePrompts),
        createdAt: now,
        updatedAt: now,
      }).run();
    }
  }
}
