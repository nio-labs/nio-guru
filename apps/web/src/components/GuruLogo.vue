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
    viewBox="0 0 2042 2042"
    fill="none"
    role="img"
    aria-label="NioGuru logo"
    xmlns="http://www.w3.org/2000/svg"
    class="shrink-0"
  >
    <rect width="2042" height="2042" rx="383" fill="#008080" />
    <rect x="1139" y="637" width="300" height="300" rx="150" fill="white" />
    <rect x="464.5" y="507.5" width="1113" height="1027" rx="87.5" stroke="white" stroke-width="125" />
  </svg>
</template>
