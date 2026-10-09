<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { FileCode, Plus, Trash2, X, Loader2 } from '../lib/icons';
import { useGurusStore, type GuruDocument } from '../stores/gurus';
import { useChatStore } from '../stores/chat';

const gurusStore = useGurusStore();
const chatStore = useChatStore();

const dialogRef = ref<HTMLDialogElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const uploadError = ref('');
const deletingId = ref<string | null>(null);

const activeGuru = computed(() => gurusStore.activeGuru);
const documents = computed(() => gurusStore.documents);

async function open() {
  if (!activeGuru.value) return;
  uploadError.value = '';
  dialogRef.value?.showModal();
  await gurusStore.fetchDocuments(activeGuru.value.id);
}

function close() {
  dialogRef.value?.close();
  uploadError.value = '';
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialogRef.value) {
    close();
  }
}

function triggerFileSelect() {
  uploadError.value = '';
  fileInputRef.value?.click();
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || !activeGuru.value) return;

  if (file.size > 500 * 1024) {
    uploadError.value = 'Document must be 500 KB or less.';
    target.value = '';
    return;
  }

  isUploading.value = true;
  uploadError.value = '';
  try {
    await gurusStore.uploadDocument(activeGuru.value.id, file);
    target.value = '';
  } catch (err: any) {
    uploadError.value = err.message || 'Could not upload document.';
  } finally {
    isUploading.value = false;
  }
}

async function handleDelete(doc: GuruDocument) {
  if (!activeGuru.value || deletingId.value) return;
  deletingId.value = doc.id;
  try {
    await gurusStore.deleteDocument(activeGuru.value.id, doc.id);
  } catch (err: any) {
    uploadError.value = err.message || 'Could not delete document.';
  } finally {
    deletingId.value = null;
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

watch(() => gurusStore.activeGuruId, (newId) => {
  if (newId) {
    void gurusStore.fetchDocuments(newId);
  }
});
</script>

<template>
  <div>
    <!-- Header Trigger Button -->
    <button
      type="button"
      :disabled="chatStore.isStreaming"
      class="h-9 flex items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 cursor-pointer"
      title="Guru Knowledge Base documents"
      @click="open"
    >
      <FileCode :size="14" />
      <span>Knowledge</span>
      <span
        v-if="documents.length > 0"
        class="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-primary/10 text-primary border border-primary/20"
      >
        {{ documents.length }}
      </span>
    </button>

    <!-- Knowledge Base Dialog Modal -->
    <Teleport to="body">
      <dialog
        ref="dialogRef"
        class="m-auto w-[460px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card text-foreground p-0 shadow-2xl backdrop:bg-black/50 focus:outline-none overflow-hidden"
        @click="onBackdropClick"
        @close="close"
      >
        <!-- Modal Header -->
        <header class="flex items-center gap-3 border-b border-border px-5 py-4 bg-muted/20">
          <FileCode :size="20" class="text-primary" />
          <div class="flex-1 min-w-0">
            <h2 class="font-semibold text-sm truncate">
              {{ activeGuru?.name }} Knowledge Base
            </h2>
            <p class="text-[11px] text-muted-foreground">
              Reference documents automatically injected into this Guru's context.
            </p>
          </div>
          <button
            type="button"
            class="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            title="Close"
            @click="close"
          >
            <X :size="18" />
          </button>
        </header>

        <!-- Hidden File Input -->
        <input
          ref="fileInputRef"
          type="file"
          class="hidden"
          accept=".txt,.md,.markdown,.json,.yaml,.yml,.csv,.ts,.js,.py"
          @change="handleFileChange"
        />

        <!-- Modal Body -->
        <div class="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <!-- Upload Action Box -->
          <div
            class="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/50 transition-colors bg-muted/10 cursor-pointer"
            @click="triggerFileSelect"
          >
            <div class="flex flex-col items-center justify-center gap-1.5">
              <div class="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Plus v-if="!isUploading" :size="16" />
                <Loader2 v-else :size="16" class="animate-spin" />
              </div>
              <p class="text-xs font-medium text-foreground">
                {{ isUploading ? 'Uploading & indexing document…' : 'Upload knowledge document' }}
              </p>
              <p class="text-[11px] text-muted-foreground">
                Supports .md, .txt, .json, .yaml, .csv, code specs (up to 500 KB)
              </p>
            </div>
          </div>

          <!-- Error Alert -->
          <div
            v-if="uploadError"
            role="alert"
            class="p-3 rounded-lg text-xs bg-destructive/10 border border-destructive/20 text-destructive"
          >
            {{ uploadError }}
          </div>

          <!-- Document List Section -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Attached Documents ({{ documents.length }})
              </span>
              <span v-if="gurusStore.isLoadingDocuments" class="text-[11px] text-muted-foreground flex items-center gap-1">
                <Loader2 :size="12" class="animate-spin" /> Loading…
              </span>
            </div>

            <!-- Empty Document State -->
            <div
              v-if="!gurusStore.isLoadingDocuments && documents.length === 0"
              class="py-6 text-center text-xs text-muted-foreground bg-muted/20 rounded-lg border border-border/40"
            >
              No documents attached yet. Upload specifications, manuals, or company guides above to give {{ activeGuru?.name }} private memory.
            </div>

            <!-- Documents Item Cards -->
            <div v-else class="space-y-1.5">
              <div
                v-for="doc in documents"
                :key="doc.id"
                class="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/60 hover:bg-muted/40 transition-colors"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-7 h-7 rounded-md bg-muted flex items-center justify-center text-muted-foreground shrink-0 border border-border/60">
                    <FileCode :size="14" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-xs font-medium text-foreground truncate" :title="doc.filename">
                      {{ doc.filename }}
                    </p>
                    <p class="text-[10px] text-muted-foreground font-mono">
                      {{ formatBytes(doc.fileSize) }}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  :disabled="deletingId === doc.id"
                  class="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
                  title="Remove document"
                  @click.stop="handleDelete(doc)"
                >
                  <Trash2 v-if="deletingId !== doc.id" :size="14" />
                  <Loader2 v-else :size="14" class="animate-spin" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <footer class="flex items-center justify-between border-t border-border px-5 py-3 bg-muted/20">
          <span class="text-[11px] text-muted-foreground">
            Persisted securely in NioDB
          </span>
          <button
            type="button"
            class="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted transition-colors cursor-pointer"
            @click="close"
          >
            Done
          </button>
        </footer>
      </dialog>
    </Teleport>
  </div>
</template>
