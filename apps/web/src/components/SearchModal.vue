<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Search, X, Loader2, Bot } from '../lib/icons';
import { GURU_ICONS } from '../lib/guruIcons';
import { useChatStore } from '../stores/chat';
import { useUiStore } from '../stores/ui';

export interface SearchResultItem {
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  guruId: string;
  guruName: string;
  guruIcon: string;
  guruColor: string;
  role: 'user' | 'assistant' | 'system';
  snippet: string;
  fullContent: string;
  createdAt: number;
}

const chatStore = useChatStore();
const uiStore = useUiStore();
const dialogRef = ref<HTMLDialogElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

const isOpen = ref(false);
const query = ref('');
const loading = ref(false);
const results = ref<SearchResultItem[]>([]);
const selectedIndex = ref(0);
let searchDebounceTimer: number | undefined;

function open() {
  isOpen.value = true;
  uiStore.isSearchModalOpen = true;
  dialogRef.value?.showModal();
  nextTick(() => {
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
  });
}

function close() {
  dialogRef.value?.close();
  isOpen.value = false;
  uiStore.isSearchModalOpen = false;
  query.value = '';
  results.value = [];
  selectedIndex.value = 0;
}

async function performSearch(q: string) {
  const trimmed = q.trim();
  if (!trimmed) {
    results.value = [];
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=30`);
    if (res.ok) {
      const data = await res.json();
      results.value = data.results || [];
      selectedIndex.value = 0;
    }
  } catch (err) {
    console.warn('Search request failed:', err);
  } finally {
    loading.value = false;
  }
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialogRef.value) {
    close();
  }
}

function handleInput() {
  if (searchDebounceTimer !== undefined) {
    clearTimeout(searchDebounceTimer);
  }
  const trimmed = query.value.trim();
  if (!trimmed) {
    results.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  searchDebounceTimer = window.setTimeout(() => {
    void performSearch(query.value);
  }, 250);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (results.value.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % results.value.length;
      scrollToSelected();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (results.value.length > 0) {
      selectedIndex.value = (selectedIndex.value - 1 + results.value.length) % results.value.length;
      scrollToSelected();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (results.value[selectedIndex.value]) {
      selectResult(results.value[selectedIndex.value]);
    }
  } else if (e.key === 'Escape') {
    close();
  }
}

function scrollToSelected() {
  nextTick(() => {
    const activeEl = document.querySelector('[data-search-selected="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  });
}

async function selectResult(item: SearchResultItem) {
  close();
  await chatStore.jumpToMessage(item.conversationId, item.messageId, item.guruId);
}

function formatResultTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Global Cmd+K / Ctrl+K shortcut listener
function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (isOpen.value) {
      close();
    } else {
      open();
    }
  }
}

watch(() => uiStore.isSearchModalOpen, (val) => {
  if (val && !isOpen.value) {
    open();
  } else if (!val && isOpen.value) {
    close();
  }
});

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  if (searchDebounceTimer !== undefined) clearTimeout(searchDebounceTimer);
});

defineExpose({
  open,
  close,
});
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialogRef"
      class="m-auto w-full max-w-xl h-[440px] max-h-[85vh] rounded-xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-xs focus:outline-none overflow-hidden"
      @click="onBackdropClick"
      @close="close"
    >
      <div class="w-full h-full flex flex-col overflow-hidden">
        <!-- Search Input Header -->
        <div class="flex items-center px-4 py-3 border-b border-border gap-3 bg-muted/20 shrink-0">
          <Search :size="18" class="text-muted-foreground shrink-0" />
          <input
            ref="searchInputRef"
            v-model="query"
            type="text"
            placeholder="Search all conversations, Gurus, and messages…"
            class="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/70 outline-none text-foreground"
            @input="handleInput"
            @keydown="handleKeydown"
          />
          <div v-if="loading" class="animate-spin text-muted-foreground shrink-0">
            <Loader2 :size="16" />
          </div>
          <button
            type="button"
            class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 cursor-pointer"
            title="Close search (Esc)"
            @click="close"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Results Body with stable scroll height -->
        <div class="flex-1 overflow-y-auto p-2 divide-y divide-border/40">
          <!-- Empty Query State -->
          <div v-if="!query.trim()" class="h-full flex flex-col items-center justify-center py-10 text-center text-xs text-muted-foreground">
            <p class="font-medium text-foreground/80">Search across all your historical conversations</p>
            <p class="mt-1 text-[11px] opacity-70">Type words, code snippets, or topics to jump directly to any answer.</p>
            <div class="mt-5 flex items-center justify-center gap-2 text-[10px] font-mono text-muted-foreground/60">
              <span class="px-1.5 py-0.5 rounded border border-border bg-muted">↑</span>
              <span class="px-1.5 py-0.5 rounded border border-border bg-muted">↓</span>
              <span>to navigate</span>
              <span class="px-1.5 py-0.5 rounded border border-border bg-muted">↵</span>
              <span>to select</span>
              <span class="px-1.5 py-0.5 rounded border border-border bg-muted">Esc</span>
              <span>to close</span>
            </div>
          </div>

          <!-- No Results State -->
          <div v-else-if="!loading && results.length === 0" class="h-full flex items-center justify-center py-10 text-center text-xs text-muted-foreground">
            No matches found for <span class="font-semibold text-foreground ml-1">"{{ query }}"</span>.
          </div>

          <!-- Search Results List -->
          <template v-else>
            <div
              v-for="(item, idx) in results"
              :key="item.messageId"
              :data-search-selected="selectedIndex === idx"
              class="p-2.5 rounded-lg cursor-pointer transition-colors flex items-start gap-3 my-0.5"
              :class="selectedIndex === idx ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/60 border border-transparent'"
              @mouseenter="selectedIndex = idx"
              @click="selectResult(item)"
            >
              <!-- Guru Icon Avatar -->
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-border bg-muted/50 text-foreground">
                <component :is="GURU_ICONS[item.guruIcon as keyof typeof GURU_ICONS] || Bot" :size="16" />
              </div>

              <!-- Match Details -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2 mb-1">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <span class="text-xs font-semibold text-foreground truncate">
                      {{ item.conversationTitle }}
                    </span>
                    <span class="text-[10px] px-1.5 py-0.2 rounded font-mono bg-muted text-muted-foreground border border-border/60 shrink-0">
                      {{ item.guruName }}
                    </span>
                  </div>
                  <span class="text-[10px] text-muted-foreground font-mono shrink-0">
                    {{ formatResultTime(item.createdAt) }}
                  </span>
                </div>

                <!-- Message Snippet with highlighting -->
                <p class="text-xs text-muted-foreground line-clamp-2 leading-relaxed break-words font-sans">
                  <span class="font-semibold text-xs text-foreground/80 mr-1 uppercase text-[9px] tracking-wider">
                    {{ item.role === 'user' ? 'You:' : `${item.guruName}:` }}
                  </span>
                  {{ item.snippet }}
                </p>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer Help Bar -->
        <div class="px-4 py-2 bg-muted/30 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
          <span>{{ results.length }} result{{ results.length === 1 ? '' : 's' }}</span>
          <div class="flex items-center gap-3 text-[10px] font-mono">
            <span><kbd class="px-1 py-0.5 rounded border border-border bg-muted">↑↓</kbd> Navigate</span>
            <span><kbd class="px-1 py-0.5 rounded border border-border bg-muted">↵</kbd> Open</span>
            <span><kbd class="px-1 py-0.5 rounded border border-border bg-muted">Esc</kbd> Exit</span>
          </div>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
dialog:not([open]) {
  display: none !important;
}
</style>
