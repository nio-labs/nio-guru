<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { User, Sparkles, Terminal, Copy, Check } from 'lucide-vue-next';
import GuruAvatar from './GuruAvatar.vue';
import ThoughtAccordion from './ThoughtAccordion.vue';
import ToolCallDrawer from './ToolCallDrawer.vue';
import MarkdownRenderer from './MarkdownRenderer.vue';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';

const gurusStore = useGurusStore();
const chatStore = useChatStore();

const feedRef = ref<HTMLDivElement | null>(null);
const copiedMsgId = ref<string | null>(null);

const activeGuru = computed(() => gurusStore.activeGuru);

function scrollToBottom() {
  nextTick(() => {
    if (feedRef.value) {
      feedRef.value.scrollTop = feedRef.value.scrollHeight;
    }
  });
}

function formatTime(timestamp?: number) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function handleCopyMessage(id: string, text: string) {
  navigator.clipboard.writeText(text);
  copiedMsgId.value = id;
  setTimeout(() => {
    if (copiedMsgId.value === id) {
      copiedMsgId.value = null;
    }
  }, 1500);
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
  <div ref="feedRef" class="flex-1 overflow-y-auto p-4 md:px-6 space-y-6">
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
      <p v-if="activeGuru.id !== 'direct-chat' && activeGuru.tagline" class="text-sm text-muted-foreground leading-relaxed mb-4 font-sans max-w-md">
        {{ activeGuru.tagline }}
      </p>

      <!-- Equipped Skills -->
      <div v-if="activeGuru.defaultSkills && activeGuru.defaultSkills.length > 0" class="mb-5 flex flex-col items-center">
        <span class="text-[10px] uppercase font-mono font-medium text-muted-foreground/75 tracking-wider mb-2">
          Equipped Skills ({{ activeGuru.defaultSkills.length }})
        </span>
        <div class="flex flex-wrap items-center justify-center gap-1.5 max-w-sm">
          <span
            v-for="skill in activeGuru.defaultSkills"
            :key="skill"
            class="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-muted/70 border border-border text-foreground font-mono shadow-3xs"
          >
            <Sparkles :size="11" class="text-indigo-400" />
            {{ skill }}
          </span>
        </div>
      </div>

      <div class="text-xs text-muted-foreground/80 font-sans">
        Select a prompt suggestion below or type your message to begin.
      </div>
    </div>

    <!-- Messages List -->
    <div
      v-for="msg in chatStore.messages"
      :key="msg.id"
      class="flex gap-3 w-full"
      :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
    >
      <!-- Assistant Avatar -->
      <GuruAvatar
        v-if="msg.role === 'assistant' && activeGuru"
        :icon="activeGuru.icon"
        size="sm"
        :show-status="false"
      />

      <!-- Message Content Container (Bubble + Meta Action Bar) -->
      <div
        class="flex flex-col"
        :class="msg.role === 'user' ? 'items-end max-w-[85%]' : 'flex-1 min-w-0'"
      >
        <!-- Message Bubble -->
        <div
          class="rounded-xl p-4 shadow-xs w-full"
          :class="[
            msg.role === 'user'
              ? 'bg-primary text-primary-foreground text-sm leading-relaxed'
              : 'bg-card border border-border text-foreground text-sm'
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
          <div v-else class="whitespace-pre-wrap leading-relaxed text-sm">
            {{ msg.content }}
          </div>
        </div>

        <!-- Meta action bar below message: Timestamp & Copy Button -->
        <div class="flex items-center gap-2 mt-1.5 px-1 text-[11px] text-muted-foreground/80 font-mono">
          <span>{{ formatTime(msg.createdAt) }}</span>
          <span>&middot;</span>
          <button
            type="button"
            class="inline-flex items-center gap-1 hover:text-foreground transition-colors py-0.5 px-1 rounded hover:bg-muted"
            title="Copy message text"
            @click="handleCopyMessage(msg.id, msg.content)"
          >
            <Check v-if="copiedMsgId === msg.id" :size="12" class="text-emerald-500" />
            <Copy v-else :size="12" />
            <span>{{ copiedMsgId === msg.id ? 'Copied' : 'Copy' }}</span>
          </button>
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
      class="flex gap-3 w-full justify-start"
    >
      <GuruAvatar
        v-if="activeGuru"
        :icon="activeGuru.icon"
        size="sm"
        :show-status="false"
      />

      <div class="flex-1 min-w-0 flex flex-col">
        <div class="flex-1 min-w-0 rounded-xl p-4 text-sm bg-card border border-border text-foreground shadow-xs">
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

          <!-- Animated indicator if waiting for tokens -->
          <div
            v-if="!chatStore.streamingContent && !chatStore.streamingThought && chatStore.streamingToolCalls.length === 0"
            class="flex items-center gap-2 text-muted-foreground font-mono text-xs"
          >
            <span class="relative flex h-2 w-2">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span class="animate-pulse">{{ activeGuru ? activeGuru.name : 'Guru' }} is thinking</span>
            <span class="inline-flex gap-0.5 ml-0.5">
              <span class="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style="animation-delay: 0ms" />
              <span class="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style="animation-delay: 150ms" />
              <span class="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style="animation-delay: 300ms" />
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
