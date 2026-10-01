<script setup lang="ts">
import { computed } from 'vue';
import { Pin } from 'lucide-vue-next';
import GuruAvatar from './GuruAvatar.vue';
import type { Guru } from '../stores/gurus';

const props = defineProps<{
  guru: Guru;
  isActive: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'togglePin', id: string): void;
}>();
</script>

<template>
  <div
    class="group relative flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border text-left"
    :class="[
      isActive
        ? 'bg-accent/80 border-border shadow-sm'
        : 'hover:bg-muted/50 border-transparent text-muted-foreground hover:text-foreground'
    ]"
    @click="emit('select', guru.id)"
  >
    <!-- Guru Avatar -->
    <GuruAvatar :icon="guru.icon" :color="guru.color" size="md" />

    <!-- Content -->
    <div class="flex-1 min-w-0 pr-6">
      <div class="flex items-center gap-1.5 mb-0.5">
        <span class="font-medium text-xs truncate" :class="isActive ? 'text-foreground font-semibold' : 'text-foreground/90'">
          {{ guru.name }}
        </span>
        <span
          class="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-medium tracking-wider border shrink-0"
          :class="[
            guru.category === 'standard' ? 'bg-muted text-muted-foreground border-border' :
            guru.category === 'engineering' ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20' :
            guru.category === 'markets' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
            'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
          ]"
        >
          {{ guru.categoryLabel }}
        </span>
      </div>
      <p class="text-[11px] text-muted-foreground truncate leading-tight">
        {{ guru.tagline }}
      </p>
    </div>

    <!-- Pin to top toggle button -->
    <button
      type="button"
      class="absolute right-2 top-2.5 p-1 rounded-md transition-opacity"
      :class="[
        guru.isPinned
          ? 'text-foreground opacity-90 hover:opacity-100'
          : 'text-muted-foreground opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-muted'
      ]"
      :title="guru.isPinned ? 'Unpin Guru' : 'Pin Guru to top'"
      @click.stop="emit('togglePin', guru.id)"
    >
      <Pin
        :size="13"
        :class="{ 'fill-current': guru.isPinned }"
      />
    </button>
  </div>
</template>
