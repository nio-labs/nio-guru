<script setup lang="ts">
import { ref } from 'vue';
import { Brain, ChevronDown, ChevronUp } from 'lucide-vue-next';

defineProps<{
  thought: string;
  isStreaming?: boolean;
}>();

const isOpen = ref(false);
</script>

<template>
  <div v-if="thought && thought.trim().length > 0" class="my-2 border border-border/70 rounded-lg bg-muted/30 overflow-hidden text-xs font-mono">
    <button
      type="button"
      class="w-full px-3 py-1.5 flex items-center justify-between text-muted-foreground hover:text-foreground transition-colors bg-muted/40"
      @click="isOpen = !isOpen"
    >
      <div class="flex items-center gap-2">
        <Brain :size="13" class="text-indigo-400" />
        <span class="font-medium text-[11px]">Thought Process</span>
        <span v-if="isStreaming" class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
      </div>
      <component :is="isOpen ? ChevronUp : ChevronDown" :size="12" />
    </button>

    <div v-show="isOpen || isStreaming" class="p-3 border-t border-border/50 text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto font-mono bg-card/20">
      {{ thought }}
    </div>
  </div>
</template>
