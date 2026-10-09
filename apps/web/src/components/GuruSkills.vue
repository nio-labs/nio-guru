<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { BookOpen, Search, X } from '../lib/icons';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';

interface Skill { name: string; description: string; enabled: boolean; source: string }
const gurus = useGurusStore();
const chat = useChatStore();
const dialog = ref<HTMLDialogElement>();
const catalog = ref<Skill[]>([]);
const selection = ref<string[]>([]);
const targetId = ref('');
const targetName = ref('');
const busy = ref(false);
const installing = ref(false);
const error = ref('');
const installError = ref('');
const installNotice = ref('');
const source = ref('');
const folder = ref('');
const search = ref('');
const sorted = computed(() => [...catalog.value].sort((a, b) =>
  Number(selection.value.includes(b.name)) - Number(selection.value.includes(a.name)) || a.name.localeCompare(b.name)));
const filteredSkills = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return query ? sorted.value.filter(skill => `${skill.name} ${skill.description}`.toLocaleLowerCase().includes(query)) : sorted.value;
});
const missing = computed(() => selection.value.filter(name => !catalog.value.some(skill => skill.name === name && skill.enabled)));

async function open() {
  if (!gurus.activeGuru || chat.isStreaming) return;
  targetId.value = gurus.activeGuru.id;
  targetName.value = gurus.activeGuru.name;
  selection.value = [...gurus.activeGuru.defaultSkills];
  catalog.value = [];
  error.value = '';
  installError.value = '';
  installNotice.value = '';
  source.value = '';
  folder.value = '';
  search.value = '';
  dialog.value?.showModal();
  busy.value = true;
  try {
    const id = targetId.value;
    const [skillsResponse, guruResponse] = await Promise.all([
      fetch('/api/skills'), fetch(`/api/gurus/${encodeURIComponent(id)}`),
    ]);
    const [skillsData, guruData] = await Promise.all([skillsResponse.json(), guruResponse.json()]);
    if (!skillsResponse.ok) throw new Error(skillsData.error || 'Could not load skills.');
    if (!guruResponse.ok) throw new Error(guruData.error || 'Could not load this guru’s selections.');
    // A backend migration or another browser may have updated the saved list.
    if (targetId.value !== id || !dialog.value?.open) return;
    catalog.value = skillsData.skills;
    selection.value = [...guruData.guru.defaultSkills];
    const guru = gurus.gurus.find(guru => guru.id === id);
    if (guru) guru.defaultSkills = [...selection.value];
  } catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; }
}
async function installSkill() {
  if (busy.value || installing.value || !source.value.trim()) return;
  installing.value = true;
  installError.value = '';
  installNotice.value = '';
  try {
    const response = await fetch('/api/skills/install', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: source.value.trim(), folder: folder.value.trim() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not install the skill.');
    catalog.value = data.skills;
    selection.value = [...new Set([...selection.value, ...(data.installedNames as string[])])];
    installNotice.value = data.installedNames.length
      ? `${data.alreadyInstalled ? 'Already installed; selected' : 'Installed and selected'}: ${data.installedNames.join(', ')}. Save to use it with this Guru.`
      : 'Skill installed. Select it above, then Save.';
    source.value = '';
    folder.value = '';
  } catch (cause) { installError.value = (cause as Error).message; }
  finally { installing.value = false; }
}
function onCancel(event: Event) {
  if (busy.value || installing.value) event.preventDefault();
}
async function save() {
  busy.value = true;
  error.value = '';
  try {
    const response = await fetch(`/api/gurus/${encodeURIComponent(targetId.value)}/skills`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skills: selection.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not save skills.');
    const guru = gurus.gurus.find(guru => guru.id === targetId.value);
    if (guru) guru.defaultSkills = data.skills;
    dialog.value?.close();
  } catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; }
}
watch(() => gurus.activeGuruId, () => dialog.value?.close());
</script>

<template>
  <button type="button" :disabled="chat.isStreaming" class="h-9 flex items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50" @click="open">
    <BookOpen :size="14" /> Skills
  </button>
  <Teleport to="body">
    <dialog ref="dialog" class="m-auto w-[390px] max-w-[calc(100vw-2rem)] max-h-[85vh] rounded-xl border border-border bg-card text-foreground p-0 shadow-xl backdrop:bg-black/50" aria-labelledby="guru-skills-title" @cancel="onCancel">
      <header class="flex items-center gap-3 border-b border-border px-5 py-4">
        <BookOpen :size="20" class="text-teal-600 dark:text-teal-400" />
        <h2 id="guru-skills-title" class="font-semibold flex-1">{{ targetName }} skills</h2>
        <button type="button" :disabled="busy || installing" aria-label="Close skills" @click="dialog?.close()"><X :size="18" /></button>
      </header>
      <div class="px-5 py-4 max-h-[55vh] overflow-y-auto space-y-3">
        <p class="text-xs text-muted-foreground">Bundled skills work offline. Choose which skills this guru can use.</p>
        <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
        <p v-if="busy" class="text-sm text-muted-foreground">Loading…</p>
        <div v-if="selection.length" class="flex flex-wrap gap-1.5">
          <button v-for="name in selection" :key="name" type="button" :disabled="busy" class="rounded-md border border-border px-2 py-1 text-xs" :aria-label="`Remove ${name}`" @click="selection = selection.filter(skill => skill !== name)">{{ name }} ×</button>
        </div>
        <p v-else class="text-sm text-muted-foreground">No skills selected.</p>
        <p v-if="missing.length" class="text-xs text-amber-600">Unavailable selections: {{ missing.join(', ') }}. Remove them or install/enable them using Nio.</p>
        <div>
          <label class="flex items-center gap-2 rounded-md border border-border bg-background px-3 focus-within:ring-1 focus-within:ring-teal-600">
            <Search :size="15" class="shrink-0 text-muted-foreground" />
            <input v-model="search" type="search" placeholder="Search skills…" aria-label="Search skills" class="w-full bg-transparent py-2 text-sm outline-none" />
          </label>
        </div>
        <div class="max-h-[28vh] overflow-y-auto rounded-md border border-border px-3" aria-label="Available skills">
          <p v-if="!busy && search.trim() && !filteredSkills.length" class="py-3 text-sm text-muted-foreground">No skills match “{{ search.trim() }}”.</p>
          <div v-for="skill in filteredSkills" :key="skill.name" class="border-b border-border py-2 last:border-b-0">
            <label class="flex items-center gap-2 text-sm">
              <input v-model="selection" type="checkbox" :value="skill.name" :disabled="busy || (!skill.enabled && !selection.includes(skill.name))" class="accent-teal-600" />
              {{ skill.name }}<span v-if="!skill.enabled" class="text-xs text-muted-foreground">Disabled in Nio</span>
            </label>
            <details class="ml-6 mt-1 text-xs text-muted-foreground">
              <summary class="cursor-pointer">Details</summary>
              <p class="mt-2">{{ skill.description }}</p>
            </details>
          </div>
        </div>
        <div class="space-y-2 border-t border-border pt-3">
          <h3 class="font-semibold text-sm">Install from GitHub</h3>
          <input v-model="source" type="url" placeholder="https://github.com/org/repo" aria-label="GitHub repository or skill URL" class="w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-teal-600" />
          <input v-model="folder" type="text" placeholder="Skill folder (optional)" aria-label="Skill folder (optional)" class="w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-teal-600" />
          <button type="button" :disabled="busy || installing || !source.trim()" class="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50" @click="installSkill">{{ installing ? 'Installing…' : 'Install skill' }}</button>
          <p v-if="installError" role="alert" class="text-xs text-destructive">{{ installError }}</p>
          <p v-if="installNotice" role="status" class="text-xs text-teal-700 dark:text-teal-400">{{ installNotice }}</p>
          <p class="text-xs text-muted-foreground">Installation adds the skill to the shared Nio library. Save to assign it to this Guru.</p>
        </div>
      </div>
      <footer class="flex items-center gap-2 border-t border-border px-5 py-3">
        <button type="button" :disabled="busy || installing" class="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50" @click="selection = []">No skills</button>
        <button type="button" :disabled="busy || installing" class="ml-auto rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50" @click="dialog?.close()">Cancel</button>
        <button type="button" :disabled="busy || installing" class="rounded-md bg-teal-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" @click="save">Save</button>
      </footer>
    </dialog>
  </Teleport>
</template>
