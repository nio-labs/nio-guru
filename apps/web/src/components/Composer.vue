<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { ArrowUp, Square, Sparkles } from 'lucide-vue-next';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';

const gurusStore = useGurusStore();
const chatStore = useChatStore();

const prompt = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const activeGuru = computed(() => gurusStore.activeGuru);

const placeholderText = computed(() => {
  if (!activeGuru.value) return 'Type a message...';
  if (activeGuru.value.id === 'direct-chat') {
    return 'Ask anything... (Enter to send, Shift+Enter for newline)';
  }
  return `Ask ${activeGuru.value.name}... (Enter to send, Shift+Enter for newline)`;
});

function adjustTextareaHeight() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
}

function handleInput() {
  adjustTextareaHeight();
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function handleSend() {
  const trimmed = prompt.value.trim();
  if (!trimmed || chatStore.isStreaming) return;
  const currentPrompt = trimmed;
  prompt.value = '';
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
  }
  chatStore.sendMessage(currentPrompt, gurusStore.activeGuruId);
}

function handleSampleClick(sample: string) {
  prompt.value = sample;
  nextTick(() => {
    adjustTextareaHeight();
    handleSend();
  });
}
</script>

<template>
  <div class="p-4 md:px-6 border-t border-border bg-card/60 shrink-0">
    <div class="w-full">
      <!-- Sample prompt chips (only shown when conversation has no messages) -->
      <div
        v-if="chatStore.messages.length === 0 && activeGuru && activeGuru.samplePrompts?.length > 0"
        class="mb-3 flex flex-wrap gap-2"
      >
        <button
          v-for="(sample, idx) in activeGuru.samplePrompts"
          :key="idx"
          type="button"
          class="text-xs text-left px-3 py-1.5 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80 transition-all font-sans truncate max-w-md shadow-2xs block"
          :title="sample"
          @click="handleSampleClick(sample)"
        >
          {{ sample }}
        </button>
      </div>

      <!-- Composer input box -->
      <div class="relative flex items-end gap-2 bg-background border border-border rounded-xl p-2.5 shadow-xs focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all">
        <textarea
          ref="textareaRef"
          v-model="prompt"
          rows="1"
          :placeholder="placeholderText"
          class="flex-1 bg-transparent border-0 resize-none text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none p-1.5 font-sans max-h-44 leading-relaxed"
          @input="handleInput"
          @keydown="handleKeyDown"
        />

        <!-- Action Button (Send / Stop) -->
        <button
          v-if="!chatStore.isStreaming"
          type="button"
          class="p-2 rounded-lg bg-foreground text-background hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
          :disabled="!prompt.trim()"
          title="Send Prompt (Enter)"
          @click="handleSend"
        >
          <ArrowUp :size="14" :stroke-width="2.5" />
        </button>

        <button
          v-else
          type="button"
          class="p-2 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 transition-all shrink-0"
          title="Stop Response"
          @click="chatStore.stopStreaming()"
        >
          <Square :size="14" :stroke-width="2.5" class="fill-current" />
        </button>
      </div>

      <div class="flex items-center justify-between mt-2 px-1 text-[10px] text-muted-foreground font-mono">
        <span>OpenGuru &middot; Engine: nio</span>
        <span>Shift+Enter for newline</span>
      </div>
    </div>
  </div>
</template>
