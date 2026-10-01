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
    color?: string;
    size?: 'sm' | 'md' | 'lg';
    showStatus?: boolean;
  }>(),
  {
    color: 'slate',
    size: 'md',
    showStatus: true,
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
    case 'sm': return 'w-8 h-8';
    case 'lg': return 'w-12 h-12';
    default: return 'w-10 h-10';
  }
});

const iconSize = computed(() => {
  switch (props.size) {
    case 'sm': return 14;
    case 'lg': return 22;
    default: return 18;
  }
});

const colorClasses = computed(() => {
  switch (props.color) {
    case 'sky': return 'bg-sky-500/10 text-sky-500 dark:text-sky-400 border-sky-500/30';
    case 'emerald': return 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 border-emerald-500/30';
    case 'indigo': return 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border-indigo-500/30';
    case 'amber': return 'bg-amber-500/10 text-amber-500 dark:text-amber-400 border-amber-500/30';
    case 'rose': return 'bg-rose-500/10 text-rose-500 dark:text-rose-400 border-rose-500/30';
    case 'orange': return 'bg-orange-500/10 text-orange-500 dark:text-orange-400 border-orange-500/30';
    case 'teal': return 'bg-teal-500/10 text-teal-500 dark:text-teal-400 border-teal-500/30';
    case 'purple': return 'bg-purple-500/10 text-purple-500 dark:text-purple-400 border-purple-500/30';
    case 'violet': return 'bg-violet-500/10 text-violet-500 dark:text-violet-400 border-violet-500/30';
    default: return 'bg-muted text-foreground border-border';
  }
});
</script>

<template>
  <div class="relative flex-shrink-0">
    <div
      class="flex items-center justify-center rounded-xl border transition-colors shadow-sm"
      :class="[sizeClasses, colorClasses]"
    >
      <component :is="iconComponent" :size="iconSize" :stroke-width="2" />
    </div>
    <!-- Online status badge dot -->
    <span
      v-if="showStatus"
      class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-background"
      title="Engine Ready"
    />
  </div>
</template>
