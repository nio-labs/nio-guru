import { defineStore } from 'pinia';
import { useColorMode } from '@vueuse/core';

export const useThemeStore = defineStore('theme', () => {
  // Carry forward existing preferences under the current product name.
  try {
    if (localStorage.getItem('nioguru-theme') === null) {
      const legacy = localStorage.getItem('openguru-theme');
      if (legacy !== null) localStorage.setItem('nioguru-theme', legacy);
    }
  } catch { /* Browser storage may be unavailable. */ }
  const mode = useColorMode({
    attribute: 'class',
    modes: {
      light: '',
      dark: 'dark',
    },
    storageKey: 'nioguru-theme',
    initialValue: 'light',
    emitAuto: false,
    onChanged(value, defaultHandler) {
      defaultHandler(value);
      const background = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', `hsl(${background})`);
    },
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
