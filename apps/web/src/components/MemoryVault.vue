<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { Brain, Plus, Trash2, X, Sparkles, Check } from '../lib/icons';
import { useMemoriesStore } from '../stores/memories';
import { useUiStore } from '../stores/ui';

const memoriesStore = useMemoriesStore();
const uiStore = useUiStore();

const dialogRef = ref<HTMLDialogElement | null>(null);
const newMemoryText = ref('');
const isAdding = ref(false);

function open() {
  uiStore.openMemoryModal();
  dialogRef.value?.showModal();
  void memoriesStore.fetchMemories();
}

function close() {
  dialogRef.value?.close();
  uiStore.closeMemoryModal();
  newMemoryText.value = '';
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialogRef.value) {
    close();
  }
}

async function handleAddMemory() {
  const text = newMemoryText.value.trim();
  if (!text || isAdding.value) return;
  isAdding.value = true;
  try {
    await memoriesStore.addMemory(text);
    newMemoryText.value = '';
  } finally {
    isAdding.value = false;
  }
}

function formatMemoryDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

defineExpose({
  open,
  close,
});
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialogRef"
      class="m-auto w-[520px] max-w-[calc(100vw-2rem)] max-h-[85vh] rounded-xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-xs focus:outline-none overflow-hidden"
      @click="onBackdropClick"
      @close="close"
    >
      <div class="w-full h-full flex flex-col overflow-hidden">
        <!-- Header -->
        <header class="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/20">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Brain :size="17" />
            </div>
            <div>
              <h2 class="text-sm font-semibold text-foreground flex items-center gap-2">
                Personal Memory Vault
                <span class="text-[10px] px-1.5 py-0.2 rounded font-mono font-normal border border-border bg-muted text-muted-foreground">
                  Experimental
                </span>
              </h2>
              <p class="text-[11px] text-muted-foreground">
                Gurus recall these facts across conversations when memory is enabled.
              </p>
            </div>
          </div>
          <button
            type="button"
            class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Close"
            @click="close"
          >
            <X :size="16" />
          </button>
        </header>

        <!-- Toggle Switch Bar -->
        <div class="px-5 py-3 border-b border-border bg-muted/40 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium text-foreground">Enable Long-Term Memory</span>
            <span class="text-[10px] text-muted-foreground">
              {{ uiStore.enableLongTermMemory ? '(Injected into prompts)' : '(Disabled — zero latency overhead)' }}
            </span>
          </div>
          <button
            type="button"
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
            :class="uiStore.enableLongTermMemory ? 'bg-primary' : 'bg-muted-foreground/30'"
            @click="uiStore.toggleLongTermMemory()"
          >
            <span
              class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out"
              :class="uiStore.enableLongTermMemory ? 'translate-x-4' : 'translate-x-0'"
            />
          </button>
        </div>

        <!-- Add Memory Input Form -->
        <div class="p-4 border-b border-border flex gap-2">
          <input
            v-model="newMemoryText"
            type="text"
            placeholder="e.g. My primary stack is TypeScript, Vue 3, and Hono..."
            class="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-1 focus:ring-ring font-sans"
            @keydown.enter.prevent="handleAddMemory"
          />
          <button
            type="button"
            :disabled="!newMemoryText.trim() || isAdding"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-foreground text-background hover:opacity-90 disabled:opacity-40 transition-opacity cursor-pointer shrink-0"
            @click="handleAddMemory"
          >
            <Plus :size="13" />
            <span>Add</span>
          </button>
        </div>

        <!-- Memories List -->
        <div class="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[380px]">
          <div v-if="memoriesStore.loading && memoriesStore.memories.length === 0" class="text-center py-8 text-xs text-muted-foreground">
            Loading memories…
          </div>
          <div v-else-if="memoriesStore.memories.length === 0" class="text-center py-8 text-xs text-muted-foreground">
            <p class="font-medium text-foreground/80">No memories stored yet</p>
            <p class="mt-1 text-[11px] opacity-70">
              Add your tech preferences, project architectural rules, or background details above.
            </p>
          </div>
          <template v-else>
            <div
              v-for="mem in memoriesStore.memories"
              :key="mem.id"
              class="p-3 rounded-lg border border-border bg-card/70 hover:bg-muted/40 transition-colors flex items-start justify-between gap-3 group"
            >
              <div class="flex-1 min-w-0">
                <p class="text-xs text-foreground font-sans leading-relaxed break-words">
                  {{ mem.content }}
                </p>
                <span class="text-[10px] text-muted-foreground font-mono mt-1 block">
                  Added {{ formatMemoryDate(mem.createdAt) }}
                </span>
              </div>
              <button
                type="button"
                class="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                title="Delete memory"
                @click="memoriesStore.deleteMemory(mem.id)"
              >
                <Trash2 :size="13" />
              </button>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <footer class="flex items-center justify-between border-t border-border px-5 py-3 bg-muted/20 text-[11px] text-muted-foreground">
          <span>{{ memoriesStore.memories.length }} stored memor{{ memoriesStore.memories.length === 1 ? 'y' : 'ies' }}</span>
          <button
            type="button"
            class="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-muted transition-colors cursor-pointer"
            @click="close"
          >
            Done
          </button>
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
dialog:not([open]) {
  display: none !important;
}
</style>
