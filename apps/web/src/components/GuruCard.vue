<script setup lang="ts">
import { computed } from 'vue';
import { Pin, Trash2 } from '../lib/icons';
import GuruAvatar from './GuruAvatar.vue';
import type { Guru } from '../stores/gurus';

const props = defineProps<{
  guru: Guru;
  isActive: boolean;
  canDelete?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'togglePin', id: string): void;
  (e: 'delete', id: string): void;
}>();

const lastMessagePreview = computed(() => {
  if (!props.guru.lastMessage?.content) return null;
  return props.guru.lastMessage.content
    .replace(/[\r\n]+/g, ' ')
    .replace(/^#+\s*/, '')
    .trim();
});
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
    <div class="flex-1 min-w-0" :class="guru.isCustom ? 'pr-14' : 'pr-5'">
      <div class="flex items-center gap-2" :class="lastMessagePreview ? 'mb-0.5' : ''">
        <span class="font-medium text-sm truncate" :class="isActive ? 'text-foreground font-semibold' : 'text-foreground/90'">
          {{ guru.name }}
        </span>
      </div>
      <p v-if="lastMessagePreview" class="text-xs text-muted-foreground truncate leading-relaxed">
        <span v-if="guru.lastMessage?.role === 'user'" class="font-medium text-foreground/75">You: </span>
        {{ lastMessagePreview }}
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
    <button
      v-if="guru.isCustom"
      type="button"
      :disabled="!canDelete"
      class="absolute right-8 top-2 rounded-md p-1 text-muted-foreground opacity-60 transition-opacity hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
      :title="`Delete ${guru.name}`"
      :aria-label="`Delete ${guru.name}`"
      @click.stop="emit('delete', guru.id)"
    ><Trash2 :size="12" /></button>
  </div>
</template>
