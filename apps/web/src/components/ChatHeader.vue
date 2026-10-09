<script setup lang="ts">
import { computed } from 'vue';
import { Plus } from '../lib/icons';
import GuruSkills from './GuruSkills.vue';
import GuruAvatar from './GuruAvatar.vue';
import ModelSelector from './ModelSelector.vue';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';

const gurusStore = useGurusStore();
const chatStore = useChatStore();

const activeGuru = computed(() => gurusStore.activeGuru);
</script>

<template>
  <header
    v-if="activeGuru"
    class="h-14 px-4 border-b border-border bg-card/40 flex items-center justify-between shrink-0 select-none"
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
    <div class="flex items-center gap-2.5">
      <GuruSkills />
      <!-- Searchable Model Selector -->
      <ModelSelector />

      <button
        type="button"
        :disabled="chatStore.isLoadingConversation"
        class="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        title="Start New Conversation"
        aria-label="Start new conversation"
        @click="chatStore.startNewConversation(activeGuru.id)"
      >
        <Plus :size="14" />
      </button>

    </div>
  </header>
</template>
