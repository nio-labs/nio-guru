<script setup lang="ts">
import { onMounted } from 'vue';
import Sidebar from './components/Sidebar.vue';
import ChatHeader from './components/ChatHeader.vue';
import ChatFeed from './components/ChatFeed.vue';
import Composer from './components/Composer.vue';
import { useGurusStore } from './stores/gurus';
import { useChatStore } from './stores/chat';
import { useThemeStore } from './stores/theme';

const gurusStore = useGurusStore();
const chatStore = useChatStore();
const themeStore = useThemeStore();

onMounted(async () => {
  await gurusStore.fetchGurus();
  await chatStore.fetchModels();
  if (gurusStore.activeGuruId) {
    await chatStore.fetchConversations(gurusStore.activeGuruId);
  }
});
</script>

<template>
  <div class="flex h-screen w-screen bg-background text-foreground overflow-hidden font-sans select-none antialiased">
    <!-- Chat-Style Avatar Sidebar -->
    <Sidebar />

    <!-- Main Workspace Area -->
    <main class="flex-1 flex flex-col h-full bg-background min-w-0 select-text">
      <!-- Active Guru Header -->
      <ChatHeader />

      <!-- Scrollable Message Stream -->
      <ChatFeed />

      <!-- Input Composer -->
      <Composer />
    </main>
  </div>
</template>
