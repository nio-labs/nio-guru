<script setup lang="ts">
import { computed } from 'vue';
import {
  Trash2,
  Cpu,
  Layers,
  Sparkles,
  Wrench,
} from 'lucide-vue-next';
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

          <!-- List of skills attached to Guru -->
          <div
            v-if="activeGuru.defaultSkills && activeGuru.defaultSkills.length > 0"
            class="flex items-center gap-1 flex-wrap"
          >
            <span
              v-for="skill in activeGuru.defaultSkills"
              :key="skill"
              class="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border/80 shadow-3xs"
            >
              <Wrench :size="9" class="text-primary/70 shrink-0" />
              {{ skill }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: Model Selector & Actions -->
    <div class="flex items-center gap-2.5">
      <!-- Searchable Model Selector -->
      <ModelSelector />

      <!-- Delete Thread Button (if active) -->
      <button
        v-if="chatStore.activeConversationId"
        type="button"
        class="p-1.5 rounded-lg border border-border bg-background hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
        title="Delete Current Conversation"
        @click="chatStore.deleteConversation(chatStore.activeConversationId)"
      >
        <Trash2 :size="14" />
      </button>
    </div>
  </header>
</template>
