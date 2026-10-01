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
    <!-- Geometric Open Guru Hexagonal Arc / Ring -->
    <path
      d="M12 2L19.5 6.33V15L12 19.33L4.5 15V6.33L12 2Z"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-dasharray="40 10"
    />
    <!-- Inset Wisdom Diamond / Spark Core -->
    <path
      d="M12 8L15 12L12 16L9 12L12 8Z"
      fill="currentColor"
    />
  </svg>
</template>
