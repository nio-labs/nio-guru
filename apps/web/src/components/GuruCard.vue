<script setup lang="ts">
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
    class="group relative flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all border text-left"
    :class="[
      isActive
        ? 'bg-accent/80 border-border text-foreground shadow-xs'
        : 'hover:bg-muted/50 border-transparent text-muted-foreground hover:text-foreground'
    ]"
    @click="emit('select', guru.id)"
  >
    <!-- Guru Avatar -->
    <GuruAvatar :icon="guru.icon" size="md" :is-active="isActive" :show-status="false" />

    <!-- Content -->
    <div class="flex-1 min-w-0 pr-5">
      <div class="flex items-center gap-2 mb-1">
        <span class="font-medium text-sm truncate" :class="isActive ? 'text-foreground font-semibold' : 'text-foreground/90'">
          {{ guru.name }}
        </span>
        <span
          class="text-[10px] uppercase px-1.5 py-0.5 rounded font-mono font-medium tracking-wider border shrink-0 bg-muted/60 text-muted-foreground border-border/80"
        >
          {{ guru.categoryLabel }}
        </span>
      </div>
      <p class="text-xs text-muted-foreground truncate leading-relaxed">
        {{ guru.tagline }}
      </p>
    </div>

    <!-- Pin to top toggle button -->
    <button
      type="button"
      class="absolute right-1.5 top-2 p-1 rounded-md transition-opacity"
      :class="[
        guru.isPinned
          ? 'text-foreground opacity-90 hover:opacity-100'
          : 'text-muted-foreground opacity-0 group-hover:opacity-50 hover:!opacity-100 hover:bg-muted'
      ]"
      :title="guru.isPinned ? 'Unpin Guru' : 'Pin Guru to top'"
      @click.stop="emit('togglePin', guru.id)"
    >
      <Pin
        :size="12"
        :class="{ 'fill-current': guru.isPinned }"
      />
    </button>
  </div>
</template>
