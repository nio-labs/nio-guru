<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number;
  }>(),
  {
    size: 16,
  }
);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="shrink-0"
  >
    <!-- Square Container -->
    <rect
      x="3"
      y="3"
      width="18"
      height="18"
      rx="4.5"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <!-- Center Sparkle Star -->
    <path
      d="M12 6.5C12 9.5 9.5 12 6.5 12C9.5 12 12 14.5 12 17.5C12 14.5 14.5 12 17.5 12C14.5 12 12 9.5 12 6.5Z"
      fill="currentColor"
    />
  </svg>
</template>
