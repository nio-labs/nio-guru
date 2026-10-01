<script setup lang="ts">
import { computed } from 'vue';
import {
  MessageSquare,
  Layout,
  Server,
  Network,
  Container,
  ShieldCheck,
  Bug,
  CandlestickChart,
  Scale,
  FileText,
  BookOpen,
  Sparkles,
  Bot,
} from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    icon: string;
    size?: 'sm' | 'md' | 'lg';
    isActive?: boolean;
    showStatus?: boolean;
  }>(),
  {
    size: 'md',
    isActive: false,
    showStatus: false,
  }
);

const iconComponent = computed(() => {
  switch (props.icon) {
    case 'MessageSquare': return MessageSquare;
    case 'Layout': return Layout;
    case 'Server': return Server;
    case 'Network': return Network;
    case 'Container': return Container;
    case 'ShieldCheck': return ShieldCheck;
    case 'Bug': return Bug;
    case 'CandlestickChart': return CandlestickChart;
    case 'Scale': return Scale;
    case 'FileText': return FileText;
    case 'BookOpen': return BookOpen;
    case 'Sparkles': return Sparkles;
    default: return Bot;
  }
});

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return 'w-7 h-7 rounded-lg';
    case 'lg': return 'w-12 h-12 rounded-xl';
    default: return 'w-9 h-9 rounded-lg';
  }
});

const iconSize = computed(() => {
  switch (props.size) {
    case 'sm': return 13;
    case 'lg': return 22;
    default: return 16;
  }
});

const styleClasses = computed(() => {
  if (props.isActive) {
    return 'bg-foreground text-background border-foreground shadow-xs';
  }
  return 'bg-muted/60 text-muted-foreground border-border/80 group-hover:text-foreground group-hover:bg-muted/90 group-hover:border-border';
});
</script>

<template>
  <div class="relative flex-shrink-0">
    <div
      class="flex items-center justify-center border transition-all duration-150"
      :class="[sizeClasses, styleClasses]"
    >
      <component :is="iconComponent" :size="iconSize" :stroke-width="1.8" />
    </div>
    <!-- Online status dot (only shown when explicitly enabled, e.g. in ChatHeader) -->
    <span
      v-if="showStatus"
      class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-background"
      title="Engine Ready"
    />
  </div>
</template>
