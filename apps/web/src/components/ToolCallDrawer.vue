<script setup lang="ts">
import { ref } from 'vue';
import {
  Wrench,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileCode,
  Terminal,
} from 'lucide-vue-next';
import type { ToolCall } from '../stores/chat';

const props = defineProps<{
  toolCall: ToolCall;
}>();

const isOpen = ref(false);
</script>

<template>
  <div class="my-2 border border-border/80 rounded-lg bg-card overflow-hidden text-xs font-mono shadow-xs">
    <button
      type="button"
      class="w-full px-3 py-2 flex items-center justify-between text-foreground hover:bg-muted/40 transition-colors bg-muted/20"
      @click="isOpen = !isOpen"
    >
      <div class="flex items-center gap-2 min-w-0">
        <!-- Tool Status Icon -->
        <Loader2 v-if="toolCall.status === 'running'" :size="13" class="text-sky-500 animate-spin shrink-0" />
        <CheckCircle2 v-else-if="toolCall.status === 'completed'" :size="13" class="text-emerald-500 shrink-0" />
        <AlertCircle v-else :size="13" class="text-destructive shrink-0" />

        <!-- Tool Name -->
        <span class="font-semibold text-[11px] truncate">
          {{ toolCall.title || toolCall.tool }}
        </span>

        <span
          class="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono border inline-flex items-center gap-1"
          :class="[
            toolCall.status === 'running' ? 'bg-sky-500/10 text-sky-500 border-sky-500/30' :
            toolCall.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
            'bg-destructive/10 text-destructive border-destructive/20'
          ]"
        >
          <span v-if="toolCall.status === 'running'" class="inline-flex items-center gap-1">
            Running
            <span class="inline-flex gap-0.5">
              <span class="w-1 h-1 rounded-full bg-sky-500 animate-bounce" style="animation-delay: 0ms" />
              <span class="w-1 h-1 rounded-full bg-sky-500 animate-bounce" style="animation-delay: 150ms" />
              <span class="w-1 h-1 rounded-full bg-sky-500 animate-bounce" style="animation-delay: 300ms" />
            </span>
          </span>
          <span v-else>{{ toolCall.status }}</span>
        </span>
      </div>

      <component :is="isOpen ? ChevronUp : ChevronDown" :size="12" class="text-muted-foreground ml-2 shrink-0" />
    </button>

    <!-- Drawer Content -->
    <div v-show="isOpen" class="p-3 border-t border-border/60 bg-muted/10 space-y-2 text-[11px]">
      <!-- Tool Input -->
      <div v-if="toolCall.input">
        <div class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
          Input Parameters
        </div>
        <pre class="p-2 rounded bg-muted/50 border border-border overflow-x-auto text-[10px] text-foreground font-mono leading-tight">{{ JSON.stringify(toolCall.input, null, 2) }}</pre>
      </div>

      <!-- Tool Output -->
      <div v-if="toolCall.output">
        <div class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
          Output Result
        </div>
        <pre class="p-2 rounded bg-muted/50 border border-border overflow-x-auto text-[10px] text-foreground font-mono leading-tight max-h-48 overflow-y-auto">{{ typeof toolCall.output === 'string' ? toolCall.output : JSON.stringify(toolCall.output, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>
