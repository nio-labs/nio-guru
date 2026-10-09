<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { ArrowUp, Square, Paperclip, X } from '../lib/icons';
import { attachmentError, attachmentExtension, IMAGE_EXTENSIONS } from '../../../../packages/shared/src/attachments';
import { getStepFunImageModelId } from '../../../../packages/shared/src/nio-models';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';

const gurusStore = useGurusStore();
const chatStore = useChatStore();

const prompt = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const attachments = ref<File[]>([]);
const uploadError = ref('');
const isDraggingFiles = ref(false);
let dragTimer: ReturnType<typeof setTimeout> | undefined;

function addFiles(files: File[]) {
  if (!files.length) return;
  if (chatStore.isStreaming || chatStore.isLoadingConversation) {
    uploadError.value = 'Wait for this response to finish before attaching files.';
    return;
  }
  const next = [...attachments.value, ...files];
  uploadError.value = attachmentError(next);
  if (!uploadError.value) {
    attachments.value = next;
    if (files.some(file => IMAGE_EXTENSIONS.has(attachmentExtension(file.name)))) {
      const stepFunId = getStepFunImageModelId(chatStore.availableModels);
      if (chatStore.selectedModel !== stepFunId) chatStore.selectModel(stepFunId);
    }
  }
}

function chooseFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  addFiles(Array.from(input.files || []));
  input.value = '';
}

function hasDraggedFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
}
function handleDragOver(event: DragEvent) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = chatStore.isStreaming || chatStore.isLoadingConversation ? 'none' : 'copy';
  isDraggingFiles.value = !chatStore.isStreaming && !chatStore.isLoadingConversation;
  if (dragTimer) clearTimeout(dragTimer);
  dragTimer = setTimeout(() => { isDraggingFiles.value = false; }, 900);
}
function handleDragLeave(event: DragEvent) {
  if (event.clientX > 0 && event.clientY > 0
    && event.clientX < window.innerWidth && event.clientY < window.innerHeight) return;
  isDraggingFiles.value = false;
  if (dragTimer) clearTimeout(dragTimer);
}
function handleDrop(event: DragEvent) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  isDraggingFiles.value = false;
  if (dragTimer) clearTimeout(dragTimer);
  addFiles(Array.from(event.dataTransfer?.files || []));
}
function handlePaste(event: ClipboardEvent) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const files = Array.from(clipboard.files);
  if (!files.length) {
    for (const item of Array.from(clipboard.items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }
  if (!files.length) return;
  event.preventDefault();
  addFiles(files);
}
onMounted(() => {
  window.addEventListener('dragover', handleDragOver);
  window.addEventListener('dragleave', handleDragLeave);
  window.addEventListener('drop', handleDrop);
  window.addEventListener('paste', handlePaste);
});
onUnmounted(() => {
  window.removeEventListener('dragover', handleDragOver);
  window.removeEventListener('dragleave', handleDragLeave);
  window.removeEventListener('drop', handleDrop);
  window.removeEventListener('paste', handlePaste);
  if (dragTimer) clearTimeout(dragTimer);
});
watch(() => [gurusStore.activeGuruId, chatStore.activeConversationId], () => {
  attachments.value = []; uploadError.value = '';
});

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
  if ((!trimmed && !attachments.value.length) || chatStore.isStreaming || chatStore.isLoadingConversation) return;
  const currentPrompt = trimmed;
  const files = [...attachments.value];
  if (files.some(file => IMAGE_EXTENSIONS.has(attachmentExtension(file.name)))) {
    const stepFunId = getStepFunImageModelId(chatStore.availableModels);
    if (chatStore.selectedModel !== stepFunId) chatStore.selectModel(stepFunId);
  }
  attachments.value = []; uploadError.value = '';
  prompt.value = '';
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto';
  }
  chatStore.sendMessage(currentPrompt, gurusStore.activeGuruId, files);
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
  <div v-if="isDraggingFiles" role="status" class="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-teal-500 bg-teal-500/15 text-lg font-semibold text-teal-700 backdrop-blur-sm dark:text-teal-300">
    Drop files to attach
  </div>
  <div class="p-4 md:px-6 border-t border-border bg-card/60 shrink-0">
    <div class="w-full">
      <!-- Sample prompt chips (only shown when conversation has no messages) -->
      <div
        v-if="!chatStore.isLoadingConversation && chatStore.messages.length === 0 && activeGuru && activeGuru.samplePrompts?.length > 0"
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
      <div v-if="attachments.length" class="mb-2 flex flex-wrap gap-2">
        <span v-for="(file, index) in attachments" :key="index" class="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs">
          <Paperclip :size="13" class="shrink-0" /><span class="truncate" :title="file.name">{{ file.name }}</span>
          <span class="shrink-0 text-muted-foreground">{{ file.size >= 1024 * 1024 ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : Math.ceil(file.size / 1024) + ' KB' }}</span>
          <button type="button" :aria-label="`Remove ${file.name}`" @click="attachments.splice(index, 1); uploadError = ''"><X :size="13" /></button>
        </span>
      </div>
      <p v-if="uploadError" role="alert" class="mb-2 text-xs text-destructive">{{ uploadError }}</p>
      <input ref="fileInput" type="file" multiple class="hidden" accept=".txt,.md,.csv,.json,.yaml,.yml,.xml,.html,.css,.js,.ts,.py,.rs,.log,.sql,.svg,.png,.jpg,.jpeg,.gif,.webp" aria-label="Attach text files or images" @change="chooseFiles" />
      <div class="relative flex items-end gap-2 bg-background border border-border rounded-xl p-2.5 shadow-xs focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-all">
        <button type="button" :disabled="chatStore.isStreaming || chatStore.isLoadingConversation" title="Attach UTF-8 text or images (up to 8 files)" aria-label="Attach files" class="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" @click="fileInput?.click()"><Paperclip :size="17" /></button>
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
          :disabled="(!prompt.trim() && !attachments.length) || chatStore.isLoadingConversation"
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
        <span>NioGuru &middot; Engine: nio</span>
        <span>Shift+Enter for newline</span>
      </div>
    </div>
  </div>
</template>
