<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { User, Sparkles, Terminal } from 'lucide-vue-next';
import GuruAvatar from './GuruAvatar.vue';
import ThoughtAccordion from './ThoughtAccordion.vue';
import ToolCallDrawer from './ToolCallDrawer.vue';
import MarkdownRenderer from './MarkdownRenderer.vue';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';

const gurusStore = useGurusStore();
const chatStore = useChatStore();

const feedRef = ref<HTMLDivElement | null>(null);

const activeGuru = computed(() => gurusStore.activeGuru);

function scrollToBottom() {
  nextTick(() => {
    if (feedRef.value) {
      feedRef.value.scrollTop = feedRef.value.scrollHeight;
    }
  });
}

// Auto-scroll when messages or streaming tokens arrive
watch(
  () => [chatStore.messages.length, chatStore.streamingContent, chatStore.streamingThought],
  () => {
    scrollToBottom();
  }
);
</script>

<template>
  <div ref="feedRef" class="flex-1 overflow-y-auto p-4 space-y-6">
    <!-- Empty State: Welcome Card -->
    <div
      v-if="chatStore.messages.length === 0 && !chatStore.isStreaming && activeGuru"
      class="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto p-6"
    >
      <GuruAvatar
        :icon="activeGuru.icon"
        size="lg"
        class="mb-3.5 shadow-sm"
      />
      <h2 class="text-lg font-bold text-foreground tracking-tight mb-1">
        {{ activeGuru.name }}
      </h2>
      <span
        class="text-[10px] uppercase px-2 py-0.5 rounded font-mono font-medium tracking-wider border mb-3 bg-muted/60 text-muted-foreground border-border/80"
      >
        {{ activeGuru.categoryLabel }}
      </span>
      <p class="text-sm text-muted-foreground leading-relaxed mb-6 font-sans max-w-md">
        {{ activeGuru.tagline }}
      </p>

      <div class="text-xs text-muted-foreground/80 font-sans">
        Select a prompt suggestion below or type your message to begin.
      </div>
    </div>

    <!-- Messages List -->
    <div
      v-for="msg in chatStore.messages"
      :key="msg.id"
      class="flex gap-3 max-w-5xl mx-auto w-full"
      :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
    >
      <!-- Assistant Avatar -->
      <GuruAvatar
        v-if="msg.role === 'assistant' && activeGuru"
        :icon="activeGuru.icon"
        size="sm"
        :show-status="false"
      />

      <!-- Message Bubble -->
      <div
        class="rounded-xl p-3.5 text-sm shadow-xs"
        :class="[
          msg.role === 'user'
            ? 'max-w-[80%] bg-primary text-primary-foreground font-sans'
            : 'flex-1 min-w-0 bg-card border border-border text-foreground'
        ]"
      >
        <!-- Thoughts if present -->
        <ThoughtAccordion
          v-if="msg.role === 'assistant' && msg.thought"
          :thought="msg.thought"
        />

        <!-- Tool calls if present -->
        <div v-if="msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0">
          <ToolCallDrawer
            v-for="tool in msg.toolCalls"
            :key="tool.id"
            :tool-call="tool"
          />
        </div>

        <!-- Message Body -->
        <MarkdownRenderer
          v-if="msg.role === 'assistant'"
          :content="msg.content"
        />
        <div v-else class="whitespace-pre-wrap leading-relaxed font-sans">
          {{ msg.content }}
        </div>
      </div>

      <!-- User Avatar -->
      <div
        v-if="msg.role === 'user'"
        class="w-8 h-8 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground shrink-0 shadow-xs"
      >
        <User :size="14" />
      </div>
    </div>

    <!-- Active Streaming Bubble (In Progress) -->
    <div
      v-if="chatStore.isStreaming"
      class="flex gap-3 max-w-5xl mx-auto w-full justify-start"
    >
      <GuruAvatar
        v-if="activeGuru"
        :icon="activeGuru.icon"
        size="sm"
        :show-status="false"
      />

      <div class="flex-1 min-w-0 rounded-xl p-3.5 text-xs bg-card border border-border text-foreground shadow-xs">
        <!-- Live Thinking Process -->
        <ThoughtAccordion
          v-if="chatStore.streamingThought"
          :thought="chatStore.streamingThought"
          :is-streaming="true"
        />

        <!-- Live Tool Calls -->
        <div v-if="chatStore.streamingToolCalls.length > 0">
          <ToolCallDrawer
            v-for="tool in chatStore.streamingToolCalls"
            :key="tool.id"
            :tool-call="tool"
          />
        </div>

        <!-- Live Content Stream -->
        <MarkdownRenderer
          v-if="chatStore.streamingContent"
          :content="chatStore.streamingContent"
        />

        <!-- Pulsing indicator if waiting for tokens -->
        <div
          v-if="!chatStore.streamingContent && !chatStore.streamingThought && chatStore.streamingToolCalls.length === 0"
          class="flex items-center gap-2 text-muted-foreground font-mono text-[11px]"
        >
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>{{ activeGuru ? activeGuru.name : 'Guru' }} is reasoning...</span>
        </div>
      </div>
    </div>
  </div>
</template>
