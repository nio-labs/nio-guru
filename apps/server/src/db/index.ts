import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import * as schema from './schema.js';
import { DEFAULT_GURUS } from '@nio-labs/nio-guru-personas';
import { eq } from 'drizzle-orm';

function getDatabasePath(): string {
  // Support persistent storage e.g. /data on Railway or custom env
  if (process.env.DATABASE_PATH) {
    return process.env.DATABASE_PATH;
  }
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    return path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'openguru.db');
  }
  const defaultDir = path.join(os.homedir(), '.openguru');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return path.join(defaultDir, 'openguru.db');
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
      model TEXT NOT NULL DEFAULT 'kilo-auto/free',
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

  // Seed default gurus if not present
  const now = Date.now();
  for (const guru of DEFAULT_GURUS) {
    const existing = db.select().from(schema.gurusTable).where(eq(schema.gurusTable.id, guru.id)).get();
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
