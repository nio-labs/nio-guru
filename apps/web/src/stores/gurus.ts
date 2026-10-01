import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface Guru {
  id: string;
  name: string;
  tagline: string;
  category: 'standard' | 'engineering' | 'markets' | 'product' | 'custom';
  categoryLabel: string;
  icon: string;
  color: string;
  isPinned: boolean;
  isCustom: boolean;
  systemPrompt: string;
  defaultSkills: string[];
  widgetType: string;
  samplePrompts: string[];
}

export const useGurusStore = defineStore('gurus', () => {
  const gurus = ref<Guru[]>([]);
  const activeGuruId = ref<string>('direct-chat');
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  const activeGuru = computed(() => {
    return gurus.value.find((g) => g.id === activeGuruId.value) || gurus.value[0] || null;
  });

  const pinnedGurus = computed(() => {
    return gurus.value.filter((g) => g.isPinned);
  });

  const unpinnedGurus = computed(() => {
    return gurus.value.filter((g) => !g.isPinned);
  });

  async function fetchGurus() {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await fetch('/api/gurus');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      gurus.value = data.gurus || [];
      // If activeGuruId not valid, set to first
      if (!gurus.value.some((g) => g.id === activeGuruId.value) && gurus.value.length > 0) {
        activeGuruId.value = gurus.value[0].id;
      }
    } catch (err: any) {
      error.value = err.message;
    } finally {
      isLoading.value = false;
    }
  }

  async function togglePin(guruId: string) {
    const guru = gurus.value.find((g) => g.id === guruId);
    if (!guru) return;
    const targetState = !guru.isPinned;
    guru.isPinned = targetState; // Optimistic update

    try {
      const res = await fetch(`/api/gurus/${guruId}/pin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: targetState }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      // Revert if failed
      guru.isPinned = !targetState;
      console.error(`Failed to toggle pin for ${guruId}:`, err);
    }
  }

  function setActiveGuru(id: string) {
    activeGuruId.value = id;
  }

  return {
    gurus,
    activeGuruId,
    activeGuru,
    pinnedGurus,
    unpinnedGurus,
    isLoading,
    error,
    fetchGurus,
    togglePin,
    setActiveGuru,
  };
});
