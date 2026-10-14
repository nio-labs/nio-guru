import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const isSidebarCollapsed = ref<boolean>(
    (localStorage.getItem('nioguru-sidebar-collapsed') ?? localStorage.getItem('openguru-sidebar-collapsed')) === 'true'
  );

  function toggleSidebar() {
    isSidebarCollapsed.value = !isSidebarCollapsed.value;
    localStorage.setItem('nioguru-sidebar-collapsed', String(isSidebarCollapsed.value));
  }

  function setSidebarCollapsed(collapsed: boolean) {
    isSidebarCollapsed.value = collapsed;
    localStorage.setItem('nioguru-sidebar-collapsed', String(collapsed));
  }

  const isSearchModalOpen = ref<boolean>(false);

  function openSearchModal() {
    isSearchModalOpen.value = true;
  }

  function closeSearchModal() {
    isSearchModalOpen.value = false;
  }

  const isMemoryModalOpen = ref<boolean>(false);

  function openMemoryModal() {
    isMemoryModalOpen.value = true;
  }

  function closeMemoryModal() {
    isMemoryModalOpen.value = false;
  }

  const enableLongTermMemory = ref<boolean>(
    localStorage.getItem('nioguru-enable-long-term-memory') !== 'false'
  );

  function toggleLongTermMemory() {
    enableLongTermMemory.value = !enableLongTermMemory.value;
    localStorage.setItem('nioguru-enable-long-term-memory', String(enableLongTermMemory.value));
  }

  return {
    isSidebarCollapsed,
    toggleSidebar,
    setSidebarCollapsed,
    isSearchModalOpen,
    openSearchModal,
    closeSearchModal,
    isMemoryModalOpen,
    openMemoryModal,
    closeMemoryModal,
    enableLongTermMemory,
    toggleLongTermMemory,
  };
});
