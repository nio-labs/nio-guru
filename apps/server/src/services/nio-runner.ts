import { spawn, execSync, execFile, ChildProcess } from 'child_process';
import readline from 'readline';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'node:util';
import { DEFAULT_NIO_MODEL_ID, STEPFUN_IMAGE_MODEL } from '../../../../packages/shared/src/nio-models.js';
import { cleanLeakedToolCalls } from '../../../../packages/shared/src/sanitize.js';
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
    return models.some(model => model.id === STEPFUN_IMAGE_MODEL.id) ? models : [...models, STEPFUN_IMAGE_MODEL];
  } catch (err: any) {
    console.warn(`[nio-runner] Failed to fetch models via nio CLI: ${err.message}`);
    return [{ id: DEFAULT_NIO_MODEL_ID, label: 'NioEcho — Answer · NioXS (free)' }, STEPFUN_IMAGE_MODEL];
  }
}

export interface StreamTurnOptions {
  conversationId: string;
  guruId: string;
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  skills: string[];
  files?: string[];
  onEvent: (event: ChatStreamEvent) => void | Promise<void>;
}

function createTokenFilter(onText: (text: string) => void) {
  let buffer = '';
  let flushedLeading = false;

  const isPotentialToolCall = (str: string) =>
    /^\s*(?:\{\s*"(?:name|tool|function)"|<\s*(?:tool_call|function_call)|```(?:json)?\s*\{\s*"(?:name|tool|function))/i.test(str);

  return {
    push(text: string) {
      if (flushedLeading) {
        onText(text);
        return;
      }
      buffer += text;
      const trimmed = buffer.trimStart();
      if (!trimmed.startsWith('{') && !trimmed.startsWith('<') && !trimmed.startsWith('`')) {
        flushedLeading = true;
        onText(buffer);
        buffer = '';
        return;
      }

      while (true) {
        const match = buffer.match(/^\s*(?:\{\s*"(?:name|tool|function)"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|input|parameters)"\s*:\s*\{[\s\S]*?\}\s*\}|<\s*(?:tool_call|function_call)\s*>[\s\S]*?<\s*\/\s*(?:tool_call|function_call)\s*>|```(?:json)?\s*\{\s*"(?:name|tool|function)"\s*:\s*"[^"]+"[\s\S]*?\}\s*```)\s*/i);
        if (match) {
          buffer = buffer.slice(match[0].length).trimStart();
        } else {
          break;
        }
      }

      if (!buffer) return;

      const currentTrimmed = buffer.trimStart();
      if (!isPotentialToolCall(currentTrimmed)) {
        if (currentTrimmed.length > 40 || (!currentTrimmed.startsWith('{') && !currentTrimmed.startsWith('<') && !currentTrimmed.startsWith('`'))) {
          flushedLeading = true;
          onText(buffer);
          buffer = '';
        }
      } else if (buffer.length > 2000) {
        flushedLeading = true;
        onText(buffer);
        buffer = '';
      }
    },
    flush() {
      if (!flushedLeading && buffer) {
        flushedLeading = true;
        const cleaned = cleanLeakedToolCalls(buffer);
        if (cleaned) onText(cleaned);
        buffer = '';
      }
    },
  };
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
  // tools while retaining Nio's dedicated read_skill_file capability when skills are selected.
  args.push('--mode', 'ask');
  if (options.skills && options.skills.length > 0) {
    args.push('--no-project-tools');
  } else {
    args.push('--no-tools');
  }
  for (const file of options.files || []) args.push('--file', file);

  const selection = prepareSkillSelection(options.skills);
  const selectedNames = options.skills.filter(name => !selection.unavailable.includes(name));

  formattedPrompt += '\n\nThis is a chat-only session with no project folder attached. Answer using the user-provided context; do not claim to inspect local files or ask the user to trust a project.\n';
  if (selectedNames.length > 0) {
    formattedPrompt += 'Consult selected Nio skills only when directly needed to answer a specific technical query. Do not read skills for simple greetings or casual conversation. When relevant, call read_skill_file using exact skill names. Never output raw JSON tool calls, schema payloads, or simulated tool call objects directly in conversational chat text.\n';
    formattedPrompt += `Available skill names for this turn: ${selectedNames.join(', ')}. Only call read_skill_file using these exact names.\n`;
  }

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

  const tokenFilter = createTokenFilter((text) => {
    emit({
      type: 'token',
      text,
    });
  });

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
          tokenFilter.push(text);
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
    tokenFilter.flush();
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
