<script setup lang="ts">
import { computed, ref } from 'vue';
import { BookOpen, Plus, Sparkles, X } from 'lucide-vue-next';
import { GURU_ICONS } from '../lib/guruIcons';
import { GURU_ICON_NAMES } from '../../../../packages/shared/src/guru-icons';
import { useGurusStore } from '../stores/gurus';
import { useChatStore } from '../stores/chat';

interface Skill { name: string; description: string; enabled: boolean; source: string }
const gurus = useGurusStore();
const chat = useChatStore();
const dialog = ref<HTMLDialogElement>();
const name = ref('');
const tagline = ref('');
const instructions = ref('');
const icon = ref<string>('Sparkles');
const iconSearch = ref('');
const showIconPicker = ref(false);
const generating = ref(false);
const aiNotice = ref('');
let generationController: AbortController | null = null;
const selection = ref<string[]>([]);
const catalog = ref<Skill[]>([]);
const search = ref('');
const source = ref('');
const folder = ref('');
const busy = ref(false);
const loadingSkills = ref(false);
const error = ref('');
const skillError = ref('');
const skillNotice = ref('');
const sortedSkills = computed(() => catalog.value
  .filter(skill => skill.name.toLowerCase().includes(search.value.trim().toLowerCase()))
  .sort((a, b) => Number(selection.value.includes(b.name)) - Number(selection.value.includes(a.name))
    || a.name.localeCompare(b.name)));
const filteredIcons = computed(() => GURU_ICON_NAMES.filter(value =>
  value.toLowerCase().includes(iconSearch.value.trim().toLowerCase())));

function stopGeneration() {
  generationController?.abort();
  generationController = null;
  generating.value = false;
}

async function fillWithAi() {
  const requestedName = name.value.trim();
  if (!requestedName || generating.value || busy.value) return;
  generating.value = true;
  aiNotice.value = '';
  error.value = '';
  const controller = new AbortController();
  generationController = controller;
  try {
    const response = await fetch('/api/gurus/suggest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: requestedName }), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not generate a Guru draft.');
    if (!dialog.value?.open || name.value.trim() !== requestedName) return;
    tagline.value = data.tagline;
    instructions.value = data.instructions;
    icon.value = data.icon in GURU_ICONS ? data.icon : 'Sparkles';
    const suggestedSkills = Array.isArray(data.skills) ? data.skills as string[] : [];
    selection.value = [...new Set([...selection.value, ...suggestedSkills])];
    aiNotice.value = suggestedSkills.length
      ? `Draft filled. Skills selected: ${suggestedSkills.join(', ')}.`
      : 'Draft filled. No available skills match this Guru; you can install one below.';
  } catch (cause) {
    if (!controller.signal.aborted) error.value = (cause as Error).message;
  } finally {
    if (generationController === controller) {
      generationController = null;
      generating.value = false;
    }
  }
}

async function loadSkills() {
  loadingSkills.value = true;
  skillError.value = '';
  try {
    const response = await fetch('/api/skills');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load skills.');
    catalog.value = data.skills;
  } catch (cause) { skillError.value = (cause as Error).message; }
  finally { loadingSkills.value = false; }
}

function open() {
  if (chat.isStreaming || dialog.value?.open) return;
  name.value = '';
  tagline.value = '';
  instructions.value = '';
  icon.value = 'Sparkles';
  iconSearch.value = '';
  showIconPicker.value = false;
  aiNotice.value = '';
  selection.value = [];
  search.value = '';
  source.value = '';
  folder.value = '';
  error.value = '';
  skillError.value = '';
  skillNotice.value = '';
  dialog.value?.showModal();
  void loadSkills();
}
defineExpose({ open });

async function installSkill() {
  if (busy.value || generating.value || !source.value.trim()) return;
  busy.value = true;
  skillError.value = '';
  skillNotice.value = '';
  try {
    const response = await fetch('/api/skills/install', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: source.value.trim(), folder: folder.value.trim() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not install the skill.');
    catalog.value = data.skills;
    selection.value = [...new Set([...selection.value, ...(data.installedNames as string[])])];
    skillNotice.value = data.installedNames.length
      ? `${data.alreadyInstalled ? 'Already installed; selected' : 'Installed and selected'}: ${data.installedNames.join(', ')}`
      : 'Skill installed. Select it from the list below.';
    source.value = '';
    folder.value = '';
  } catch (cause) { skillError.value = (cause as Error).message; }
  finally { busy.value = false; }
}

async function create() {
  if (busy.value || generating.value || chat.isStreaming) return;
  if (!name.value.trim() || !instructions.value.trim()) {
    error.value = 'Enter a name and instructions for this Guru.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const guru = await gurus.createGuru({
      name: name.value.trim(), tagline: tagline.value.trim(), icon: icon.value,
      systemPrompt: instructions.value.trim(), defaultSkills: selection.value,
    });
    dialog.value?.close();
    await chat.switchGuru(guru.id);
  } catch (cause) { error.value = (cause as Error).message; }
  finally { busy.value = false; }
}

function onCancel(event: Event) { if (busy.value) event.preventDefault(); }
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="m-auto w-[540px] max-w-[calc(100vw-2rem)] max-h-[90vh] rounded-xl border border-border bg-card text-foreground p-0 shadow-xl backdrop:bg-black/50" aria-labelledby="add-guru-title" @cancel="onCancel" @close="stopGeneration">
      <header class="flex items-center gap-3 border-b border-border px-5 py-4">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted"><component :is="GURU_ICONS[icon as keyof typeof GURU_ICONS]" :size="18" class="text-teal-600 dark:text-teal-400" /></div>
        <div class="flex-1 min-w-0">
          <h2 id="add-guru-title" class="font-semibold">Add Guru</h2>
          <p class="text-xs text-muted-foreground">Create a chat specialist with optional skills</p>
        </div>
        <button type="button" :disabled="busy" aria-label="Close" class="rounded-md p-1 hover:bg-muted disabled:opacity-50" @click="dialog?.close()"><X :size="18" /></button>
      </header>

      <form class="max-h-[calc(90vh-132px)] overflow-y-auto px-5 py-4 space-y-4 text-sm" @submit.prevent="create">
        <p v-if="error" role="alert" class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">{{ error }}</p>
        <label class="block space-y-1.5">
          <span class="font-medium">Name <span class="text-destructive">*</span></span>
          <input v-model="name" required maxlength="80" placeholder="e.g. Data Architect" class="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-teal-600" />
        </label>
        <button type="button" :disabled="busy || generating || !name.trim()" class="inline-flex items-center gap-2 rounded-md border border-teal-600/40 bg-teal-600/10 px-3 py-2 text-xs font-medium text-teal-700 hover:bg-teal-600/15 disabled:opacity-50 dark:text-teal-300" @click="fillWithAi">
          <Sparkles :size="15" /> {{ generating ? 'Generating Guru draft…' : 'Fill with AI' }}
        </button>
        <p class="text-xs text-muted-foreground">Enter a name, then let Nio suggest the description, instructions, icon, and relevant installed skills. You can edit everything before creating.</p>
        <p v-if="aiNotice" role="status" class="text-xs text-teal-700 dark:text-teal-400">{{ aiNotice }}</p>
        <section class="space-y-2" aria-labelledby="add-guru-icon-title">
          <div class="flex items-center justify-between gap-2">
            <h3 id="add-guru-icon-title" class="font-medium">Icon</h3>
            <button type="button" class="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted" :aria-expanded="showIconPicker" @click="showIconPicker = !showIconPicker">
              <component :is="GURU_ICONS[icon as keyof typeof GURU_ICONS]" :size="15" /> {{ icon }} · Change
            </button>
          </div>
          <div v-if="showIconPicker" class="space-y-2 rounded-md border border-border p-3">
            <input v-model="iconSearch" type="search" :placeholder="`Search ${GURU_ICON_NAMES.length} Lucide icons`" aria-label="Search Lucide icons" class="w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-teal-600" />
            <div class="grid max-h-40 grid-cols-6 gap-2 overflow-y-auto">
              <button v-for="choice in filteredIcons" :key="choice" type="button" :title="choice" :aria-label="`Use ${choice} icon`" :aria-pressed="icon === choice" class="flex h-10 items-center justify-center rounded-md border hover:bg-muted" :class="icon === choice ? 'border-teal-600 bg-teal-600/10 text-teal-600' : 'border-border'" @click="icon = choice; showIconPicker = false">
                <component :is="GURU_ICONS[choice]" :size="19" />
              </button>
            </div>
            <p v-if="!filteredIcons.length" class="text-xs text-muted-foreground">No icons match your search.</p>
          </div>
        </section>
        <label class="block space-y-1.5">
          <span class="font-medium">Short description</span>
          <input v-model="tagline" maxlength="180" placeholder="What this Guru helps with" class="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-teal-600" />
        </label>
        <label class="block space-y-1.5">
          <span class="font-medium">Instructions <span class="text-destructive">*</span></span>
          <textarea v-model="instructions" required maxlength="12000" rows="4" placeholder="Describe this Guru's role, expertise, and how it should respond." class="w-full resize-y rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-teal-600" />
        </label>

        <section class="space-y-2 border-t border-border pt-4" aria-labelledby="add-guru-skills-title">
          <div class="flex items-center gap-2">
            <BookOpen :size="16" class="text-teal-600" />
            <h3 id="add-guru-skills-title" class="font-semibold flex-1">Skills</h3>
            <span class="text-xs text-muted-foreground">{{ selection.length }} selected</span>
          </div>
          <p class="text-xs text-muted-foreground">Choose installed or bundled skills. Descriptions are collapsed by default.</p>
          <div v-if="selection.length" class="flex flex-wrap gap-1.5">
            <button v-for="skill in selection" :key="skill" type="button" :disabled="busy" class="rounded-md border border-teal-600/30 bg-teal-600/5 px-2 py-1 text-xs" :aria-label="`Remove ${skill}`" @click="selection = selection.filter(name => name !== skill)">{{ skill }} ×</button>
          </div>
          <input v-model="search" type="search" placeholder="Search skills" aria-label="Search skills" class="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-teal-600" />
          <p v-if="loadingSkills" class="text-xs text-muted-foreground">Loading skills…</p>
          <div v-else class="max-h-48 overflow-y-auto rounded-md border border-border px-3 divide-y divide-border">
            <div v-for="skill in sortedSkills" :key="skill.name" class="py-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="selection" type="checkbox" :value="skill.name" :disabled="busy || !skill.enabled" class="accent-teal-600" />
                <span class="font-medium">{{ skill.name }}</span>
                <span v-if="!skill.enabled" class="ml-auto text-xs text-muted-foreground">Disabled</span>
              </label>
              <details class="ml-6 mt-1 text-xs text-muted-foreground"><summary class="cursor-pointer">Details</summary><p class="mt-1">{{ skill.description }}</p></details>
            </div>
            <p v-if="!sortedSkills.length" class="py-3 text-xs text-muted-foreground">No matching skills.</p>
          </div>
          <div class="rounded-md border border-border bg-muted/20 p-3 space-y-2">
            <div class="flex items-center gap-2 font-medium"><Plus :size="14" /> Install from GitHub</div>
            <input v-model="source" type="url" placeholder="https://github.com/org/repo" aria-label="GitHub repository or skill URL" class="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-teal-600" />
            <input v-model="folder" type="text" placeholder="Skill folder (optional)" aria-label="Skill folder (optional)" class="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-1 focus:ring-teal-600" />
            <button type="button" :disabled="busy || generating || !source.trim()" class="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50" @click="installSkill">{{ busy ? 'Working…' : 'Install skill' }}</button>
            <p class="text-xs text-muted-foreground">Installing adds the skill to the shared Nio library, even if you cancel this Guru.</p>
            <p v-if="skillError" role="alert" class="text-xs text-destructive">{{ skillError }}</p>
            <p v-if="skillNotice" role="status" class="text-xs text-teal-700 dark:text-teal-400">{{ skillNotice }}</p>
          </div>
        </section>
      </form>

      <footer class="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" :disabled="busy" class="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50" @click="dialog?.close()">Cancel</button>
        <button type="button" :disabled="busy || generating || chat.isStreaming || !name.trim() || !instructions.trim()" class="rounded-md bg-teal-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50" @click="create">{{ busy ? 'Working…' : 'Create Guru' }}</button>
      </footer>
    </dialog>
  </Teleport>
</template>
