<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useChatStore } from '../stores/chat';
const chat = useChatStore();
const dialog = ref<HTMLDialogElement>();
watch(() => chat.switchPromptOpen, async (open) => {
  await nextTick();
  if (open && !dialog.value?.open) dialog.value?.showModal();
  if (!open && dialog.value?.open) dialog.value.close();
});
function cancel(event: Event) {
  event.preventDefault();
  if (!chat.switchPromptBusy) void chat.answerChatSwitch(false);
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" aria-labelledby="stop-chat-title" aria-describedby="stop-chat-description" class="m-auto w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card text-foreground p-0 shadow-xl backdrop:bg-black/50" @cancel="cancel">
      <header class="border-b border-border px-5 py-4">
        <h2 id="stop-chat-title" class="font-semibold">Stop the current response?</h2>
      </header>
      <div class="px-5 py-4 text-sm">
        <p id="stop-chat-description">A response is still being generated. Stop it before switching chats? Your partial response will be saved.</p>
        <p v-if="chat.switchPromptError" role="alert" class="mt-3 text-destructive">{{ chat.switchPromptError }}</p>
      </div>
      <footer class="flex justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" autofocus :disabled="chat.switchPromptBusy" class="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50" @click="chat.answerChatSwitch(false)">Keep chatting</button>
        <button type="button" :disabled="chat.switchPromptBusy" class="rounded-md bg-teal-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" @click="chat.answerChatSwitch(true)">{{ chat.switchPromptBusy ? 'Stopping…' : 'Stop and continue' }}</button>
      </footer>
    </dialog>
  </Teleport>
</template>
