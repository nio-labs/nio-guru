import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { initDatabase, repository } from './db/repository.js';
import gurusRouter from './routes/gurus.js';
import conversationsRouter from './routes/conversations.js';
import chatRouter from './routes/chat.js';
import modelsRouter from './routes/models.js';
import { listAvailableSkills } from './services/nio-skills.js';
import { findNioBinary } from './services/nio-runner.js';

dotenv.config();

const app = new Hono();

// A fresh NioDB workspace must be ready before the application accepts requests.
await initDatabase();

app.onError((error, c) => {
  console.error('[nio-guru-server] Request failed:', error);
  const code = (error as { code?: string }).code;
  if (['unique_conflict', 'reference_conflict', 'revision_conflict', 'lease_conflict',
    'deletion_in_progress'].includes(code || ''))
    return c.json({ error: 'The record changed or is in use. Refresh and try again.' }, 409);
  if (code === 'deletion_job_too_large')
    return c.json({ error: 'This deletion exceeds the current NioDB job limit.' }, 413);
  return c.json({ error: 'Storage is unavailable. Please try again.' }, 503);
});

app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-App-Password'],
}));

// Optional Password Protection Middleware
app.use('/api/*', async (c, next) => {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword || appPassword.trim().length === 0) {
    return next();
  }

  // Health check always allowed
  if (c.req.path === '/api/health') {
    return next();
  }

  const providedPass = c.req.header('X-App-Password') || c.req.query('password');
  if (providedPass !== appPassword) {
    return c.json({ error: 'Unauthorized: invalid or missing APP_PASSWORD' }, 401);
  }

  return next();
});

// API Routes
app.get('/api/health', async c => {
  try {
    await repository.health();
    return c.json({ status: 'ok', version: '0.3.2', engine: 'nio-ai', storage: 'niodb' });
  } catch {
    return c.json({ status: 'unavailable', storage: 'niodb' }, 503);
  }
});
app.get('/api/skills', (c) => {
  try { return c.json({ skills: listAvailableSkills() }); }
  catch (error) { return c.json({ error: (error as Error).message }, 500); }
});
app.post('/api/skills/install', async (c) => {
  const body = await c.req.json().catch(() => null);
  const source = typeof body?.source === 'string' ? body.source.trim() : '';
  const folder = typeof body?.folder === 'string' ? body.folder.trim() : '';
  let url: URL;
  try { url = new URL(source); }
  catch { return c.json({ error: 'Enter a GitHub repository or skill-folder URL.' }, 400); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password
    || url.search || url.hash || url.pathname.split('/').filter(Boolean).length < 2) {
    return c.json({ error: 'Enter an HTTPS github.com repository or skill-folder URL.' }, 400);
  }
  if (folder && (folder.length > 200 || folder.startsWith('-') || folder.startsWith('/')
    || folder.split(/[\\/]/).some((part: string) => part === '..') || /[\x00-\x1f]/.test(folder))) {
    return c.json({ error: 'Enter a relative skill folder inside the repository.' }, 400);
  }
  const [owner, repositoryName] = url.pathname.split('/').filter(Boolean);
  const repository = `${url.origin}/${owner}/${repositoryName.replace(/\.git$/, '')}`;
  const requestedName = folder.split(/[\\/]/).filter(Boolean).at(-1);
  const installedForRequest = (skills: ReturnType<typeof listAvailableSkills>) => skills.filter(skill =>
    skill.enabled && skill.source.replace(/\.git$/, '').replace(/\/$/, '') === repository
    && (!requestedName || skill.name === requestedName));
  try {
    const beforeSkills = listAvailableSkills();
    const installed = installedForRequest(beforeSkills);
    if (installed.length) return c.json({ skills: beforeSkills, installedNames: installed.map(skill => skill.name), alreadyInstalled: true });
    const before = new Set(beforeSkills.map(skill => skill.name));
    try {
      await promisify(execFile)(findNioBinary(), ['skills', 'add', source, ...(folder ? [folder] : [])], {
        timeout: 120_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    } catch (error) {
      // The CLI may finish installation before reporting a later failure.
      const skills = listAvailableSkills();
      const installed = installedForRequest(skills);
      if (installed.length) return c.json({ skills, installedNames: installed.map(skill => skill.name), alreadyInstalled: true });
      throw error;
    }
    const skills = listAvailableSkills();
    return c.json({ skills, installedNames: skills.filter(skill => !before.has(skill.name) && skill.enabled).map(skill => skill.name) });
  } catch (error) {
    console.warn('[nio-guru] Skill installation failed:', error);
    const detail = String((error as { stderr?: string }).stderr || (error as Error).message || '');
    const message = /timeout|timed out|ETIMEDOUT/i.test(detail) ? 'GitHub took too long to respond. Try again.'
      : /not found|no such file|SKILL\.md/i.test(detail) ? `GitHub repository or skill folder not found. Check ${repository} and the folder path.`
      : /too large|package limit|exceeds/i.test(detail) ? 'This skill package is too large for Nio.'
      : /git.*not found|ENOENT/i.test(detail) ? 'Git is not available on the NioGuru server.'
      : `Could not install this skill from ${repository}. Check the repository spelling, folder path, Git access, and network connection.`;
    return c.json({ error: message }, 400);
  }
});
app.route('/api/gurus', gurusRouter);
app.route('/api/conversations', conversationsRouter);
app.route('/api/chat', chatRouter);
app.route('/api/models', modelsRouter);

// Serve Static Frontend if built
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticWebDir = path.resolve(__dirname, '../../web/dist');

if (fs.existsSync(staticWebDir)) {
  console.log(`[nio-guru-server] Serving static frontend from: ${staticWebDir}`);

  app.get('*', async (c) => {
    const reqPath = c.req.path === '/' ? '/index.html' : c.req.path;
    const filePath = path.join(staticWebDir, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      const fileBytes = fs.readFileSync(filePath);
      return c.body(fileBytes, 200, { 'Content-Type': contentType });
    }

    // SPA fallback: serve index.html for client-side routing
    const indexPath = path.join(staticWebDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      const indexBytes = fs.readFileSync(indexPath);
      return c.body(indexBytes, 200, { 'Content-Type': 'text/html' });
    }

    return c.text('NioGuru Web assets not built yet. Run pnpm build.', 404);
  });
}

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

serve({
  fetch: app.fetch,
  port,
  hostname: host,
}, (info) => {
  console.log(`[nio-guru-server] NioGuru server listening at http://${info.address}:${info.port}`);
});

export default app;
