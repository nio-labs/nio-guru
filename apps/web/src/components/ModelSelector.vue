<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { Cpu, Search, Check, ChevronDown, X, Sparkles } from 'lucide-vue-next';
import { DEFAULT_NIO_MODEL_ID } from '../../../../packages/shared/src/nio-models';
import { useChatStore } from '../stores/chat';

const chatStore = useChatStore();

const isOpen = ref(false);
const searchQuery = ref('');
const selectedCategory = ref<'all' | 'free' | 'claude' | 'gpt' | 'gemini' | 'deepseek'>('all');
const dropdownRef = ref<HTMLDivElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

onClickOutside(dropdownRef, () => {
  isOpen.value = false;
});

const models = computed(() => {
  if (chatStore.availableModels.length > 0) {
    return chatStore.availableModels;
  }
  return [{ id: DEFAULT_NIO_MODEL_ID, label: 'Kilo Auto (Free)' }];
});

const currentModel = computed(() => models.value.find((m) => m.id === chatStore.selectedModel));

const currentModelLabel = computed(() => {
  if (!currentModel.value) return chatStore.selectedModel;
  return cleanLabel(currentModel.value.label);
});

const isCurrentModelFree = computed(() => {
  return currentModel.value ? isFreeModel(currentModel.value) : false;
});

function cleanLabel(label: string): string {
  if (!label) return '';
  return label
    .replace(/ · Kilo Gateway.*$/, '')
    .replace(/\s*[\(\[]free[\)\]]/gi, '')
    .trim();
}

function isFreeModel(model: { id: string; label: string }): boolean {
  const text = (model.id + ' ' + model.label).toLowerCase();
  return text.includes('free') || text.includes('kilo-auto');
}

const filteredModels = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  const cat = selectedCategory.value;

  return models.value.filter((m) => {
    // Category filter
    if (cat === 'free' && !isFreeModel(m)) return false;
    if (cat === 'claude' && !m.id.toLowerCase().includes('claude')) return false;
    if (cat === 'gpt' && !m.id.toLowerCase().includes('gpt')) return false;
    if (cat === 'gemini' && !m.id.toLowerCase().includes('gemini')) return false;
    if (cat === 'deepseek' && !m.id.toLowerCase().includes('deepseek')) return false;

    // Search query filter
    if (!q) return true;
    return (
      m.id.toLowerCase().includes(q) ||
      m.label.toLowerCase().includes(q)
    );
  });
});

function toggleDropdown() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  }
}

function selectModel(modelId: string) {
  chatStore.selectModel(modelId);
  isOpen.value = false;
  searchQuery.value = '';
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    isOpen.value = false;
  }
}
</script>

<template>
  <div ref="dropdownRef" class="relative inline-block text-left" @keydown="handleKeydown">
    <!-- Trigger Button -->
    <button
      type="button"
      class="h-9 flex items-center gap-2 px-3 text-xs bg-muted/60 hover:bg-muted border border-border rounded-lg text-foreground transition-all font-mono shadow-2xs max-w-[280px]"
      :class="{ 'ring-1 ring-ring border-ring': isOpen }"
      :title="`Current model: ${currentModelLabel}`"
      @click="toggleDropdown"
    >
      <Cpu :size="13" class="text-primary/70 shrink-0" />
      <span class="truncate flex-1 text-left font-medium">{{ currentModelLabel }}</span>
      <span
        v-if="isCurrentModelFree"
        class="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 uppercase font-mono font-medium shrink-0"
      >
        Free
      </span>
      <ChevronDown
        :size="12"
        class="text-muted-foreground shrink-0 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <!-- Searchable Dropdown Popover -->
    <div
      v-if="isOpen"
      class="absolute right-0 mt-1.5 w-80 md:w-96 rounded-xl bg-card border border-border shadow-xl z-50 overflow-hidden flex flex-col font-mono animate-in fade-in zoom-in-95 duration-100"
    >
      <!-- Search Bar -->
      <div class="p-2.5 border-b border-border bg-muted/30">
        <div class="relative flex items-center">
          <Search :size="13" class="absolute left-2.5 text-muted-foreground pointer-events-none" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="Search 450+ models (e.g. claude, gpt-4, free)..."
            class="w-full pl-8 pr-7 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring font-mono"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-2 text-muted-foreground hover:text-foreground p-0.5"
            @click="searchQuery = ''"
          >
            <X :size="12" />
          </button>
        </div>

        <!-- Quick Filter Pills -->
        <div class="flex items-center gap-1 mt-2 overflow-x-auto pb-0.5 text-[10px]">
          <button
            type="button"
            class="px-2 py-0.5 rounded-full transition-colors font-medium border"
            :class="selectedCategory === 'all' ? 'bg-foreground text-background border-foreground' : 'bg-muted/60 text-muted-foreground hover:text-foreground border-border/80'"
            @click="selectedCategory = 'all'"
          >
            All
          </button>
          <button
            type="button"
            class="px-2 py-0.5 rounded-full transition-colors font-medium border inline-flex items-center gap-1"
            :class="selectedCategory === 'free' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-muted/60 text-emerald-600 dark:text-emerald-400 hover:text-foreground border-border/80'"
            @click="selectedCategory = 'free'"
          >
            <Sparkles :size="9" />
            Free
          </button>
          <button
            type="button"
            class="px-2 py-0.5 rounded-full transition-colors font-medium border"
            :class="selectedCategory === 'claude' ? 'bg-foreground text-background border-foreground' : 'bg-muted/60 text-muted-foreground hover:text-foreground border-border/80'"
            @click="selectedCategory = 'claude'"
          >
            Claude
          </button>
          <button
            type="button"
            class="px-2 py-0.5 rounded-full transition-colors font-medium border"
            :class="selectedCategory === 'gpt' ? 'bg-foreground text-background border-foreground' : 'bg-muted/60 text-muted-foreground hover:text-foreground border-border/80'"
            @click="selectedCategory = 'gpt'"
          >
            GPT
          </button>
          <button
            type="button"
            class="px-2 py-0.5 rounded-full transition-colors font-medium border"
            :class="selectedCategory === 'deepseek' ? 'bg-foreground text-background border-foreground' : 'bg-muted/60 text-muted-foreground hover:text-foreground border-border/80'"
            @click="selectedCategory = 'deepseek'"
          >
            DeepSeek
          </button>
          <button
            type="button"
            class="px-2 py-0.5 rounded-full transition-colors font-medium border"
            :class="selectedCategory === 'gemini' ? 'bg-foreground text-background border-foreground' : 'bg-muted/60 text-muted-foreground hover:text-foreground border-border/80'"
            @click="selectedCategory = 'gemini'"
          >
            Gemini
          </button>
        </div>
      </div>

      <!-- Models List (Scrollable) -->
      <div class="max-h-72 overflow-y-auto divide-y divide-border/40 p-1">
        <div
          v-if="filteredModels.length === 0"
          class="py-6 text-center text-xs text-muted-foreground"
        >
          No models matching "{{ searchQuery }}"
        </div>

        <button
          v-for="model in filteredModels"
          :key="model.id"
          type="button"
          class="w-full px-2.5 py-2 text-left rounded-lg hover:bg-muted/60 transition-colors flex items-center justify-between gap-2 group"
          :class="chatStore.selectedModel === model.id ? 'bg-accent text-accent-foreground font-semibold' : 'text-foreground'"
          @click="selectModel(model.id)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="text-xs truncate font-medium">{{ cleanLabel(model.label) }}</span>
              <span
                v-if="isFreeModel(model)"
                class="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 uppercase font-mono font-medium shrink-0"
              >
                Free
              </span>
            </div>
            <div class="text-[10px] text-muted-foreground truncate font-mono mt-0.5 opacity-80 group-hover:opacity-100">
              {{ model.id }}
            </div>
          </div>

          <Check
            v-if="chatStore.selectedModel === model.id"
            :size="14"
            class="text-primary shrink-0"
          />
        </button>
      </div>

      <!-- Dropdown Footer -->
      <div class="px-3 py-1.5 border-t border-border bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{{ filteredModels.length }} models</span>
        <span>Esc to close</span>
      </div>
    </div>
  </div>
</template>
