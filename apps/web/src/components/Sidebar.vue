<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Search,
  Pin,
  Users,
  Sun,
  Moon,
  Monitor,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-vue-next';
import GuruCard from './GuruCard.vue';
import GuruAvatar from './GuruAvatar.vue';
import GuruLogo from './GuruLogo.vue';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';
import { useThemeStore } from '../stores/theme';
import { useUiStore } from '../stores/ui';

const gurusStore = useGurusStore();
const chatStore = useChatStore();
const themeStore = useThemeStore();
const uiStore = useUiStore();

const searchQuery = ref('');

const filteredPinnedGurus = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return gurusStore.pinnedGurus;
  return gurusStore.pinnedGurus.filter(
    (g) =>
      g.name.toLowerCase().includes(query) ||
      g.categoryLabel.toLowerCase().includes(query) ||
      (g.lastMessage?.content && g.lastMessage.content.toLowerCase().includes(query))
  );
});

const filteredUnpinnedGurus = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return gurusStore.unpinnedGurus;
  return gurusStore.unpinnedGurus.filter(
    (g) =>
      g.name.toLowerCase().includes(query) ||
      g.categoryLabel.toLowerCase().includes(query) ||
      (g.lastMessage?.content && g.lastMessage.content.toLowerCase().includes(query))
  );
});

function handleSelectGuru(id: string) {
  if (gurusStore.activeGuruId === id) return;
  gurusStore.setActiveGuru(id);
  chatStore.activeConversationId = null;
  chatStore.messages = [];
  chatStore.fetchConversations(id);
}

function handleTogglePin(id: string) {
  gurusStore.togglePin(id);
}
</script>

<template>
  <aside
    class="h-full flex flex-col bg-card/50 border-r border-border select-none transition-all duration-200 ease-in-out shrink-0"
    :class="uiStore.isSidebarCollapsed ? 'w-16' : 'w-80'"
  >
    <!-- Top Branding Header -->
    <div
      class="p-3 border-b border-border flex items-center justify-between"
      :class="uiStore.isSidebarCollapsed ? 'flex-col gap-2 p-2' : ''"
    >
      <!-- Expanded Branding -->
      <div v-if="!uiStore.isSidebarCollapsed" class="flex items-center gap-2.5 min-w-0">
        <GuruLogo :size="20" class="text-foreground shrink-0" />
        <div class="min-w-0">
          <h1 class="text-xs font-bold tracking-wider uppercase text-foreground truncate">
            OpenGuru
          </h1>
          <p class="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
            <span>engine:</span>
            <span class="text-emerald-500 font-semibold">nio-ai</span>
          </p>
        </div>
      </div>

      <!-- Collapsed Logo -->
      <div v-else class="flex items-center justify-center py-1">
        <GuruLogo :size="20" class="text-foreground shrink-0" />
      </div>

      <!-- Header Action Buttons -->
      <div class="flex items-center gap-1">
        <!-- New Chat Button (only in expanded mode) -->
        <button
          v-if="!uiStore.isSidebarCollapsed"
          type="button"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
          title="Start New Conversation"
          @click="chatStore.startNewConversation(gurusStore.activeGuruId)"
        >
          <Plus :size="13" />
        </button>

        <!-- Collapse / Expand Toggle Button -->
        <button
          type="button"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
          :title="uiStore.isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'"
          @click="uiStore.toggleSidebar()"
        >
          <component
            :is="uiStore.isSidebarCollapsed ? PanelLeftOpen : PanelLeftClose"
            :size="13"
          />
        </button>
      </div>
    </div>

    <!-- ================= EXPANDED VIEW ================= -->
    <template v-if="!uiStore.isSidebarCollapsed">
      <!-- Search input -->
      <div class="p-2.5 border-b border-border/60">
        <div class="relative flex items-center">
          <Search :size="14" class="absolute left-2.5 text-muted-foreground pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filter Gurus & domains..."
            class="w-full pl-9 pr-3 py-1.5 text-xs bg-muted/50 border border-border rounded-lg placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring transition-all"
          />
        </div>
      </div>

      <!-- Scrollable Guru Lists -->
      <div class="flex-1 overflow-y-auto p-2 space-y-4">
        <!-- PINNED GURUS (Only rendered if user has pinned gurus!) -->
        <div v-if="filteredPinnedGurus.length > 0">
          <div class="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Pin :size="12" class="text-muted-foreground" />
            <span>Pinned Gurus</span>
            <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono font-normal">
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
          <div class="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Users :size="12" class="text-muted-foreground" />
            <span>All Gurus</span>
            <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono font-normal">
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
            :class="themeStore.mode === 'light' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
            title="Light Theme"
            @click="themeStore.setTheme('light')"
          >
            <Sun :size="13" />
          </button>
          <button
            type="button"
            class="p-1.5 rounded-md transition-colors"
            :class="themeStore.mode === 'dark' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
            title="Dark Theme"
            @click="themeStore.setTheme('dark')"
          >
            <Moon :size="13" />
          </button>
          <button
            type="button"
            class="p-1.5 rounded-md transition-colors"
            :class="themeStore.mode === 'auto' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
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
    </template>

    <!-- ================= COLLAPSED RAIL VIEW ================= -->
    <template v-else>
      <div class="flex-1 overflow-y-auto py-2 px-1 flex flex-col items-center gap-1.5">
        <button
          v-for="guru in gurusStore.gurus"
          :key="guru.id"
          type="button"
          class="p-1 rounded-xl transition-all relative group"
          :title="`${guru.name} (${guru.categoryLabel})`"
          @click="handleSelectGuru(guru.id)"
        >
          <GuruAvatar
            :icon="guru.icon"
            size="md"
            :is-active="gurusStore.activeGuruId === guru.id"
            :show-status="false"
          />
        </button>
      </div>

      <!-- Collapsed Footer Theme Toggle -->
      <div class="p-2 border-t border-border flex flex-col items-center gap-2">
        <button
          type="button"
          class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
          :title="`Toggle Theme (current: ${themeStore.mode})`"
          @click="themeStore.toggleTheme()"
        >
          <Sun v-if="themeStore.mode === 'light'" :size="14" />
          <Moon v-else-if="themeStore.mode === 'dark'" :size="14" />
          <Monitor v-else :size="14" />
        </button>
      </div>
    </template>
  </aside>
</template>
