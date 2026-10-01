import { defineStore } from 'pinia';
import { useColorMode } from '@vueuse/core';

export const useThemeStore = defineStore('theme', () => {
  const mode = useColorMode({
    attribute: 'class',
    modes: {
      light: '',
      dark: 'dark',
    },
    storageKey: 'openguru-theme',
  });

  function setTheme(newMode: 'light' | 'dark' | 'auto') {
    mode.value = newMode;
  }

  function toggleTheme() {
    if (mode.value === 'dark') {
      mode.value = 'light';
    } else if (mode.value === 'light') {
      mode.value = 'auto';
    } else {
      mode.value = 'dark';
    }
  }

  return {
    mode,
    setTheme,
    toggleTheme,
  };
});
