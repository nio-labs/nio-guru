<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { Marked, type TokensList } from 'marked';
import hljs from 'highlight.js';
import katex from 'katex';
import { DiagramSyntaxError, renderDiagram } from '../lib/mermaidRenderer';
import 'highlight.js/styles/github-dark.css';

const props = defineProps<{
  content: string;
  streaming?: boolean;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const svgUrls = new Map<HTMLElement, { url: string; code: string }>();

function safeSvg(source: string): string {
  if (source.length > 2_000_000) throw new Error('SVG is too large to preview.');
  const documentSvg = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = documentSvg.documentElement;
  if (root.localName !== 'svg' || documentSvg.querySelector('parsererror')) throw new Error('Invalid SVG markup.');
  const allowed = new Set(['svg', 'g', 'defs', 'title', 'desc', 'symbol', 'path', 'circle', 'ellipse', 'rect', 'line',
    'polyline', 'polygon', 'text', 'tspan', 'lineargradient', 'radialgradient', 'stop', 'clippath', 'mask',
    'pattern', 'filter', 'fegaussianblur', 'feoffset', 'fecolormatrix', 'feblend', 'femerge', 'femergenode']);
  const styleProperties = new Set(['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'font-family', 'font-size',
    'font-weight', 'text-anchor']);
  const safeStyle = (name: string, value: string) => styleProperties.has(name)
    && !/[;{}<>]/.test(value)
    && !/javascript:|@import|expression\s*\(/i.test(value)
    && [...value.matchAll(/url\(([^)]+)\)/gi)].every(match => /^['"]?#[\w:-]+['"]?$/.test(match[1].trim()));
  // SVG generators commonly put their palette in simple class rules. Convert those
  // rules to presentation attributes so the exported file works without CSS.
  for (const style of Array.from(root.querySelectorAll('style'))) {
    const css = (style.textContent || '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/\.([\w-]+)\s*\{([^{}]*)\}/g)) {
      const className = rule[1];
      for (const declaration of rule[2].split(';')) {
        const colon = declaration.indexOf(':');
        if (colon < 0) continue;
        const name = declaration.slice(0, colon).trim().toLowerCase();
        const value = declaration.slice(colon + 1).trim();
        if (!safeStyle(name, value)) continue;
        for (const element of Array.from(root.querySelectorAll('[class]'))) {
          if (element.classList.contains(className)) element.setAttribute(name, value);
        }
      }
    }
    style.remove();
  }
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    if (!allowed.has(element.localName.toLowerCase())) { element.remove(); continue; }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value;
      const unsafeUrl = [...value.matchAll(/url\(([^)]+)\)/gi)]
        .some(match => !/^['"]?#[\w:-]+['"]?$/.test(match[1].trim()));
      if (name.startsWith('on') || name === 'href' || name === 'xlink:href'
        || /javascript:|@import|expression\s*\(/i.test(value) || unsafeUrl) {
        element.removeAttribute(attribute.name);
      } else if (name === 'style') {
        element.removeAttribute('style');
        for (const declaration of value.split(';')) {
          const colon = declaration.indexOf(':');
          if (colon < 0) continue;
          const property = declaration.slice(0, colon).trim().toLowerCase();
          const propertyValue = declaration.slice(colon + 1).trim();
          if (safeStyle(property, propertyValue)) element.setAttribute(property, propertyValue);
        }
      }
    }
  }
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(root);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Custom marked renderer for syntax highlighting and visual code blocks.
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

    const isSvg = !props.streaming && ((lang || '').toLowerCase().split(/\s+/)[0] === 'svg'
      || /^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(trimmed));
    if (isSvg) {
      return `<div class="svg-preview-card my-3 overflow-hidden rounded-xl border border-border bg-card shadow-xs" data-svg="${encodeURIComponent(trimmed)}">
        <div class="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs">
          <span class="mr-auto font-semibold">SVG</span>
          <button type="button" class="svg-background-btn rounded-md border border-border bg-background px-2 py-1 hover:bg-muted" aria-label="Switch preview background">Dark background</button>
          <button type="button" class="svg-toggle-btn rounded-md border border-border bg-background px-2 py-1 hover:bg-muted">View Code</button>
          <button type="button" class="svg-copy-btn rounded-md border border-border bg-background px-2 py-1 hover:bg-muted">Copy SVG</button>
          <button type="button" class="svg-download-btn rounded-md bg-teal-600 px-2 py-1 text-white hover:bg-teal-700">Download SVG</button>
        </div>
        <div class="svg-preview-surface flex min-h-44 items-center justify-center bg-white p-5"><img class="max-h-80 max-w-full object-contain" alt="Generated SVG preview" /></div>
        <pre class="svg-raw hidden overflow-x-auto p-3 text-xs"><code>${escapeHtml(trimmed)}</code></pre>
      </div>`;
    }

    let highlighted = '';
    try {
      if (props.streaming) {
        highlighted = escapeHtml(text);
      } else if (lang && hljs.getLanguage(lang)) {
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

const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: customRenderer,
});

const blockCache = new Map<number, { raw: string; links: string; streaming: boolean; html: string }>();
const renderedBlocks = computed(() => {
  if (!props.content) return [];
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

    const tokens = markdown.lexer(processed);
    const links = JSON.stringify(tokens.links);
    const blocks = tokens.filter(token => token.type !== 'space').map((token, index) => {
      const previous = blockCache.get(index);
      // Keep a partial Mermaid block stable while more tokens arrive.
      if (props.streaming && token.type === 'code' && previous?.html.includes('mermaid-container')) {
        return { key: index, html: previous.html };
      }
      if (previous?.raw === token.raw && previous.links === links && previous.streaming === !!props.streaming) {
        return { key: index, html: previous.html };
      }
      const block = Object.assign([token], { links: tokens.links }) as TokensList;
      const rawSvg = token.type === 'html' && /^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(token.text.trim());
      const html = rawSvg
        ? (props.streaming ? `<pre><code>${escapeHtml(token.text)}</code></pre>` : customRenderer.code({ text: token.text, lang: 'svg' }))
        : markdown.parser(block);
      blockCache.set(index, { raw: token.raw, links, streaming: !!props.streaming, html });
      return { key: index, html };
    });
    for (const key of blockCache.keys()) if (key >= blocks.length) blockCache.delete(key);
    return blocks;
  } catch {
    return [{ key: 0, html: escapeHtml(props.content) }];
  }
});

function normalizeMermaidCode(code: string): string {
  let cleaned = code.trim();
  // Strip code fences if present
  cleaned = cleaned.replace(/^```(?:mermaid)?\s*\n?/i, '').replace(/```\s*$/, '').trim();
  // Fix subgraph "Name" to subgraph Name_id ["Name"] for Mermaid parser compatibility
  cleaned = cleaned.replace(/subgraph\s+"([^"]+)"/g, (_, title) => {
    const safeId = title.replace(/[^a-zA-Z0-9_]/g, '_');
    return `subgraph ${safeId} ["${title}"]`;
  });
  // Mermaid sequence notes can span at most two participants. A generated
  // multi-participant note intends the range from its first to last member.
  if (/^sequenceDiagram\b/.test(cleaned)) {
    // Generated diagrams sometimes attach a block terminator to a message.
    // Only split it when the following line is dedented like a closing block.
    cleaned = cleaned.replace(/^([ \t]+)([^\n]*?(?:->>|-->>)[^\n]*?:[^\n]*\S)[ \t]+end[ \t]*(?=\n([ \t]*)\S)/gm,
      (line: string, indent: string, message: string, nextIndent: string) =>
        nextIndent.length < indent.length ? `${indent}${message}\n${nextIndent}end` : line);
    cleaned = cleaned.replace(/^(\s*Note\s+over\s+)([\w-]+(?:\s*,\s*[\w-]+){2,})(\s*:)/gim,
      (_, prefix: string, participants: string, suffix: string) => {
        const ids = participants.split(',').map(id => id.trim());
        return `${prefix}${ids[0]},${ids[ids.length - 1]}${suffix}`;
      });
  }
  return cleaned;
}

function handleDiagramError(container: HTMLElement, syntax: boolean) {
  container.setAttribute('data-rendered', 'error');
  const svgHolder = container.querySelector('.mermaid-svg');
  const rawBlock = container.querySelector('.mermaid-raw');
  const toggleBtn = container.querySelector('.mermaid-toggle-btn');
  if (svgHolder) {
    svgHolder.innerHTML = `
      <div class="flex flex-col items-center justify-center p-3 text-center text-muted-foreground/80 font-mono">
        <span class="text-xs text-amber-500/90 font-medium">${syntax ? 'Diagram syntax error' : 'Could not render diagram'}</span>
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

let revision = 0;
let mounted = false;
let timer: ReturnType<typeof setTimeout> | undefined;
function refreshSvgPreviews(root: HTMLElement) {
  for (const [container, item] of svgUrls) {
    if (!container.isConnected || !root.contains(container)) {
      URL.revokeObjectURL(item.url);
      svgUrls.delete(container);
    }
  }
  for (const container of root.querySelectorAll<HTMLElement>('.svg-preview-card:not([data-ready])')) {
    container.setAttribute('data-ready', 'true');
    const preview = container.querySelector<HTMLElement>('.svg-preview-surface');
    const image = container.querySelector<HTMLImageElement>('img');
    if (!preview || !image) continue;
    try {
      const code = safeSvg(decodeURIComponent(container.getAttribute('data-svg') || ''));
      const url = URL.createObjectURL(new Blob([code], { type: 'image/svg+xml' }));
      svgUrls.set(container, { url, code });
      image.onerror = () => {
        preview.textContent = 'SVG preview unavailable. View the code below.';
        container.querySelector('.svg-raw')?.classList.remove('hidden');
      };
      image.src = url;
    } catch (error) {
      preview.textContent = (error as Error).message;
      container.querySelector('.svg-raw')?.classList.remove('hidden');
      container.querySelector<HTMLButtonElement>('.svg-download-btn')?.setAttribute('disabled', '');
    }
  }
}
async function renderMermaidDiagrams(version: number) {
  await nextTick();
  const root = containerRef.value;
  if (!mounted || !root || version !== revision) return;
  refreshSvgPreviews(root);
  const containers = root.querySelectorAll<HTMLElement>('.mermaid-container:not([data-rendered])');
  if (props.streaming) return;
  for (const container of containers) {
    const current = () => mounted && version === revision && root.contains(container) && container.isConnected;
    if (!current()) return;
    container.setAttribute('data-rendered', 'pending');
    try {
      const rawCode = normalizeMermaidCode(decodeURIComponent(container.getAttribute('data-mermaid') || ''));
      const svg = await renderDiagram(rawCode, current);
      if (!svg || !current()) continue;
      const holder = container.querySelector('.mermaid-svg');
      if (holder) holder.innerHTML = svg;
      container.setAttribute('data-rendered', 'true');
    } catch (error) {
      if (!current()) continue;
      console.warn('[NioGuru] Diagram rendering failed:', error);
      handleDiagramError(container, error instanceof DiagramSyntaxError);
    }
  }
}
function scheduleDiagrams() {
  const version = ++revision;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void renderMermaidDiagrams(version); }, props.streaming ? 120 : 0);
}
watch([renderedBlocks, () => props.streaming], scheduleDiagrams, { flush: 'post' });
onMounted(() => { mounted = true; scheduleDiagrams(); });
onUnmounted(() => {
  mounted = false; revision++; if (timer) clearTimeout(timer);
  for (const item of svgUrls.values()) URL.revokeObjectURL(item.url);
  svgUrls.clear();
});

function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement;

  const svgCard = target.closest<HTMLElement>('.svg-preview-card');
  if (svgCard) {
    const item = svgUrls.get(svgCard);
    if (target.closest('.svg-background-btn')) {
      const surface = svgCard.querySelector('.svg-preview-surface');
      const dark = surface?.classList.toggle('bg-slate-950');
      surface?.classList.toggle('bg-white', !dark);
      const button = svgCard.querySelector('.svg-background-btn');
      if (button) button.textContent = dark ? 'Light background' : 'Dark background';
      return;
    }
    if (target.closest('.svg-toggle-btn')) {
      const preview = svgCard.querySelector('.svg-preview-surface');
      const code = svgCard.querySelector('.svg-raw');
      const showCode = code?.classList.toggle('hidden') === false;
      preview?.classList.toggle('hidden', showCode);
      const button = svgCard.querySelector('.svg-toggle-btn');
      if (button) button.textContent = showCode ? 'View Preview' : 'View Code';
      return;
    }
    if (target.closest('.svg-copy-btn') && item) {
      void navigator.clipboard.writeText(item.code).then(() => {
        const button = svgCard.querySelector('.svg-copy-btn');
        if (button) button.textContent = 'Copied!';
        setTimeout(() => { if (button?.isConnected) button.textContent = 'Copy SVG'; }, 1500);
      });
      return;
    }
    if (target.closest('.svg-download-btn') && item) {
      const link = document.createElement('a');
      const downloadUrl = URL.createObjectURL(new Blob([item.code], { type: 'image/svg+xml;charset=utf-8' }));
      link.href = downloadUrl;
      link.download = 'logo.svg';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
      return;
    }
  }

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
    @click="handleClick"
  >
    <div v-for="block in renderedBlocks" :key="block.key" class="markdown-block" v-html="block.html" />
  </div>
</template>

<style>
.markdown-block { display: contents; }
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

.markdown-body .markdown-block:last-child > p:last-child {
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
