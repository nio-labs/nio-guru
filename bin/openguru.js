#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

  console.log('[openguru] nio CLI not detected. Automatically bundling @nio-labs/nio-ai...');

  // Attempt 1: via npx @nio-labs/nio-ai
  try {
    console.log('[openguru] Fetching @nio-labs/nio-ai via npm...');
    execSync('npx -y @nio-labs/nio-ai --version', { stdio: ['pipe', 'inherit', 'ignore'], timeout: 45000 });
    const found = findNioBinary();
    if (found) return found;
  } catch (err) {
    // Continue to native installer fallback
  }

  // Attempt 2: via direct install script
  try {
    console.log('[openguru] Installing nio via official installer...');
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
    console.warn(`[openguru] Warning: Auto-bundle failed: ${err.message}`);
    console.warn('[openguru] You can install nio manually with: npx @nio-labs/nio-ai');
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
    console.log(`[openguru] Open your browser and navigate to: ${url}`);
  }
}

function waitForServer(port, maxRetries = 30) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on('error', () => retry());
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

async function main() {
  console.log(`
  ===========================================
     OpenGuru - The Multi-Guru AI Workspace
  ===========================================
  `);

  // Ensure nio CLI is available
  await ensureNioBinary();

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

  let child;
  const env = { ...process.env, PORT: String(port) };

  if (fs.existsSync(serverDist)) {
    child = spawn(process.execPath, [serverDist], {
      cwd: rootDir,
      env,
      stdio: 'inherit',
    });
  } else {
    // Run with tsx in dev/source mode
    const tsxBin = path.join(rootDir, 'node_modules', '.bin', isWin ? 'tsx.cmd' : 'tsx');
    child = spawn(tsxBin, [serverSrc], {
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
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    console.error(`[openguru] Server error: ${err.message}`);
    process.exit(1);
  });

  try {
    await waitForServer(port);
    const url = `http://localhost:${port}`;
    console.log(`\n  OpenGuru is running at: ${url}\n`);
    openBrowser(url);
  } catch (err) {
    console.warn(`[openguru] ${err.message}`);
  }
}

main();
