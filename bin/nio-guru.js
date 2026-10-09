#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import http from 'http';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
dotenv.config();

const isWin = os.platform() === 'win32';
const ext = isWin ? '.exe' : '';

function findNioBinary() {
  if (process.env.NIO_BIN && fs.existsSync(process.env.NIO_BIN)) {
    return process.env.NIO_BIN;
  }

  const candidates = [
    path.join(os.homedir(), '.cargo', 'bin', `nio${ext}`),
    path.join(os.homedir(), '.nio', 'bin', `nio${ext}`),
    path.join(os.homedir(), '.local', 'bin', `nio${ext}`),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  try {
    const whichCmd = isWin ? 'where nio' : 'which nio';
    const found = execSync(whichCmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0];
    if (found && fs.existsSync(found)) {
      return found;
    }
  } catch {}

  return null;
}

async function ensureNioBinary() {
  const existing = findNioBinary();
  if (existing) {
    return existing;
  }

  console.log('[nio-guru] nio CLI not detected. Automatically bundling @nio-labs/nio-ai...');

  // Attempt 1: via npx @nio-labs/nio-ai
  try {
    console.log('[nio-guru] Fetching @nio-labs/nio-ai via npm...');
    execSync('npx -y @nio-labs/nio-ai --version', { stdio: ['pipe', 'inherit', 'ignore'], timeout: 45000 });
    const found = findNioBinary();
    if (found) return found;
  } catch (err) {
    // Continue to native installer fallback
  }

  // Attempt 2: via direct install script
  try {
    console.log('[nio-guru] Installing nio via official installer...');
    if (isWin) {
      execSync('powershell -NoProfile -Command "irm https://raw.githubusercontent.com/nio-labs/nio/main/install.ps1 | iex"', {
        stdio: ['pipe', 'inherit', 'inherit'],
        timeout: 60000,
      });
    } else {
      execSync('curl -fsSL https://raw.githubusercontent.com/nio-labs/nio/main/install.sh | bash', {
        stdio: ['pipe', 'inherit', 'inherit'],
        timeout: 60000,
      });
    }
    const found = findNioBinary();
    if (found) return found;
  } catch (err) {
    console.warn(`[nio-guru] Warning: Auto-bundle failed: ${err.message}`);
    console.warn('[nio-guru] You can install nio manually with: npx @nio-labs/nio-ai');
  }

  return null;
}

function openBrowser(url) {
  // Check if WSL
  const isWsl = !isWin && fs.existsSync('/proc/version') && fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');

  if (isWsl) {
    try {
      execSync(`cmd.exe /c start "" "${url}"`, { stdio: 'ignore' });
      return;
    } catch {}
  }

  const startCmd = isWin
    ? `start "" "${url}"`
    : process.platform === 'darwin'
    ? `open "${url}"`
    : `xdg-open "${url}"`;

  try {
    execSync(startCmd, { stdio: 'ignore' });
  } catch {
    console.log(`[nio-guru] Open your browser and navigate to: ${url}`);
  }
}

function waitForServer(port, maxRetries = 300) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on('error', () => retry());
      req.setTimeout(1500, () => req.destroy(new Error('Health check timed out')));
      req.end();
    };

    const retry = () => {
      retries++;
      if (retries >= maxRetries) {
        reject(new Error(`Server did not respond on port ${port} within timeout`));
      } else {
        setTimeout(check, 300);
      }
    };

    check();
  });
}

async function startDatabase(nioBinary) {
  const url = process.env.NIODB_URL;
  const token = process.env.NIODB_TOKEN;
  if (url || token) {
    if (!url || !token) throw new Error('Set both NIODB_URL and NIODB_TOKEN for an external NioDB server.');
    return { child: null, url, token };
  }
  const directory = path.resolve(process.env.NIODB_DIR
    || path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(os.homedir(), '.nioguru'), 'niodb'));
  const listen = process.env.NIODB_LISTEN || '127.0.0.1:7432';
  const match = /^127\.0\.0\.1:(\d{1,5})$/.exec(listen);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535)
    throw new Error('Locally supervised NioDB must listen on 127.0.0.1; use NIODB_URL for an external server.');
  const databaseCli = path.join(rootDir, 'node_modules', '@nio-labs', 'nio-db', 'bin', 'niodb.cjs');
  if (!fs.existsSync(databaseCli)) throw new Error('NioDB CLI dependency is missing; install @nio-labs/nio-db@1.0.5.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const child = spawn(process.execPath, [databaseCli, 'serve', '--yes', '--dir', directory,
    '--listen', listen, '--no-demo'], {
    cwd: directory,
    env: { ...process.env, ...(nioBinary ? { NIODB_NIO_BIN: nioBinary } : {}) },
    stdio: 'inherit',
  });
  let launchError;
  child.once('error', error => { launchError = error; });
  const databaseUrl = `http://${listen}`;
  const tokenPath = path.join(directory, 'client-token');
  for (let attempt = 0; attempt < 180; attempt++) {
    if (launchError || child.exitCode !== null || child.signalCode !== null)
      throw new Error(`NioDB CLI exited before readiness: ${launchError?.message || child.exitCode || child.signalCode}`);
    if (fs.existsSync(tokenPath)) {
      const candidate = fs.readFileSync(tokenPath, 'utf8').trim();
      try {
        const response = await fetch(`${databaseUrl}/api/v1/persistence/status`, {
          headers: { Authorization: `Bearer ${candidate}` }, signal: AbortSignal.timeout(1500),
        });
        if (response.ok) {
          await new Promise(resolve => setTimeout(resolve, 500));
          if (child.exitCode === null && child.signalCode === null)
            return { child, url: databaseUrl, token: candidate };
        }
      } catch { /* Wait for the owned NioDB process. */ }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  child.kill('SIGTERM');
  throw new Error('NioDB did not become ready within 90 seconds.');
}

async function main() {
  console.log(`
  ===========================================
     NioGuru - The Multi-Guru AI Workspace
  ===========================================
  `);

  // Ensure nio CLI is available
  const nioBinary = await ensureNioBinary();
  const database = await startDatabase(nioBinary);

  // Determine port
  let port = 3000;
  const portIdx = process.argv.indexOf('--port') !== -1 ? process.argv.indexOf('--port') : process.argv.indexOf('-p');
  if (portIdx !== -1 && process.argv[portIdx + 1]) {
    port = parseInt(process.argv[portIdx + 1], 10);
  } else if (process.env.PORT) {
    port = parseInt(process.env.PORT, 10);
  }

  const serverDist = path.join(rootDir, 'apps', 'server', 'dist', 'index.js');
  const serverSrc = path.join(rootDir, 'apps', 'server', 'src', 'index.ts');
  const devMode = process.argv.includes('--dev');

  let child;
  let startupFailed = false;
  const env = { ...process.env, PORT: String(port), NIODB_URL: database.url, NIODB_TOKEN: database.token };

  if (!devMode && fs.existsSync(serverDist)) {
    child = spawn(process.execPath, [serverDist], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
    });
  } else {
    // Run with tsx in dev/source mode
    const tsxBin = path.join(rootDir, 'apps', 'server', 'node_modules', '.bin', isWin ? 'tsx.cmd' : 'tsx');
    child = spawn(tsxBin, [...(devMode ? ['watch'] : []), serverSrc], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
    });
  }

  const forwardSignal = (sig) => {
    if (child && child.pid) {
      try {
        process.kill(child.pid, sig);
      } catch {}
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('exit', (code) => {
    if (database.child && database.child.exitCode === null) database.child.kill('SIGTERM');
    process.exit(startupFailed ? 1 : code ?? 0);
  });

  child.on('error', (err) => {
    if (database.child && database.child.exitCode === null) database.child.kill('SIGTERM');
    console.error(`[nio-guru] Server error: ${err.message}`);
    process.exit(1);
  });

  try {
    await waitForServer(port);
    const url = `http://localhost:${port}`;
    console.log(`\n  NioGuru is running at: ${url}\n`);
    if (!process.argv.includes('--no-browser')) openBrowser(url);
  } catch (err) {
    startupFailed = true;
    console.error(`[nio-guru] ${err.message}`);
    if (child.pid) child.kill('SIGTERM');
    if (database.child && database.child.exitCode === null) database.child.kill('SIGTERM');
    process.exitCode = 1;
  }
}

main().catch(error => { console.error(`[nio-guru] ${error.message}`); process.exitCode = 1; });
