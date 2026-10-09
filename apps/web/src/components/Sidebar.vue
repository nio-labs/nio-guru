<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  Search,
  Pin,
  Users,
  Sun,
  Moon,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
  X,
} from '../lib/icons';
import AddGuruDialog from './AddGuruDialog.vue';
import GuruCard from './GuruCard.vue';
import GuruAvatar from './GuruAvatar.vue';
import GuruLogo from './GuruLogo.vue';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';
import { useThemeStore } from '../stores/theme';
import { useUiStore } from '../stores/ui';

const gurusStore = useGurusStore();
const chatStore = useChatStore();
const themeStore = useThemeStore();
const uiStore = useUiStore();

const searchQuery = ref('');
const addGuruDialog = ref<InstanceType<typeof AddGuruDialog> | null>(null);
const deleteDialog = ref<HTMLDialogElement | null>(null);
const deleteTarget = ref<{ id: string; name: string } | null>(null);
const deleteBusy = ref(false);
const deleteError = ref('');

function requestDeleteGuru(id: string) {
  const guru = gurusStore.gurus.find(item => item.id === id);
  if (!guru?.isCustom || chatStore.isStreaming) return;
  deleteTarget.value = { id: guru.id, name: guru.name };
  deleteError.value = '';
  deleteDialog.value?.showModal();
}

async function confirmDeleteGuru() {
  const target = deleteTarget.value;
  if (!target || deleteBusy.value || chatStore.isStreaming) return;
  deleteBusy.value = true;
  deleteError.value = '';
  try {
    const wasActive = gurusStore.activeGuruId === target.id;
    await gurusStore.deleteGuru(target.id);
    if (wasActive) await chatStore.switchGuru('direct-chat');
    deleteDialog.value?.close();
  } catch (error) { deleteError.value = (error as Error).message; }
  finally { deleteBusy.value = false; }
}

const filteredPinnedGurus = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return gurusStore.pinnedGurus;
  return gurusStore.pinnedGurus.filter(
    (g) =>
      g.name.toLowerCase().includes(query) ||
      g.categoryLabel.toLowerCase().includes(query) ||
      (g.lastMessage?.content && g.lastMessage.content.toLowerCase().includes(query))
  );
});

const filteredUnpinnedGurus = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  if (!query) return gurusStore.unpinnedGurus;
  return gurusStore.unpinnedGurus.filter(
    (g) =>
      g.name.toLowerCase().includes(query) ||
      g.categoryLabel.toLowerCase().includes(query) ||
      (g.lastMessage?.content && g.lastMessage.content.toLowerCase().includes(query))
  );
});

function handleSelectGuru(id: string) {
  void chatStore.switchGuru(id);
}

function handleTogglePin(id: string) {
  gurusStore.togglePin(id);
}
</script>

<template>
  <aside
    class="h-full flex flex-col bg-card/50 border-r border-border select-none transition-all duration-200 ease-in-out shrink-0"
    :class="uiStore.isSidebarCollapsed ? 'w-16' : 'w-80'"
  >
    <!-- Top Branding Header -->
    <div
      class="p-3 border-b border-border flex items-center justify-between"
      :class="uiStore.isSidebarCollapsed ? 'flex-col gap-2 p-2' : ''"
    >
      <!-- Expanded Branding -->
      <div v-if="!uiStore.isSidebarCollapsed" class="flex items-center gap-2.5 min-w-0">
        <GuruLogo :size="32" />
        <div class="min-w-0">
          <h1 class="text-xs font-bold text-foreground truncate">
            NioGuru
          </h1>
          <p class="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
            <span>engine:</span>
            <span class="text-emerald-500 font-semibold">nio-ai</span>
          </p>
        </div>
      </div>

      <!-- Collapsed Logo -->
      <div v-else class="flex items-center justify-center py-1">
        <GuruLogo :size="32" />
      </div>

      <!-- Header Action Buttons -->
      <div class="flex items-center gap-1">
        <!-- Collapse / Expand Toggle Button -->
        <button
          type="button"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border"
          :title="uiStore.isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'"
          @click="uiStore.toggleSidebar()"
        >
          <component
            :is="uiStore.isSidebarCollapsed ? PanelLeftOpen : PanelLeftClose"
            :size="13"
          />
        </button>
      </div>
    </div>

    <!-- ================= EXPANDED VIEW ================= -->
    <template v-if="!uiStore.isSidebarCollapsed">
      <!-- Search input -->
      <div class="p-2.5 border-b border-border/60">
        <div class="relative flex items-center">
          <Search :size="14" class="absolute left-2.5 text-muted-foreground pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filter Gurus & domains..."
            class="w-full pl-9 pr-3 py-1.5 text-xs bg-muted/50 border border-border rounded-lg placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring transition-all"
          />
        </div>
        <button type="button" :disabled="chatStore.isStreaming" class="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50" @click="addGuruDialog?.open()">
          <Plus :size="16" /> Add Guru
        </button>
      </div>

      <!-- Scrollable Guru Lists -->
      <div class="flex-1 overflow-y-auto p-2 space-y-4">
        <!-- PINNED GURUS (Only rendered if user has pinned gurus!) -->
        <div v-if="filteredPinnedGurus.length > 0">
          <div class="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Pin :size="12" class="text-muted-foreground" />
            <span>Pinned Gurus</span>
            <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono font-normal">
              {{ filteredPinnedGurus.length }}
            </span>
          </div>
          <div class="space-y-1 mt-1">
            <GuruCard
              v-for="guru in filteredPinnedGurus"
              :key="guru.id"
              :guru="guru"
              :is-active="gurusStore.activeGuruId === guru.id"
              :can-delete="!chatStore.isStreaming"
              @select="handleSelectGuru"
              @toggle-pin="handleTogglePin"
              @delete="requestDeleteGuru"
            />
          </div>
        </div>

        <!-- ALL GURUS -->
        <div v-if="filteredUnpinnedGurus.length > 0">
          <div class="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Users :size="12" class="text-muted-foreground" />
            <span>All Gurus</span>
            <span class="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-muted font-mono font-normal">
              {{ filteredUnpinnedGurus.length }}
            </span>
          </div>
          <div class="space-y-1 mt-1">
            <GuruCard
              v-for="guru in filteredUnpinnedGurus"
              :key="guru.id"
              :guru="guru"
              :is-active="gurusStore.activeGuruId === guru.id"
              :can-delete="!chatStore.isStreaming"
              @select="handleSelectGuru"
              @toggle-pin="handleTogglePin"
              @delete="requestDeleteGuru"
            />
          </div>
        </div>

        <div
          v-if="filteredPinnedGurus.length === 0 && filteredUnpinnedGurus.length === 0"
          class="text-center py-8 text-xs text-muted-foreground"
        >
          No Gurus found matching "{{ searchQuery }}"
        </div>
      </div>

      <!-- Footer with Theme Toggle -->
      <div class="p-2.5 border-t border-border bg-card/30 flex items-center justify-between text-xs">
        <div class="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border">
          <button
            type="button"
            class="p-1.5 rounded-md transition-colors"
            :class="themeStore.mode === 'light' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
            title="Light Theme"
            @click="themeStore.setTheme('light')"
          >
            <Sun :size="13" />
          </button>
          <button
            type="button"
            class="p-1.5 rounded-md transition-colors"
            :class="themeStore.mode === 'dark' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
            title="Dark Theme"
            @click="themeStore.setTheme('dark')"
          >
            <Moon :size="13" />
          </button>
          <button
            type="button"
            class="p-1.5 rounded-md transition-colors"
            :class="themeStore.mode === 'auto' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'"
            title="System Theme"
            @click="themeStore.setTheme('auto')"
          >
            <Monitor :size="13" />
          </button>
        </div>

        <div class="text-[10px] text-muted-foreground font-mono">
          v0.4.0
        </div>
      </div>
    </template>

    <!-- ================= COLLAPSED RAIL VIEW ================= -->
    <template v-else>
      <div class="flex-1 overflow-y-auto py-2 px-1 flex flex-col items-center gap-1.5">
        <button type="button" :disabled="chatStore.isStreaming" class="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50" title="Add Guru" aria-label="Add Guru" @click="addGuruDialog?.open()"><Plus :size="18" /></button>
        <button
          v-for="guru in gurusStore.gurus"
          :key="guru.id"
          type="button"
          class="p-1 rounded-xl transition-all relative group"
          :title="`${guru.name} (${guru.categoryLabel})`"
          @click="handleSelectGuru(guru.id)"
        >
          <GuruAvatar
            :icon="guru.icon"
            size="md"
            :is-active="gurusStore.activeGuruId === guru.id"
            :show-status="false"
          />
        </button>
      </div>

      <!-- Collapsed Footer Theme Toggle -->
      <div class="p-2 border-t border-border flex flex-col items-center gap-2">
        <button
          type="button"
          class="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-colors"
          :title="`Toggle Theme (current: ${themeStore.mode})`"
          @click="themeStore.toggleTheme()"
        >
          <Sun v-if="themeStore.mode === 'light'" :size="14" />
          <Moon v-else-if="themeStore.mode === 'dark'" :size="14" />
          <Monitor v-else :size="14" />
        </button>
      </div>
    </template>
    <AddGuruDialog ref="addGuruDialog" />
    <Teleport to="body">
      <dialog ref="deleteDialog" class="m-auto w-[410px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50" aria-labelledby="delete-guru-title" @cancel="deleteBusy && $event.preventDefault()">
        <header class="flex items-center gap-3 border-b border-border px-5 py-4">
          <Trash2 :size="18" class="text-destructive" />
          <h2 id="delete-guru-title" class="flex-1 font-semibold">Delete {{ deleteTarget?.name }}?</h2>
          <button type="button" :disabled="deleteBusy" aria-label="Close" @click="deleteDialog?.close()"><X :size="18" /></button>
        </header>
        <div class="px-5 py-4 text-sm">This permanently deletes this custom Guru and all its conversations. This cannot be undone.</div>
        <p v-if="deleteError" role="alert" class="px-5 pb-3 text-sm text-destructive">{{ deleteError }}</p>
        <footer class="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" :disabled="deleteBusy" class="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50" @click="deleteDialog?.close()">Cancel</button>
          <button type="button" :disabled="deleteBusy || chatStore.isStreaming" class="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground disabled:opacity-50" @click="confirmDeleteGuru">{{ deleteBusy ? 'Deleting…' : 'Delete Guru' }}</button>
        </footer>
      </dialog>
    </Teleport>
  </aside>
</template>
