import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { initDatabase } from './db/index.js';
import gurusRouter from './routes/gurus.js';
import conversationsRouter from './routes/conversations.js';
import chatRouter from './routes/chat.js';
import modelsRouter from './routes/models.js';

dotenv.config();

const app = new Hono();

// Initialize SQLite database & seed default Gurus
initDatabase();

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
app.get('/api/health', (c) => c.json({ status: 'ok', version: '0.1.0', engine: 'nio-ai' }));
app.route('/api/gurus', gurusRouter);
app.route('/api/conversations', conversationsRouter);
app.route('/api/chat', chatRouter);
app.route('/api/models', modelsRouter);

// Serve Static Frontend if built
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticWebDir = path.resolve(__dirname, '../../web/dist');

if (fs.existsSync(staticWebDir)) {
  console.log(`[openguru-server] Serving static frontend from: ${staticWebDir}`);

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

    return c.text('OpenGuru Web assets not built yet. Run pnpm build.', 404);
  });
}

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

serve({
  fetch: app.fetch,
  port,
  hostname: host,
}, (info) => {
  console.log(`[openguru-server] OpenGuru server listening at http://${info.address}:${info.port}`);
});

export default app;
