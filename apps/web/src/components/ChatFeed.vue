<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { User, Sparkles, Terminal, Copy, Check, ArrowDown, Paperclip, AlertCircle, RotateCcw } from '../lib/icons';
import GuruAvatar from './GuruAvatar.vue';
import ThoughtAccordion from './ThoughtAccordion.vue';
import ToolCallDrawer from './ToolCallDrawer.vue';
import MarkdownRenderer from './MarkdownRenderer.vue';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';

const gurusStore = useGurusStore();
const chatStore = useChatStore();

const feedRef = ref<HTMLDivElement | null>(null);
const contentRef = ref<HTMLDivElement | null>(null);
const followOutput = ref(true);
let scrollFrame: number | undefined;
let resizeObserver: ResizeObserver | undefined;
let preservingOlderScroll = false;
const copiedMsgId = ref<string | null>(null);
const retryingMsgId = ref<string | null>(null);

function isErrorNotice(msg: { role: string; content: string }) {
  return msg.role === 'system' && (
    msg.content.startsWith('Error:') ||
    /timeout|timed out|stream ended|failed|could not complete/i.test(msg.content)
  );
}

async function handleRetry(msgId: string) {
  if (chatStore.isStreaming || retryingMsgId.value) return;
  retryingMsgId.value = msgId;
  try {
    await chatStore.retryMessage(msgId);
  } finally {
    retryingMsgId.value = null;
  }
}

const activeGuru = computed(() => gurusStore.activeGuru);

function scrollToBottom() {
  if (scrollFrame !== undefined) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = undefined;
    if (feedRef.value && followOutput.value && !preservingOlderScroll && !chatStore.isLoadingConversation) {
      feedRef.value.scrollTop = feedRef.value.scrollHeight;
    }
  });
}
function handleScroll() {
  const feed = feedRef.value;
  if (!feed || chatStore.isLoadingConversation || preservingOlderScroll) return;
  followOutput.value = feed.scrollHeight - feed.clientHeight - feed.scrollTop < 72;
  if (feed.scrollTop < 100) void loadOlder();
}
async function loadOlder() {
  const feed = feedRef.value;
  if (!feed || preservingOlderScroll || !chatStore.hasMoreMessages || chatStore.isLoadingOlderMessages) return;
  preservingOlderScroll = true;
  followOutput.value = false;
  const conversationId = chatStore.activeConversationId;
  const previousHeight = feed.scrollHeight;
  const previousTop = feed.scrollTop;
  try {
    const loaded = await chatStore.loadOlderMessages();
    await nextTick();
    if (loaded && feedRef.value === feed && conversationId === chatStore.activeConversationId) {
      feed.scrollTop = previousTop + feed.scrollHeight - previousHeight;
    }
  } finally { preservingOlderScroll = false; }
}
function handleWheel(event: WheelEvent) {
  if (event.deltaY < 0 && (feedRef.value?.scrollTop ?? 0) < 100) void loadOlder();
}
function jumpToLatest() { followOutput.value = true; scrollToBottom(); }
onMounted(() => {
  resizeObserver = new ResizeObserver(() => { if (followOutput.value) scrollToBottom(); });
  if (contentRef.value) resizeObserver.observe(contentRef.value);
});
onUnmounted(() => {
  resizeObserver?.disconnect();
  if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
});

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
  () => [chatStore.messages.length, chatStore.streamingContent, chatStore.streamingThought, chatStore.isLoadingConversation],
  () => {
    if (followOutput.value) scrollToBottom();
  }, { flush: 'post' }
);
watch(() => [gurusStore.activeGuruId, chatStore.activeConversationId], () => {
  followOutput.value = true; scrollToBottom();
}, { flush: 'post' });
</script>

<template>
  <div class="relative flex-1 min-h-0">
  <div ref="feedRef" class="h-full overflow-y-auto p-4 md:px-6 [overflow-anchor:none]" @scroll="handleScroll" @wheel.passive="handleWheel">
    <div ref="contentRef" class="min-h-full space-y-6">
    <div v-if="chatStore.isLoadingConversation" role="status" aria-label="Loading conversation" class="space-y-6 animate-pulse" aria-busy="true">
      <span class="sr-only">Loading conversation…</span>
      <div class="ml-auto flex max-w-[65%] justify-end gap-3" aria-hidden="true"><div class="h-14 w-72 rounded-xl bg-muted/80" /><div class="h-8 w-8 rounded-lg bg-muted/80" /></div>
      <div class="flex max-w-[80%] gap-3" aria-hidden="true"><div class="h-8 w-8 shrink-0 rounded-lg bg-muted/80" /><div class="w-full space-y-3 rounded-xl border border-border p-4"><div class="h-3 w-3/4 rounded bg-muted/80" /><div class="h-3 w-full rounded bg-muted/80" /><div class="h-3 w-1/2 rounded bg-muted/80" /></div></div>
      <div class="ml-auto flex max-w-[55%] justify-end gap-3" aria-hidden="true"><div class="h-11 w-56 rounded-xl bg-muted/80" /><div class="h-8 w-8 rounded-lg bg-muted/80" /></div>
    </div>
    <template v-else>
    <button v-if="chatStore.hasMoreMessages" type="button" :disabled="chatStore.isLoadingOlderMessages" class="mx-auto block rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50" @click="loadOlder">Load earlier messages</button>
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
              : isErrorNotice(msg)
                ? 'bg-destructive/10 border border-destructive/30 text-destructive dark:text-red-300 text-sm'
                : 'bg-card border border-border text-foreground text-sm'
          ]"
        >
          <!-- Error layout with Retry button -->
          <div v-if="isErrorNotice(msg)" class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div class="flex items-start gap-2.5 min-w-0">
              <AlertCircle :size="16" class="text-destructive dark:text-red-400 shrink-0 mt-0.5" />
              <div class="whitespace-pre-wrap leading-relaxed text-sm font-sans break-words text-destructive dark:text-red-300">
                {{ msg.content }}
              </div>
            </div>
            <button
              type="button"
              :disabled="chatStore.isStreaming || !!retryingMsgId"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-destructive/15 hover:bg-destructive/25 text-destructive dark:text-red-200 border border-destructive/30 hover:border-destructive/40 transition-all shrink-0 shadow-3xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer self-start sm:self-auto"
              title="Retry request"
              @click="handleRetry(msg.id)"
            >
              <RotateCcw :size="13" :class="{ 'animate-spin': retryingMsgId === msg.id }" />
              <span>Retry</span>
            </button>
          </div>

          <template v-else>
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
            <div v-if="msg.attachments?.length" class="mb-2 flex flex-wrap gap-2">
              <span v-for="(file, index) in msg.attachments" :key="index" class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-current/20 px-2 py-1 text-xs"><Paperclip :size="12" class="shrink-0" /><span class="truncate" :title="file.name">{{ file.name }}</span></span>
            </div>
            <MarkdownRenderer
              v-if="msg.role === 'assistant'"
              :content="msg.content"
            />
            <div v-else class="whitespace-pre-wrap leading-relaxed text-sm">
              {{ msg.content }}
            </div>
          </template>
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
          <template v-if="isErrorNotice(msg)">
            <span>&middot;</span>
            <button
              type="button"
              :disabled="chatStore.isStreaming || !!retryingMsgId"
              class="inline-flex items-center gap-1 text-destructive hover:text-destructive/80 transition-colors py-0.5 px-1 rounded hover:bg-destructive/10 disabled:opacity-50"
              title="Retry request"
              @click="handleRetry(msg.id)"
            >
              <RotateCcw :size="12" :class="{ 'animate-spin': retryingMsgId === msg.id }" />
              <span>Retry</span>
            </button>
          </template>
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
            :streaming="true"
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
    </template>
    </div>
  </div>
  <div v-if="chatStore.isLoadingOlderMessages" role="status" class="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-border bg-card px-3 py-1 text-xs shadow-sm">Loading earlier messages…</div>
  <button v-if="chatStore.olderMessagesError" type="button" class="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full border border-destructive/30 bg-card px-3 py-1 text-xs text-destructive shadow-sm" @click="loadOlder">Could not load earlier messages. Retry</button>
  <button v-if="!followOutput && !chatStore.isLoadingConversation" type="button" class="absolute bottom-4 right-6 flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs shadow-md" @click="jumpToLatest"><ArrowDown :size="14" /> Latest</button>
  </div>
</template>
