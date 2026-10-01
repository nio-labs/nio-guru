<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Terminal,
  Search,
  Pin,
  Users,
  Sun,
  Moon,
  Monitor,
  Plus,
  MessageSquare,
  Sparkles,
} from 'lucide-vue-next';
import GuruCard from './GuruCard.vue';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';
import { useThemeStore } from '../stores/theme';

const gurusStore = useGurusStore();
const chatStore = useChatStore();
const themeStore = useThemeStore();

const searchQuery = ref('');

const filteredPinnedGurus = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return gurusStore.pinnedGurus;
  return gurusStore.pinnedGurus.filter(
    (g) =>
      g.name.toLowerCase().includes(query) ||
      g.categoryLabel.toLowerCase().includes(query) ||
      g.tagline.toLowerCase().includes(query)
  );
});

const filteredUnpinnedGurus = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return gurusStore.unpinnedGurus;
  return gurusStore.unpinnedGurus.filter(
    (g) =>
      g.name.toLowerCase().includes(query) ||
      g.categoryLabel.toLowerCase().includes(query) ||
      g.tagline.toLowerCase().includes(query)
  );
});

function handleSelectGuru(id: string) {
  gurusStore.setActiveGuru(id);
  chatStore.fetchConversations(id);
}

function handleTogglePin(id: string) {
  gurusStore.togglePin(id);
}
</script>

<template>
  <aside class="w-80 h-full flex flex-col bg-card/50 border-r border-border select-none">
    <!-- Top Branding Header -->
    <div class="p-3.5 border-b border-border flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-foreground text-background flex items-center justify-center font-bold text-xs shadow-sm">
          <Terminal :size="15" />
        </div>
        <div>
          <h1 class="text-xs font-bold tracking-wider uppercase text-foreground">
            OpenGuru
          </h1>
          <p class="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
            <span>engine:</span>
            <span class="text-emerald-500 font-semibold">nio-ai</span>
          </p>
        </div>
      </div>

      <!-- New Chat Button -->
      <button
        type="button"
        class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
        title="Start New Conversation"
        @click="chatStore.startNewConversation(gurusStore.activeGuruId)"
      >
        <Plus :size="14" />
      </button>
    </div>

    <!-- Search input -->
    <div class="p-2.5 border-b border-border/60">
      <div class="relative flex items-center">
        <Search :size="13" class="absolute left-2.5 text-muted-foreground pointer-events-none" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Filter Gurus & domains..."
          class="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 border border-border rounded-md placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring transition-all"
        />
      </div>
    </div>

    <!-- Scrollable Guru Lists -->
    <div class="flex-1 overflow-y-auto p-2 space-y-4">
      <!-- PINNED GURUS -->
      <div v-if="filteredPinnedGurus.length > 0">
        <div class="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          <Pin :size="11" class="text-muted-foreground" />
          <span>Pinned Gurus</span>
          <span class="ml-auto text-[9px] px-1.5 py-0.2 rounded bg-muted font-mono font-normal">
            {{ filteredPinnedGurus.length }}
          </span>
        </div>
        <div class="space-y-1 mt-1">
          <GuruCard
            v-for="guru in filteredPinnedGurus"
            :key="guru.id"
            :guru="guru"
            :is-active="gurusStore.activeGuruId === guru.id"
            @select="handleSelectGuru"
            @toggle-pin="handleTogglePin"
          />
        </div>
      </div>

      <!-- ALL GURUS -->
      <div v-if="filteredUnpinnedGurus.length > 0">
        <div class="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          <Users :size="11" class="text-muted-foreground" />
          <span>All Gurus</span>
          <span class="ml-auto text-[9px] px-1.5 py-0.2 rounded bg-muted font-mono font-normal">
            {{ filteredUnpinnedGurus.length }}
          </span>
        </div>
        <div class="space-y-1 mt-1">
          <GuruCard
            v-for="guru in filteredUnpinnedGurus"
            :key="guru.id"
            :guru="guru"
            :is-active="gurusStore.activeGuruId === guru.id"
            @select="handleSelectGuru"
            @toggle-pin="handleTogglePin"
          />
        </div>
      </div>

      <div
        v-if="filteredPinnedGurus.length === 0 && filteredUnpinnedGurus.length === 0"
        class="text-center py-8 text-xs text-muted-foreground"
      >
        No Gurus found matching "{{ searchQuery }}"
      </div>
    </div>

    <!-- Footer with Theme Toggle -->
    <div class="p-2.5 border-t border-border bg-card/30 flex items-center justify-between text-xs">
      <div class="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border">
        <button
          type="button"
          class="p-1.5 rounded-md transition-colors"
          :class="themeStore.mode === 'light' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          title="Light Theme"
          @click="themeStore.setTheme('light')"
        >
          <Sun :size="13" />
        </button>
        <button
          type="button"
          class="p-1.5 rounded-md transition-colors"
          :class="themeStore.mode === 'dark' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          title="Dark Theme"
          @click="themeStore.setTheme('dark')"
        >
          <Moon :size="13" />
        </button>
        <button
          type="button"
          class="p-1.5 rounded-md transition-colors"
          :class="themeStore.mode === 'auto' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          title="System Theme"
          @click="themeStore.setTheme('auto')"
        >
          <Monitor :size="13" />
        </button>
      </div>

      <div class="text-[10px] text-muted-foreground font-mono">
        v0.1.0
      </div>
    </div>
  </aside>
</template>
