import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface MemoryItem {
  id: string;
  content: string;
  category: string;
  createdAt: number;
  updatedAt: number;
}

export const useMemoriesStore = defineStore('memories', () => {
  const memories = ref<MemoryItem[]>([]);
  const loading = ref(false);
  const error = ref('');

  async function fetchMemories() {
    loading.value = true;
    error.value = '';
    try {
      const res = await fetch('/api/memories');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      memories.value = data.memories || [];
    } catch (err: any) {
      error.value = err.message || 'Failed to load memories';
    } finally {
      loading.value = false;
    }
  }

  async function addMemory(content: string, category = 'general') {
    const trimmed = content.trim();
    if (!trimmed) return null;
    try {
      const res = await fetch('/api/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed, category }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      memories.value.unshift(data.memory);
      return data.memory;
    } catch (err: any) {
      error.value = err.message || 'Failed to save memory';
      throw err;
    }
  }

  async function deleteMemory(id: string) {
    try {
      const res = await fetch(`/api/memories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      memories.value = memories.value.filter(m => m.id !== id);
    } catch (err: any) {
      error.value = err.message || 'Failed to delete memory';
      throw err;
    }
  }

  return {
    memories,
    loading,
    error,
    fetchMemories,
    addMemory,
    deleteMemory,
  };
});
