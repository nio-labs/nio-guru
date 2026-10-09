<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Wrench,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileCode,
  Terminal,
} from '../lib/icons';
import type { ToolCall } from '../stores/chat';
import { useChatStore } from '../stores/chat';
import { useGurusStore } from '../stores/gurus';

const props = defineProps<{
  toolCall: ToolCall;
}>();

const isOpen = ref(false);
const chat = useChatStore();
const gurus = useGurusStore();
const installDialog = ref<HTMLDialogElement>();
const source = ref('');
const folder = ref('');
const busy = ref(false);
const error = ref('');
const notice = ref('');
const targetGuruId = ref('');
const existingSkill = ref('');
const missingSkill = computed(() => {
  if (props.toolCall.tool !== 'read_skill_file' || props.toolCall.status !== 'error') return '';
  const output = typeof props.toolCall.output === 'string' ? props.toolCall.output : JSON.stringify(props.toolCall.output || '');
  if (!/skill.*not installed|skill.*not enabled/i.test(output)) return '';
  let input = props.toolCall.input;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { return ''; } }
  return typeof input?.name === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(input.name) ? input.name : '';
});

async function openInstall() {
  if (chat.isStreaming || !gurus.activeGuru || !missingSkill.value) return;
  targetGuruId.value = gurus.activeGuru.id;
  source.value = ''; folder.value = ''; existingSkill.value = '';
  error.value = ''; notice.value = '';
  installDialog.value?.showModal();
  busy.value = true;
  try {
    const response = await fetch('/api/skills');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load skills.');
    const known = data.skills.find((skill: { name: string }) => skill.name === missingSkill.value);
    if (known?.enabled) existingSkill.value = known.name;
    else if (known?.source) source.value = known.source;
  } catch (cause) { error.value = (cause as Error).message; }
  finally { busy.value = false; }
}

async function installAndAssign() {
  if (busy.value || chat.isStreaming || (!existingSkill.value && !source.value.trim())) return;
  busy.value = true; error.value = ''; notice.value = '';
  let names = existingSkill.value ? [existingSkill.value] : [];
  let installed = false;
  try {
    if (!names.length) {
      const response = await fetch('/api/skills/install', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source.value.trim(), folder: folder.value.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not install this skill.');
      names = data.installedNames || [];
      installed = true;
      if (!names.length) throw new Error('The package was installed, but no enabled skills were found. Check it in the Skills dialog.');
    }
    const guruResponse = await fetch(`/api/gurus/${encodeURIComponent(targetGuruId.value)}`);
    const guruData = await guruResponse.json();
    if (!guruResponse.ok) throw new Error('Could not load this Guru.');
    const skills = [...new Set([...guruData.guru.defaultSkills, ...names])];
    const response = await fetch(`/api/gurus/${encodeURIComponent(targetGuruId.value)}/skills`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skills }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not assign the skill to this Guru.');
    const guru = gurus.gurus.find(guru => guru.id === targetGuruId.value);
    if (guru) guru.defaultSkills = data.skills;
    notice.value = `Added ${names.join(', ')} to this Guru. Send your request again to use it.`;
  } catch (cause) {
    error.value = `${installed ? 'The skill was installed. ' : ''}${(cause as Error).message}`;
  } finally { busy.value = false; }
}
</script>

<template>
  <div class="my-2 border border-border/80 rounded-lg bg-card overflow-hidden text-xs font-mono shadow-xs">
    <button
      type="button"
      class="w-full px-3 py-2 flex items-center justify-between text-foreground hover:bg-muted/40 transition-colors bg-muted/20"
      @click="isOpen = !isOpen"
    >
      <div class="flex items-center gap-2 min-w-0">
        <!-- Tool Status Icon -->
        <Loader2 v-if="toolCall.status === 'running'" :size="13" class="text-sky-500 animate-spin shrink-0" />
        <CheckCircle2 v-else-if="toolCall.status === 'completed'" :size="13" class="text-emerald-500 shrink-0" />
        <AlertCircle v-else :size="13" class="text-destructive shrink-0" />

        <!-- Tool Name -->
        <span class="font-semibold text-[11px] truncate">
          {{ toolCall.title || toolCall.tool }}
        </span>

        <span
          class="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono border inline-flex items-center gap-1"
          :class="[
            toolCall.status === 'running' ? 'bg-sky-500/10 text-sky-500 border-sky-500/30' :
            toolCall.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
            'bg-destructive/10 text-destructive border-destructive/20'
          ]"
        >
          <span v-if="toolCall.status === 'running'" class="inline-flex items-center gap-1">
            Running
            <span class="inline-flex gap-0.5">
              <span class="w-1 h-1 rounded-full bg-sky-500 animate-bounce" style="animation-delay: 0ms" />
              <span class="w-1 h-1 rounded-full bg-sky-500 animate-bounce" style="animation-delay: 150ms" />
              <span class="w-1 h-1 rounded-full bg-sky-500 animate-bounce" style="animation-delay: 300ms" />
            </span>
          </span>
          <span v-else>{{ toolCall.status }}</span>
        </span>
      </div>

      <component :is="isOpen ? ChevronUp : ChevronDown" :size="12" class="text-muted-foreground ml-2 shrink-0" />
    </button>

    <div v-if="missingSkill" class="flex flex-wrap items-center gap-2 border-t border-border/60 px-3 py-2">
      <span class="flex-1 text-muted-foreground">{{ missingSkill }} is unavailable for this Guru.</span>
      <button type="button" :disabled="chat.isStreaming" class="rounded-md border border-teal-600/40 px-2 py-1 text-teal-700 hover:bg-teal-600/10 disabled:opacity-50 dark:text-teal-400" :title="chat.isStreaming ? 'Available after the response finishes' : 'Install or select this skill'" @click="openInstall">Install skill</button>
    </div>

    <!-- Drawer Content -->
    <div v-show="isOpen" class="p-3 border-t border-border/60 bg-muted/10 space-y-2 text-[11px]">
      <!-- Tool Input -->
      <div v-if="toolCall.input">
        <div class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
          Input Parameters
        </div>
        <pre class="p-2 rounded bg-muted/50 border border-border overflow-x-auto text-[10px] text-foreground font-mono leading-tight">{{ JSON.stringify(toolCall.input, null, 2) }}</pre>
      </div>

      <!-- Tool Output -->
      <div v-if="toolCall.output">
        <div class="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">
          Output Result
        </div>
        <pre class="p-2 rounded bg-muted/50 border border-border overflow-x-auto text-[10px] text-foreground font-mono leading-tight max-h-48 overflow-y-auto">{{ typeof toolCall.output === 'string' ? toolCall.output : JSON.stringify(toolCall.output, null, 2) }}</pre>
      </div>
    </div>
  </div>
  <Teleport to="body">
    <dialog ref="installDialog" class="m-auto w-[430px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50" aria-labelledby="missing-skill-title" @cancel="busy && $event.preventDefault()">
      <header class="border-b border-border px-5 py-4"><h2 id="missing-skill-title" class="font-semibold">Install {{ missingSkill }}</h2></header>
      <div class="space-y-3 px-5 py-4 text-sm">
        <p v-if="existingSkill" class="text-muted-foreground">This skill is already installed. Add it to this Guru to use it in your next request.</p>
        <template v-else>
          <p class="text-muted-foreground">Enter the GitHub source for this skill. A skill name alone does not identify its repository.</p>
          <label class="block space-y-1"><span>GitHub repository or skill URL</span><input v-model="source" :disabled="busy" type="url" placeholder="https://github.com/org/repo" class="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-teal-600" /></label>
          <label class="block space-y-1"><span>Skill folder (optional)</span><input v-model="folder" :disabled="busy" type="text" placeholder="skills/my-skill" class="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-teal-600" /></label>
        </template>
        <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
        <p v-if="notice" role="status" class="text-teal-700 dark:text-teal-400">{{ notice }}</p>
      </div>
      <footer class="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" :disabled="busy" class="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50" @click="installDialog?.close()">{{ notice ? 'Done' : 'Cancel' }}</button>
        <button v-if="!notice" type="button" :disabled="busy || chat.isStreaming || (!existingSkill && !source.trim())" class="rounded-md bg-teal-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" @click="installAndAssign">{{ busy ? 'Working…' : existingSkill ? 'Add to Guru' : 'Install and add' }}</button>
      </footer>
    </dialog>
  </Teleport>
</template>
