import mermaid from 'mermaid';

// Mermaid configuration and temporary DOM are global. Keep initialize/parse/render
// together, across every Markdown component, and clean up only our own scratch DOM.
let queue: Promise<unknown> = Promise.resolve();
let nextId = 0;
const prefix = `nioguru-mermaid-${Math.random().toString(36).slice(2)}`;
export class DiagramSyntaxError extends Error {}

export function renderDiagram(code: string, current: () => boolean): Promise<string | null> {
  const operation = queue.then(async () => {
    if (!current()) return null;
    const id = `${prefix}-${++nextId}`;
    const scratch = document.createElement('div');
    scratch.style.cssText = 'position:absolute;left:-100000px;top:0;pointer-events:none;';
    document.body.append(scratch);
    try {
      mermaid.initialize({
        startOnLoad: false, suppressErrorRendering: true,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'neutral',
        fontFamily: 'Google Sans Code, monospace, sans-serif', securityLevel: 'strict',
      });
      const valid = await mermaid.parse(code, { suppressErrors: true });
      if (!valid) throw new DiagramSyntaxError('Invalid Mermaid syntax.');
      if (!current()) return null;
      const { svg } = await mermaid.render(id, code, scratch);
      return current() ? svg : null;
    } finally { scratch.remove(); }
  });
  queue = operation.catch(() => undefined);
  return operation;
}
