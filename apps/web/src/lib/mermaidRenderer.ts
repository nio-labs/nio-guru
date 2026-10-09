import mermaid from 'mermaid';

// Mermaid configuration and temporary DOM are global. Keep initialize/parse/render
// together, across every Markdown component, and clean up only our own scratch DOM.
let queue: Promise<unknown> = Promise.resolve();
let nextId = 0;
const prefix = `nioguru-mermaid-${Math.random().toString(36).slice(2)}`;
export class DiagramSyntaxError extends Error {}

export function autoRepairMermaid(raw: string): string {
  let code = raw.trim();

  // Strip code fences if present
  code = code.replace(/^```(?:mermaid)?\s*\n?/i, '').replace(/```\s*$/, '').trim();

  // Strip trailing backticks or stray quotes
  code = code.replace(/[`'"]+$/, '').trim();

  // Fix subgraph "Name" to subgraph safe_id ["Name"]
  code = code.replace(/subgraph\s+"([^"]+)"/g, (_, title) => {
    const safeId = title.replace(/[^a-zA-Z0-9_]/g, '_');
    return `subgraph ${safeId} ["${title}"]`;
  });

  // Repair sequence diagrams
  if (/^sequenceDiagram\b/.test(code)) {
    // 1. Split message attached with block terminator 'end'
    code = code.replace(/^([ \t]+)([^\n]*?(?:->>|-->>)[^\n]*?:[^\n]*\S)[ \t]+end[ \t]*(?=\n([ \t]*)\S)/gm,
      (line: string, indent: string, message: string, nextIndent: string) =>
        nextIndent.length < indent.length ? `${indent}${message}\n${nextIndent}end` : line);

    // 2. Fix notes spanning 3+ participants
    code = code.replace(/^(\s*Note\s+over\s+)([\w-]+(?:\s*,\s*[\w-]+){2,})(\s*:)/gim,
      (_, prefix: string, participants: string, suffix: string) => {
        const ids = participants.split(',').map(id => id.trim());
        return `${prefix}${ids[0]},${ids[ids.length - 1]}${suffix}`;
      });

    // 3. Auto-close unclosed sequence blocks (loop, alt, opt, par, critical, rect)
    const lines = code.split('\n');
    let openBlocks = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(loop|alt|opt|par|critical|rect)\b/.test(trimmed)) {
        openBlocks++;
      } else if (trimmed === 'end') {
        if (openBlocks > 0) openBlocks--;
      }
    }
    while (openBlocks > 0) {
      code += '\n    end';
      openBlocks--;
    }
  }

  // Repair flowcharts and graphs
  if (/^(?:flowchart|graph)\b/.test(code)) {
    // Fix unquoted parentheses or special characters inside square brackets:
    // e.g. A[Push Gateway (Port 80)] -> A["Push Gateway (Port 80)"]
    code = code.replace(/\[([^\n[\]]*?\([^\n()]+\)[^\n[\]]*?)\]/g, (match, inner) => {
      const t = inner.trim();
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return match;
      }
      return `["${t.replace(/"/g, "'")}"]`;
    });
  }

  return code;
}

export function renderDiagram(code: string, current: () => boolean): Promise<string | null> {
  const operation = queue.then(async () => {
    if (!current()) return null;
    const id = `${prefix}-${++nextId}`;
    const scratch = document.createElement('div');
    scratch.style.cssText = 'position:absolute;left:-100000px;top:0;pointer-events:none;';
    document.body.append(scratch);
    try {
      mermaid.initialize({
        startOnLoad: false,
        suppressErrorRendering: true,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'neutral',
        fontFamily: 'Google Sans Code, monospace, sans-serif',
        securityLevel: 'loose',
      });

      let parsedCode = code;
      let valid = false;
      try {
        valid = !!(await mermaid.parse(parsedCode, { suppressErrors: true }));
      } catch {
        valid = false;
      }

      if (!valid) {
        const repaired = autoRepairMermaid(code);
        try {
          valid = !!(await mermaid.parse(repaired, { suppressErrors: true }));
          if (valid) {
            parsedCode = repaired;
          }
        } catch {
          valid = false;
        }
      }

      if (!valid) {
        const lines = code.trim().split('\n');
        if (lines.length > 2) {
          const truncated = autoRepairMermaid(lines.slice(0, -1).join('\n'));
          try {
            if (await mermaid.parse(truncated, { suppressErrors: true })) {
              parsedCode = truncated;
              valid = true;
            }
          } catch {}
        }
      }

      if (!valid) throw new DiagramSyntaxError('Invalid Mermaid syntax.');
      if (!current()) return null;

      const { svg } = await mermaid.render(id, parsedCode, scratch);
      return current() ? svg : null;
    } finally {
      scratch.remove();
    }
  });
  queue = operation.catch(() => undefined);
  return operation;
}
