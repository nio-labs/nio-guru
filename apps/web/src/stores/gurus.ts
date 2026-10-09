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
  lastMessage?: {
    role: string;
    content: string;
    createdAt: number;
  } | null;
}

export interface GuruDocument {
  id: string;
  guruId: string;
  filename: string;
  fileType: string;
  fileSize: number;
  content: string;
  createdAt: number;
}

export const useGurusStore = defineStore('gurus', () => {
  const gurus = ref<Guru[]>([]);
  const documents = ref<GuruDocument[]>([]);
  const isLoadingDocuments = ref(false);
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

  async function createGuru(input: { name: string; tagline: string; icon: string; systemPrompt: string; defaultSkills: string[] }): Promise<Guru> {
    const response = await fetch('/api/gurus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not create the Guru.');
    const guru = data.guru as Guru;
    gurus.value.push(guru);
    gurus.value.sort((a, b) => Number(b.isPinned) - Number(a.isPinned)
      || (a.id === 'direct-chat' ? -1 : b.id === 'direct-chat' ? 1 : a.name.localeCompare(b.name)));
    return guru;
  }

  async function deleteGuru(id: string): Promise<void> {
    const guru = gurus.value.find(item => item.id === id);
    if (!guru?.isCustom) throw new Error('Only custom Gurus can be deleted.');
    const response = await fetch(`/api/gurus/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not delete this Guru.');
    gurus.value = gurus.value.filter(item => item.id !== id);
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

  function updateLastMessage(guruId: string, lastMsg: { role: string; content: string; createdAt: number }) {
    const guru = gurus.value.find((g) => g.id === guruId);
    if (guru) {
      if (!guru.lastMessage || lastMsg.createdAt >= (guru.lastMessage.createdAt || 0)) {
        guru.lastMessage = lastMsg;
      }
    }
  }

  async function fetchDocuments(guruId: string) {
    isLoadingDocuments.value = true;
    try {
      const res = await fetch(`/api/gurus/${encodeURIComponent(guruId)}/documents`);
      if (res.ok) {
        const data = await res.json();
        documents.value = data.documents || [];
      }
    } catch (err) {
      console.warn(`Failed to fetch documents for ${guruId}:`, err);
    } finally {
      isLoadingDocuments.value = false;
    }
  }

  async function uploadDocument(guruId: string, file: File): Promise<GuruDocument> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/gurus/${encodeURIComponent(guruId)}/documents`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to upload document.');
    const doc = data.document as GuruDocument;
    documents.value.unshift(doc);
    return doc;
  }

  async function deleteDocument(guruId: string, docId: string): Promise<void> {
    const res = await fetch(`/api/gurus/${encodeURIComponent(guruId)}/documents/${encodeURIComponent(docId)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete document.');
    documents.value = documents.value.filter(d => d.id !== docId);
  }

  return {
    gurus,
    documents,
    isLoadingDocuments,
    activeGuruId,
    activeGuru,
    pinnedGurus,
    unpinnedGurus,
    isLoading,
    error,
    fetchGurus,
    createGuru,
    deleteGuru,
    togglePin,
    setActiveGuru,
    updateLastMessage,
    fetchDocuments,
    uploadDocument,
    deleteDocument,
  };
});
