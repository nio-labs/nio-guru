import { spawn, execSync, execFile, ChildProcess } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'node:util';
import { DEFAULT_NIO_MODEL_ID } from '../../../../packages/shared/src/nio-models.js';
import { prepareSkillSelection } from './nio-skills.js';

export interface ChatStreamEvent {
  type: 'session' | 'token' | 'thought' | 'tool_call' | 'done' | 'error' | 'warning' | 'cancelled';
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

  throw new Error('nio binary not found. Please install nio CLI or run npx @nio-labs/nio-ai');
}

export async function getAvailableModels(): Promise<Array<{ id: string; label: string }>> {
  try {
    const nioBin = findNioBinary();
    const { stdout } = await promisify(execFile)(nioBin, ['models', '--format', 'json'], {
      encoding: 'utf-8', timeout: 10000, maxBuffer: 4 * 1024 * 1024,
    });
    const models: unknown = JSON.parse(stdout);
    if (!Array.isArray(models) || !models.length || models.some(model =>
      typeof model?.id !== 'string' || typeof model?.label !== 'string')) {
      throw new Error('Nio returned an empty or invalid model catalog.');
    }
    return models;
  } catch (err: any) {
    console.warn(`[nio-runner] Failed to fetch models via nio CLI: ${err.message}`);
    return [{ id: DEFAULT_NIO_MODEL_ID, label: 'Kilo Auto (Free)' }];
  }
}

export interface StreamTurnOptions {
  conversationId: string;
  guruId: string;
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  skills: string[];
  onEvent: (event: ChatStreamEvent) => void | Promise<void>;
}

export function streamNioTurn(options: StreamTurnOptions): { kill: () => void; finished: Promise<void> } {
  let eventQueue = Promise.resolve();
  const emit = (event: ChatStreamEvent) => {
    eventQueue = eventQueue.then(() => options.onEvent(event)).catch(error => {
      console.warn('[nio-runner] Event delivery failed:', error);
    });
  };
  const nioBin = findNioBinary();
  const cwd = process.cwd();

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

  // NioGuru is a chat product. Disable project discovery and filesystem/shell
  // tools while retaining Nio's dedicated read_skill_file capability.
  args.push('--mode', 'ask', '--no-tools');

  const selection = prepareSkillSelection(options.skills);
  const selectedNames = options.skills.filter(name => !selection.unavailable.includes(name));

  formattedPrompt += '\n\nThis is a chat-only session with no project folder attached. Answer using the user-provided context; do not claim to inspect local files or ask the user to trust a project. Use selected Nio skills when relevant. Read their SKILL.md with read_skill_file first, and request only reference files actually named in that skill. If a reference is unavailable, continue with the skill content you have. Follow the user request and Guru instructions when a skill suggests a conflicting workflow.\n';
  formattedPrompt += `Available skill names for this turn: ${selectedNames.length ? selectedNames.join(', ') : '(none)'}. Only call read_skill_file using these exact names. Do not invent skill names or call unselected skills.\n`;

  // Separator and prompt
  args.push('--', formattedPrompt);

  console.log(`[nio-runner] Spawning: ${nioBin} ${args.slice(0, -1).join(' ')} "<prompt>" in ${cwd}`);

  let child: ChildProcess;
  try {
    child = spawn(nioBin, args, {
      cwd,
      env: { ...process.env, NIO_CONFIG: selection.configPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    selection.cleanup();
    throw error;
  }
  if (selection.unavailable.length > 0) {
    emit({
      type: 'warning',
      text: `Some selected skills are not installed or enabled: ${selection.unavailable.join(', ')}. This turn will continue without them. Use nio --skills to install or enable them.`,
    });
  }

  const rl = readline.createInterface({
    input: child.stdout!,
    crlfDelay: Infinity,
  });

  let resolveFinished!: () => void;
  const finished = new Promise<void>(resolve => { resolveFinished = resolve; });
  let hasEmittedDone = false;
  let cancelled = false;
  let processError = '';
  let forceKill: ReturnType<typeof setTimeout> | undefined;

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
        emit({
          type: 'session',
          sessionID: parsed.sessionID,
        });
      } else if (eventType === 'text') {
        const text = parsed.part?.text || '';
        if (text) {
          emit({
            type: 'token',
            text,
          });
        }
      } else if (eventType === 'reasoning') {
        const thought = parsed.part?.text || '';
        if (thought) {
          emit({
            type: 'thought',
            text: thought,
          });
        }
      } else if (eventType === 'tool_use') {
        const part = parsed.part || {};
        const state = part.state || {};
        emit({
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
      } else if (eventType === 'error') {
        processError = parsed.error?.message || parsed.error || parsed.message || 'Nio could not complete this turn.';
        if (typeof processError !== 'string') processError = JSON.stringify(processError);
      } else if (eventType === 'cancelled') {
        cancelled = true;
      }
      // step_finish is an intermediate model/tool step, not the end of a turn.

    } catch (parseErr) {
      // Ignore JSON parse errors for non-conforming lines
    }
  });

  child.stderr?.on('data', (data) => {
    const errText = data.toString();
    console.warn(`[nio-runner:stderr] ${errText}`);
  });

  child.on('close', (code) => {
    if (forceKill) clearTimeout(forceKill);
    selection.cleanup();
    if (!hasEmittedDone) {
      hasEmittedDone = true;
      if (cancelled) {
        emit({ type: 'cancelled' });
      } else if (processError || (code !== 0 && code !== null)) {
        emit({ type: 'error', error: processError || `Nio stopped before completing this turn (exit ${code}).` });
      } else {
        emit({ type: 'done' });
      }
    }
    void eventQueue.then(resolveFinished);
  });

  child.on('error', (err) => {
    if (!hasEmittedDone) {
      hasEmittedDone = true;
      emit({ type: 'error', error: err.message });
    }
  });

  return {
    finished,
    kill: () => {
      try {
        if (child.exitCode !== null || child.signalCode !== null) return;
        cancelled = true;
        child.kill('SIGINT');
        forceKill ??= setTimeout(() => child.kill('SIGKILL'), 3000);
        forceKill.unref();
      } catch {}
    },
  };
}
