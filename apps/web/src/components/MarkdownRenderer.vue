<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { marked } from 'marked';
import hljs from 'highlight.js';
import katex from 'katex';
import mermaid from 'mermaid';
import 'highlight.js/styles/github-dark.css';

const props = defineProps<{
  content: string;
}>();

const containerRef = ref<HTMLDivElement | null>(null);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Custom marked renderer for syntax highlighting & Mermaid diagrams
const customRenderer = {
  code({ text, lang }: { text: string; lang?: string }) {
    const trimmed = text.trim();
    const isMermaid =
      lang === 'mermaid' ||
      lang === 'sequenceDiagram' ||
      lang === 'flowchart' ||
      lang === 'graph' ||
      trimmed.startsWith('graph ') ||
      trimmed.startsWith('graph\n') ||
      trimmed.startsWith('sequenceDiagram') ||
      trimmed.startsWith('flowchart ') ||
      trimmed.startsWith('classDiagram') ||
      trimmed.startsWith('stateDiagram') ||
      trimmed.startsWith('erDiagram') ||
      trimmed.startsWith('gantt') ||
      trimmed.startsWith('pie');

    if (isMermaid) {
      const encoded = encodeURIComponent(trimmed);
      return `<div class="mermaid-container my-3 rounded-xl border border-border bg-card/60 p-4 overflow-x-auto shadow-xs" data-mermaid="${encoded}">
        <div class="mermaid-header flex items-center justify-between pb-2 mb-2 border-b border-border/50 text-muted-foreground text-[11px] font-mono">
          <span class="inline-flex items-center gap-1.5 font-medium">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            Mermaid Diagram
          </span>
          <button type="button" class="mermaid-toggle-btn hover:text-foreground text-[10px] px-2 py-0.5 rounded bg-muted/60 hover:bg-muted border border-border/70 transition-colors">View Code</button>
        </div>
        <div class="mermaid-svg flex items-center justify-center min-h-[60px] overflow-x-auto"><span class="text-xs text-muted-foreground/60">Rendering diagram...</span></div>
        <pre class="mermaid-raw hidden font-mono text-xs text-left p-3 bg-muted/40 rounded-lg overflow-x-auto border border-border/40 mt-2"><code>${escapeHtml(text)}</code></pre>
      </div>`;
    }

    let highlighted = '';
    try {
      if (lang && hljs.getLanguage(lang)) {
        highlighted = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
      } else {
        highlighted = hljs.highlightAuto(text).value;
      }
    } catch {
      highlighted = escapeHtml(text);
    }

    const safeLang = escapeHtml(lang || 'code');
    const encodedCode = encodeURIComponent(text);

    return `<div class="prose-code-block relative my-3 rounded-lg overflow-hidden border border-border bg-muted/30 font-mono text-xs shadow-3xs">
      <div class="prose-code-header flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border text-muted-foreground font-mono text-[11px]">
        <span class="font-medium">${safeLang}</span>
        <button type="button" class="copy-code-btn hover:text-foreground transition-colors px-2 py-0.5 rounded text-[10px] bg-background/60 hover:bg-background border border-border/80" data-code="${encodedCode}">Copy</button>
      </div>
      <pre class="p-3 overflow-x-auto text-[13px] leading-relaxed"><code class="hljs ${lang ? 'language-' + safeLang : ''}">${highlighted}</code></pre>
    </div>`;
  }
};

marked.use({
  gfm: true,
  breaks: true,
  renderer: customRenderer,
});

const renderedHtml = computed(() => {
  if (!props.content) return '';
  try {
    let processed = props.content;
    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
      } catch {
        return math;
      }
    });
    processed = processed.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
      } catch {
        return math;
      }
    });

    return marked.parse(processed) as string;
  } catch {
    return props.content;
  }
});

function cleanStrayMermaidElements(id?: string) {
  if (typeof document === 'undefined') return;
  if (id) {
    const el = document.getElementById(id) || document.getElementById(`d${id}`);
    if (el && el.parentElement === document.body) {
      el.remove();
    }
  }
  // Remove any stray error elements or bomb icons Mermaid injected into document.body
  document.querySelectorAll('body > [id^="dmmd-"], body > [id^="mmd-"], body > svg[id*="mermaid"], body > [id*="dmermaid"], body > svg[aria-roledescription="error"], body > .error-icon').forEach((el) => {
    el.remove();
  });
}

function normalizeMermaidCode(code: string): string {
  let cleaned = code.trim();
  // Strip code fences if present
  cleaned = cleaned.replace(/^```(?:mermaid)?\s*\n?/i, '').replace(/```\s*$/, '').trim();
  // Fix subgraph "Name" to subgraph Name_id ["Name"] for Mermaid parser compatibility
  cleaned = cleaned.replace(/subgraph\s+"([^"]+)"/g, (_, title) => {
    const safeId = title.replace(/[^a-zA-Z0-9_]/g, '_');
    return `subgraph ${safeId} ["${title}"]`;
  });
  return cleaned;
}

function handleDiagramError(container: HTMLElement) {
  container.setAttribute('data-rendered', 'error');
  const svgHolder = container.querySelector('.mermaid-svg');
  const rawBlock = container.querySelector('.mermaid-raw');
  const toggleBtn = container.querySelector('.mermaid-toggle-btn');
  if (svgHolder) {
    svgHolder.innerHTML = `
      <div class="flex flex-col items-center justify-center p-3 text-center text-muted-foreground/80 font-mono">
        <span class="text-xs text-amber-500/90 font-medium">Diagram syntax error</span>
        <span class="text-[10px] text-muted-foreground/60 mt-0.5">Click "View Code" or inspect the raw markup below</span>
      </div>
    `;
  }
  if (rawBlock) {
    rawBlock.classList.remove('hidden');
  }
  if (toggleBtn) {
    toggleBtn.textContent = 'View Code';
  }
}

let renderCounter = 0;
async function renderMermaidDiagrams() {
  await nextTick();
  if (!containerRef.value) return;

  const containers = containerRef.value.querySelectorAll<HTMLElement>('.mermaid-container:not([data-rendered])');
  if (containers.length === 0) return;

  const isDark = document.documentElement.classList.contains('dark');
  mermaid.initialize({
    startOnLoad: false,
    suppressErrorRendering: true,
    theme: isDark ? 'dark' : 'neutral',
    fontFamily: '"Google Sans Code", monospace, sans-serif',
    securityLevel: 'loose',
  });
  // Intercept parser error to avoid injecting error SVGs into DOM
  mermaid.parseError = () => {};

  // Clean any previous stray elements before rendering
  cleanStrayMermaidElements();

  for (const container of Array.from(containers)) {
    const rawInput = decodeURIComponent(container.getAttribute('data-mermaid') || '');
    if (!rawInput) continue;

    const rawCode = normalizeMermaidCode(rawInput);
    const id = `mmd-${Date.now()}-${++renderCounter}`;

    try {
      // Validate syntax first with suppressErrors: true to prevent unhandled render bombs
      const isValid = await mermaid.parse(rawCode, { suppressErrors: true }).catch(() => false);
      if (!isValid) {
        handleDiagramError(container);
        continue;
      }

      const { svg } = await mermaid.render(id, rawCode);
      const svgHolder = container.querySelector('.mermaid-svg');
      if (svgHolder) {
        svgHolder.innerHTML = svg;
      }
      container.setAttribute('data-rendered', 'true');
    } catch {
      handleDiagramError(container);
    } finally {
      cleanStrayMermaidElements(id);
    }
  }
}

watch(renderedHtml, () => {
  renderMermaidDiagrams();
}, { immediate: true });

onMounted(() => {
  cleanStrayMermaidElements();
  renderMermaidDiagrams();
});

onUnmounted(() => {
  cleanStrayMermaidElements();
});

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement;

  const copyBtn = target.closest<HTMLElement>('.copy-code-btn');
  if (copyBtn) {
    const code = decodeURIComponent(copyBtn.getAttribute('data-code') || '');
    if (code) {
      navigator.clipboard.writeText(code);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = 'Copy';
      }, 1500);
    }
    return;
  }

  const toggleBtn = target.closest<HTMLElement>('.mermaid-toggle-btn');
  if (toggleBtn) {
    const container = toggleBtn.closest('.mermaid-container');
    if (!container) return;
    const svgHolder = container.querySelector('.mermaid-svg');
    const rawBlock = container.querySelector('.mermaid-raw');
    if (!svgHolder || !rawBlock) return;

    if (rawBlock.classList.contains('hidden')) {
      rawBlock.classList.remove('hidden');
      svgHolder.classList.add('hidden');
      toggleBtn.textContent = 'View Diagram';
    } else {
      rawBlock.classList.add('hidden');
      svgHolder.classList.remove('hidden');
      toggleBtn.textContent = 'View Code';
    }
  }
}
</script>

<template>
  <div
    ref="containerRef"
    class="markdown-body prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed break-words"
    v-html="renderedHtml"
    @click="handleClick"
  />
</template>

<style>
.markdown-body pre {
  background-color: hsl(var(--muted) / 0.5);
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin: 0.75rem 0;
  overflow-x: auto;
  font-family: 'Google Sans Code', monospace !important;
  font-size: 12.5px;
  line-height: 1.6;
}

.markdown-body code:not(pre code) {
  background-color: hsl(var(--muted));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border) / 0.6);
  padding: 0.15rem 0.35rem;
  border-radius: 0.25rem;
  font-family: 'Google Sans Code', monospace !important;
  font-size: 12.5px;
}

.markdown-body p {
  margin-bottom: 0.65rem;
}

.markdown-body p:last-child {
  margin-bottom: 0;
}

.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {
  font-weight: 700;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  color: hsl(var(--foreground));
  font-family: 'Google Sans Code', monospace, sans-serif !important;
}

.markdown-body h1 { font-size: 1.1rem; }
.markdown-body h2 { font-size: 1.0rem; }
.markdown-body h3 { font-size: 0.9rem; }

.markdown-body ul, .markdown-body ol {
  padding-left: 1.25rem;
  margin-bottom: 0.65rem;
}

.markdown-body ul { list-style-type: disc; }
.markdown-body ol { list-style-type: decimal; }

.markdown-body blockquote {
  border-left: 3px solid hsl(var(--border));
  padding-left: 0.75rem;
  color: hsl(var(--muted-foreground));
  margin: 0.75rem 0;
  font-style: italic;
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
  font-size: 11px;
}

.markdown-body th, .markdown-body td {
  border: 1px solid hsl(var(--border));
  padding: 0.4rem 0.6rem;
  text-align: left;
}

.markdown-body th {
  background-color: hsl(var(--muted) / 0.5);
  font-weight: 600;
}
</style>
