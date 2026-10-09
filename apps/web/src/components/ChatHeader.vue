<script setup lang="ts">
import { computed } from 'vue';
import { Plus, Search } from '../lib/icons';
import GuruSkills from './GuruSkills.vue';
import GuruKnowledge from './GuruKnowledge.vue';
import GuruAvatar from './GuruAvatar.vue';
import ModelSelector from './ModelSelector.vue';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';
import { useUiStore } from '../stores/ui';

const gurusStore = useGurusStore();
const chatStore = useChatStore();
const uiStore = useUiStore();

const activeGuru = computed(() => gurusStore.activeGuru);
</script>

<template>
  <header
    v-if="activeGuru"
    class="app-toolbar h-14 px-4 border-b border-border bg-card/40 flex items-center justify-between shrink-0 select-none"
  >
    <!-- Left: Guru Info -->
    <div class="flex items-center gap-3 min-w-0">
      <GuruAvatar
        :icon="activeGuru.icon"
        size="sm"
        :show-status="true"
      />
      <div class="min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-sm font-semibold text-foreground tracking-tight">
            {{ activeGuru.name }}
          </h2>
          <span
            class="text-[10px] uppercase px-1.5 py-0.5 rounded font-mono font-medium tracking-wider border bg-muted/80 text-muted-foreground border-border"
          >
            {{ activeGuru.categoryLabel }}
          </span>

        </div>
      </div>
    </div>

    <!-- Right: Model Selector & Actions -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        title="Search conversation history (Cmd+K)"
        aria-label="Search conversation history"
        @click="uiStore.openSearchModal()"
      >
        <Search :size="14" />
      </button>

      <GuruKnowledge />
      <GuruSkills />
      <!-- Searchable Model Selector -->
      <ModelSelector />

      <button
        type="button"
        :disabled="chatStore.isLoadingConversation"
        class="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
        title="Start New Conversation"
        aria-label="Start new conversation"
        @click="chatStore.startNewConversation(activeGuru.id)"
      >
        <Plus :size="14" />
      </button>

    </div>
  </header>
</template>

<style scoped>
@media (display-mode: window-controls-overlay) {
  .app-toolbar {
    height: max(3.5rem, env(titlebar-area-height, 0px));
    padding-right: max(1rem, calc(100vw - env(titlebar-area-x, 100vw) - env(titlebar-area-width, 0px) + 0.5rem), 140px);
    -webkit-app-region: drag;
  }

  .app-toolbar :deep(button),
  .app-toolbar :deep(input),
  .app-toolbar :deep(select),
  .app-toolbar :deep(a) {
    -webkit-app-region: no-drag;
  }
}
</style>
