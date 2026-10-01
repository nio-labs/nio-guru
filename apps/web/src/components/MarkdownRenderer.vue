<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

const props = defineProps<{
  content: string;
}>();

// Configure marked with highlight.js
marked.setOptions({
  gfm: true,
  breaks: true,
});

const renderedHtml = computed(() => {
  if (!props.content) return '';
  try {
    const raw = marked.parse(props.content) as string;
    return raw;
  } catch {
    return props.content;
  }
});

function handleCopy(event: MouseEvent) {
  const target = event.target as HTMLElement;
  const button = target.closest('button[data-code]');
  if (!button) return;
  const code = button.getAttribute('data-code');
  if (code) {
    navigator.clipboard.writeText(code);
    button.textContent = 'Copied!';
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 1500);
  }
}
</script>

<template>
  <div
    class="markdown-body prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed break-words"
    v-html="renderedHtml"
    @click="handleCopy"
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
  font-family: 'Martian Mono', monospace !important;
  font-size: 11px;
  line-height: 1.5;
}

.markdown-body code:not(pre code) {
  background-color: hsl(var(--muted));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border) / 0.6);
  padding: 0.15rem 0.35rem;
  border-radius: 0.25rem;
  font-family: 'Martian Mono', monospace !important;
  font-size: 11px;
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
  font-family: 'Martian Mono', monospace !important;
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
