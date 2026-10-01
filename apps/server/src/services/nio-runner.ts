import { spawn, execSync, ChildProcess } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface ChatStreamEvent {
  type: 'session' | 'token' | 'thought' | 'tool_call' | 'done' | 'error' | 'cancelled';
  text?: string;
  sessionID?: string;
  toolCall?: {
    id: string;
    tool: string;
    title?: string;
    status: 'running' | 'completed' | 'error';
    input?: any;
    output?: any;
  };
  error?: string;
}

export function findNioBinary(): string {
  if (process.env.NIO_BIN && fs.existsSync(process.env.NIO_BIN)) {
    return process.env.NIO_BIN;
  }

  const isWin = os.platform() === 'win32';
  const ext = isWin ? '.exe' : '';
  const candidates = [
    path.join(os.homedir(), '.cargo', 'bin', `nio${ext}`),
    path.join(os.homedir(), '.nio', 'bin', `nio${ext}`),
    path.join(os.homedir(), '.local', 'bin', `nio${ext}`),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // System PATH
  try {
    const whichCmd = isWin ? 'where nio' : 'which nio';
    const found = execSync(whichCmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split(/\r?\n/)[0];
    if (found && fs.existsSync(found)) {
      return found;
    }
  } catch {}

  throw new Error('nio binary not found. Please install nio CLI or run npx nio-ai');
}

export async function getAvailableModels(): Promise<Array<{ id: string; label: string }>> {
  try {
    const nioBin = findNioBinary();
    const stdout = execSync(`"${nioBin}" models --format json`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: 10000,
    });
    return JSON.parse(stdout);
  } catch (err: any) {
    console.warn(`[nio-runner] Failed to fetch models via nio CLI: ${err.message}`);
    // Fallback sensible defaults
    return [
      { id: 'kilo::kilo-auto/free', label: 'Kilo Auto (Free)' },
      { id: 'kilo::anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
      { id: 'kilo::deepseek/deepseek-r1', label: 'DeepSeek R1' },
      { id: 'kilo::openai/gpt-4o', label: 'OpenAI GPT-4o' },
    ];
  }
}

export interface StreamTurnOptions {
  conversationId: string;
  guruId: string;
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  mode?: 'ask' | 'plan' | 'build';
  workingDir?: string;
  onEvent: (event: ChatStreamEvent) => void;
}

export function streamNioTurn(options: StreamTurnOptions): { kill: () => void } {
  const nioBin = findNioBinary();
  const cwd = options.workingDir || process.cwd();

  // Combine systemPrompt persona with userPrompt if present
  let formattedPrompt = options.userPrompt;
  if (options.systemPrompt && options.systemPrompt.trim().length > 0) {
    formattedPrompt = `[System Instructions for ${options.guruId}: ${options.systemPrompt.trim()}]\n\n${options.userPrompt}`;
  }

  const args: string[] = ['run', '--format', 'json'];

  // Session binding (sanitized alphanumeric session ID)
  const sessionSafeId = `og-${options.conversationId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  args.push('-s', sessionSafeId);

  // Model selection
  if (options.model && options.model.trim().length > 0) {
    args.push('-m', options.model);
  }

  // Mode
  if (options.mode) {
    args.push('--mode', options.mode);
  } else {
    args.push('--mode', 'ask');
  }

  // Auto-approve tool calls for smoother agentic experience
  args.push('--auto');

  // Separator and prompt
  args.push('--', formattedPrompt);

  console.log(`[nio-runner] Spawning: ${nioBin} ${args.slice(0, -1).join(' ')} "<prompt>" in ${cwd}`);

  const child: ChildProcess = spawn(nioBin, args, {
    cwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const rl = readline.createInterface({
    input: child.stdout!,
    crlfDelay: Infinity,
  });

  let hasEmittedDone = false;

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('{')) {
      // Non-JSON stdout message from nio (e.g. status)
      return;
    }

    try {
      const parsed = JSON.parse(trimmed);
      const eventType = parsed.type;

      if (eventType === 'session') {
        options.onEvent({
          type: 'session',
          sessionID: parsed.sessionID,
        });
      } else if (eventType === 'text') {
        const text = parsed.part?.text || '';
        if (text) {
          options.onEvent({
            type: 'token',
            text,
          });
        }
      } else if (eventType === 'reasoning') {
        const thought = parsed.part?.text || '';
        if (thought) {
          options.onEvent({
            type: 'thought',
            text: thought,
          });
        }
      } else if (eventType === 'tool_use') {
        const part = parsed.part || {};
        const state = part.state || {};
        options.onEvent({
          type: 'tool_call',
          toolCall: {
            id: part.callID || 'call',
            tool: part.tool || 'tool',
            title: state.title || part.tool,
            status: state.status || 'running',
            input: state.input,
            output: state.output,
          },
        });
      } else if (eventType === 'step_finish') {
        if (!hasEmittedDone) {
          hasEmittedDone = true;
          options.onEvent({ type: 'done' });
        }
      } else if (eventType === 'cancelled') {
        options.onEvent({ type: 'cancelled' });
      }
    } catch (parseErr) {
      // Ignore JSON parse errors for non-conforming lines
    }
  });

  child.stderr?.on('data', (data) => {
    const errText = data.toString();
    console.warn(`[nio-runner:stderr] ${errText}`);
  });

  child.on('close', (code) => {
    if (!hasEmittedDone) {
      hasEmittedDone = true;
      if (code !== 0 && code !== null) {
        options.onEvent({ type: 'error', error: `nio process exited with code ${code}` });
      } else {
        options.onEvent({ type: 'done' });
      }
    }
  });

  child.on('error', (err) => {
    if (!hasEmittedDone) {
      hasEmittedDone = true;
      options.onEvent({ type: 'error', error: err.message });
    }
  });

  return {
    kill: () => {
      try {
        child.kill('SIGINT');
      } catch {}
    },
  };
}
