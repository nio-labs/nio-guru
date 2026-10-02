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

  return {
    isSidebarCollapsed,
    toggleSidebar,
    setSidebarCollapsed,
  };
});
