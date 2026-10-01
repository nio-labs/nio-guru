<script setup lang="ts">
import { computed } from 'vue';
import {
  Plus,
  Trash2,
  Cpu,
  Layers,
  Sparkles,
  PanelLeftOpen,
} from 'lucide-vue-next';
import GuruAvatar from './GuruAvatar.vue';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';
import { useUiStore } from '../stores/ui';

const gurusStore = useGurusStore();
const chatStore = useChatStore();
const uiStore = useUiStore();

const activeGuru = computed(() => gurusStore.activeGuru);

const modelsList = computed(() => {
  if (chatStore.availableModels.length > 0) {
    return chatStore.availableModels;
  }
  return [
    { id: 'kilo-auto/free', label: 'Kilo Auto (Free)' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { id: 'deepseek-r1', label: 'DeepSeek R1' },
    { id: 'openai/gpt-4o', label: 'GPT-4o' },
  ];
});
</script>

<template>
  <header
    v-if="activeGuru"
    class="h-14 px-4 border-b border-border bg-card/40 flex items-center justify-between shrink-0 select-none"
  >
    <!-- Left: Guru Info -->
    <div class="flex items-center gap-3">
      <!-- Expand Sidebar Button (only when collapsed) -->
      <button
        v-if="uiStore.isSidebarCollapsed"
        type="button"
        class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors mr-0.5"
        title="Expand Sidebar"
        @click="uiStore.toggleSidebar()"
      >
        <PanelLeftOpen :size="14" />
      </button>

      <GuruAvatar
        :icon="activeGuru.icon"
        size="sm"
        :show-status="true"
      />
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-xs font-semibold text-foreground tracking-tight">
            {{ activeGuru.name }}
          </h2>
          <span
            class="text-[9px] uppercase px-1.5 py-0.2 rounded font-mono font-medium tracking-wider border bg-muted/80 text-muted-foreground border-border"
          >
            {{ activeGuru.categoryLabel }}
          </span>
        </div>
        <p class="text-[10px] text-muted-foreground truncate max-w-sm">
          {{ activeGuru.tagline }}
        </p>
      </div>
    </div>

    <!-- Right: Model Selector & Mode Controls -->
    <div class="flex items-center gap-2">
      <!-- Mode Toggle (Ask / Plan / Build) -->
      <div class="flex items-center bg-muted/50 p-0.5 rounded-lg border border-border text-[11px] font-mono">
        <button
          type="button"
          class="px-2 py-1 rounded transition-colors"
          :class="chatStore.selectedMode === 'ask' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="chatStore.selectedMode = 'ask'"
        >
          Ask
        </button>
        <button
          type="button"
          class="px-2 py-1 rounded transition-colors"
          :class="chatStore.selectedMode === 'plan' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="chatStore.selectedMode = 'plan'"
        >
          Plan
        </button>
        <button
          type="button"
          class="px-2 py-1 rounded transition-colors"
          :class="chatStore.selectedMode === 'build' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
          @click="chatStore.selectedMode = 'build'"
        >
          Build
        </button>
      </div>

      <!-- Model Dropdown -->
      <div class="relative flex items-center">
        <Cpu :size="12" class="absolute left-2.5 text-muted-foreground pointer-events-none" />
        <select
          v-model="chatStore.selectedModel"
          class="pl-7 pr-3 py-1 text-xs bg-muted/50 border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono appearance-none cursor-pointer max-w-[170px] truncate"
        >
          <option
            v-for="model in modelsList"
            :key="model.id"
            :value="model.id"
          >
            {{ model.label || model.id }}
          </option>
        </select>
      </div>

      <!-- New Thread Button -->
      <button
        type="button"
        class="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-border bg-background hover:bg-muted text-foreground transition-colors font-mono"
        title="Start Fresh Conversation"
        @click="chatStore.startNewConversation(activeGuru.id)"
      >
        <Plus :size="12" />
        <span>New</span>
      </button>

      <!-- Delete Thread Button (if active) -->
      <button
        v-if="chatStore.activeConversationId"
        type="button"
        class="p-1.5 rounded-lg border border-border bg-background hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
        title="Delete Current Conversation"
        @click="chatStore.deleteConversation(chatStore.activeConversationId)"
      >
        <Trash2 :size="13" />
      </button>
    </div>
  </header>
</template>
