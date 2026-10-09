import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { DEFAULT_NIO_MODEL_ID, getPreferredNioModelId } from '../../../../packages/shared/src/nio-models';
import { useGurusStore } from './gurus';
import type { AttachmentInfo } from '../../../../packages/shared/src/attachments';

export interface ToolCall {
  id: string;
  tool: string;
  title?: string;
  status: 'running' | 'completed' | 'error';
  input?: any;
  output?: any;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string;
  toolCalls?: ToolCall[];
  attachments?: AttachmentInfo[];
  createdAt: number;
}

export interface Conversation {
  id: string;
  guruId: string;
  title: string;
  model: string;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
  lastMessage?: {
    role: string;
    content: string;
    createdAt: number;
  };
}

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([]);
  const activeConversationId = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const selectedModel = ref<string>(DEFAULT_NIO_MODEL_ID);
  let modelSelectionManual = false;
  let modelSaveQueue = Promise.resolve();
  const availableModels = ref<Array<{ id: string; label: string }>>([]);

  const isStreaming = ref<boolean>(false);
  const isLoadingConversation = ref(true);
  const hasMoreMessages = ref(false);
  const isLoadingOlderMessages = ref(false);
  const olderMessagesError = ref('');
  const streamingContent = ref<string>('');
  const streamingThought = ref<string>('');
  const streamingToolCalls = ref<ToolCall[]>([]);

  let activeAbortController: AbortController | null = null;
  let activeTurnFinished: Promise<void> | null = null;
  let streamConversationId: string | null = null;
  let streamRequestSent = false;
  let stopPromise: Promise<boolean> | null = null;
  let navigationRevision = 0;
  const switchPromptOpen = ref(false);
  const switchPromptBusy = ref(false);
  const switchPromptError = ref('');
  let resolveSwitch: ((confirmed: boolean) => void) | null = null;

  function allowChatSwitch(): Promise<boolean> {
    if (!isStreaming.value) return Promise.resolve(true);
    if (switchPromptOpen.value) return Promise.resolve(false);
    switchPromptError.value = '';
    switchPromptOpen.value = true;
    return new Promise(resolve => { resolveSwitch = resolve; });
  }
  async function answerChatSwitch(confirmed: boolean) {
    if (switchPromptBusy.value || !resolveSwitch) return;
    if (confirmed) {
      switchPromptBusy.value = true;
      const stopped = await stopStreaming();
      switchPromptBusy.value = false;
      if (!stopped) { switchPromptError.value = 'Could not stop the response. Please try again.'; return; }
    }
    const resolve = resolveSwitch;
    resolveSwitch = null;
    switchPromptOpen.value = false;
    resolve(confirmed);
  }
  async function switchGuru(id: string) {
    const gurus = useGurusStore();
    if (gurus.activeGuruId === id || !(await allowChatSwitch())) return;
    navigationRevision++;
    isLoadingConversation.value = true;
    gurus.setActiveGuru(id);
    activeConversationId.value = null;
    messages.value = [];
    hasMoreMessages.value = false;
    await fetchConversations(id);
  }

  const activeConversation = computed(() => {
    return conversations.value.find((c) => c.id === activeConversationId.value) || null;
  });

  async function fetchModels() {
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        const data = await res.json();
        availableModels.value = data.models || [];
        if (availableModels.value.length > 0) {
          const currentMatch = availableModels.value.find((m) => m.id === selectedModel.value);
          if (!modelSelectionManual || !currentMatch) {
            selectedModel.value = getPreferredNioModelId(availableModels.value);
            modelSelectionManual = false;
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load models:', err);
    }
  }

  async function fetchConversations(guruId?: string, selectLatest = true) {
    const version = navigationRevision;
    const targetGuru = useGurusStore().activeGuruId;
    if (selectLatest && !isStreaming.value) isLoadingConversation.value = true;
    try {
      const url = guruId ? `/api/conversations?guruId=${encodeURIComponent(guruId)}` : '/api/conversations';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (version !== navigationRevision || targetGuru !== useGurusStore().activeGuruId) return;
      conversations.value = data.conversations || [];
      const gurusStore = useGurusStore();
      const seenGurus = new Set<string>();
      for (const conv of conversations.value) {
        if (conv.lastMessage && conv.guruId && !seenGurus.has(conv.guruId)) {
          seenGurus.add(conv.guruId);
          gurusStore.updateLastMessage(conv.guruId, conv.lastMessage);
        }
      }

      // Automatically select latest conversation for this Guru, or clear messages if no conversation exists
      if (guruId && selectLatest && !isStreaming.value) {
        if (conversations.value.length > 0) {
          await selectConversation(conversations.value[0].id);
        } else {
          activeConversationId.value = null;
          messages.value = [];
          hasMoreMessages.value = false;
        }
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      if (version === navigationRevision && selectLatest) isLoadingConversation.value = false;
    }
  }

  async function selectConversation(id: string, finishStream = false) {
    if (id !== activeConversationId.value && !(await allowChatSwitch())) return;
    const changed = activeConversationId.value !== id;
    const version = ++navigationRevision;
    if (changed) {
      isLoadingConversation.value = true;
      messages.value = [];
      hasMoreMessages.value = false;
      olderMessagesError.value = '';
    }
    activeConversationId.value = id;
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (version !== navigationRevision || activeConversationId.value !== id) return;
      if (finishStream) {
        isStreaming.value = false;
        streamingContent.value = '';
        streamingThought.value = '';
        streamingToolCalls.value = [];
      }
      messages.value = data.conversation.messages || [];
      hasMoreMessages.value = !!data.conversation.hasMoreMessages;
      if (data.conversation.model && (!availableModels.value.length
        || availableModels.value.some(model => model.id === data.conversation.model))) {
        selectedModel.value = data.conversation.model;
        modelSelectionManual = true;
      } else {
        selectedModel.value = getPreferredNioModelId(availableModels.value);
        modelSelectionManual = false;
      }
    } catch (err) {
      console.error(`Failed to load conversation ${id}:`, err);
    } finally {
      if (version === navigationRevision) isLoadingConversation.value = false;
    }
  }

  async function loadOlderMessages(): Promise<boolean> {
    const id = activeConversationId.value;
    const oldest = messages.value[0];
    if (!id || !oldest || !hasMoreMessages.value || isLoadingOlderMessages.value || isLoadingConversation.value) return false;
    const version = navigationRevision;
    isLoadingOlderMessages.value = true;
    olderMessagesError.value = '';
    try {
      const params = new URLSearchParams({ beforeAt: String(oldest.createdAt), beforeId: oldest.id });
      const response = await fetch(`/api/conversations/${encodeURIComponent(id)}/messages?${params}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load older messages.');
      if (version !== navigationRevision || activeConversationId.value !== id) return false;
      const existing = new Set(messages.value.map(message => message.id));
      const older = (data.messages as ChatMessage[]).filter(message => !existing.has(message.id));
      messages.value = [...older, ...messages.value];
      hasMoreMessages.value = !!data.hasMore;
      return older.length > 0;
    } catch (error) {
      if (version === navigationRevision && activeConversationId.value === id) olderMessagesError.value = (error as Error).message;
      return false;
    } finally { isLoadingOlderMessages.value = false; }
  }

  async function startNewConversation(guruId: string): Promise<string | null> {
    if (!(await allowChatSwitch())) return null;
    navigationRevision++;
    return createConversation(guruId);
  }

  async function createConversation(guruId: string, signal?: AbortSignal): Promise<string> {
    const version = navigationRevision;
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guruId,
          title: 'New Conversation',
          model: selectedModel.value,
        }),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const newConv = data.conversation;
      if (!signal?.aborted && version === navigationRevision && useGurusStore().activeGuruId === guruId) {
        conversations.value.unshift(newConv);
        activeConversationId.value = newConv.id;
        messages.value = [];
        hasMoreMessages.value = false;
      }
      return newConv.id;
    } catch (err) {
      console.error('Failed to create conversation:', err);
      throw err;
    }
  }

  async function sendMessage(prompt: string, guruId: string, files: File[] = []) {
    if ((!prompt.trim() && !files.length) || isStreaming.value || isLoadingConversation.value) return;
    if (!prompt.trim()) prompt = 'Please inspect the attached files.';

    const controller = new AbortController();
    activeAbortController = controller;
    isStreaming.value = true;
    let resolveTurn!: () => void;
    const finished = new Promise<void>(resolve => { resolveTurn = resolve; });
    activeTurnFinished = finished;
    let convId = activeConversationId.value;
    let pendingContent = '', pendingThought = '';
    let flushTimer: ReturnType<typeof setTimeout> | undefined;
    const flushPending = () => {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = undefined;
      if (activeAbortController === controller) {
        streamingContent.value += pendingContent;
        if (pendingThought) streamingThought.value += (streamingThought.value ? '\n' : '') + pendingThought;
      }
      pendingContent = ''; pendingThought = '';
    };
    const scheduleFlush = () => { flushTimer ??= setTimeout(flushPending, 60); };
    try {
      if (!convId || activeConversation.value?.guruId !== guruId) {
        convId = await createConversation(guruId, controller.signal);
      }

      if (controller.signal.aborted) return;
      streamConversationId = convId;

      // Add user message to UI state immediately
      const userMsg: ChatMessage = {
        id: `temp-u-${Date.now()}`,
        conversationId: convId,
        role: 'user',
        content: prompt,
        attachments: files.map(file => ({ name: file.name, size: file.size, type: file.type })),
        createdAt: Date.now(),
      };
      messages.value.push(userMsg);
      const gurusStore = useGurusStore();
      gurusStore.updateLastMessage(guruId, {
        role: 'user',
        content: prompt,
        createdAt: userMsg.createdAt,
      });

      // Reset streaming state
      streamingContent.value = '';
      streamingThought.value = '';
      streamingToolCalls.value = [];

      streamRequestSent = true;
      const payload = { conversationId: convId, prompt, model: selectedModel.value };
      const upload = new FormData();
      if (files.length) {
        for (const [key, value] of Object.entries(payload)) upload.append(key, value);
        for (const file of files) upload.append('files', file);
      }
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: files.length ? undefined : { 'Content-Type': 'application/json' },
        body: files.length ? upload : JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `HTTP error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = 'message';

      while (true) {
        const { value, done } = await reader.read();
        if (done || controller.signal.aborted) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }

          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.slice(5).trim();
            try {
              const data = JSON.parse(jsonStr);

              if (['done', 'error', 'cancelled'].includes(currentEvent)) flushPending();
              if (currentEvent === 'token' && data.text) {
                pendingContent += data.text;
                scheduleFlush();
              } else if (currentEvent === 'warning' || currentEvent === 'error') {
                messages.value.push({
                  id: `notice-${Date.now()}`,
                  conversationId: convId,
                  role: 'system',
                  content: currentEvent === 'error' ? `Error: ${data.error}` : data.text,
                  createdAt: Date.now(),
                });
              } else if (currentEvent === 'thought' && data.text) {
                pendingThought += (pendingThought ? '\n' : '') + data.text;
                scheduleFlush();
              } else if (currentEvent === 'tool_call' && data.toolCall) {
                const idx = streamingToolCalls.value.findIndex((t) => t.id === data.toolCall.id);
                if (idx !== -1) {
                  streamingToolCalls.value[idx] = data.toolCall;
                } else {
                  streamingToolCalls.value.push(data.toolCall);
                }
              } else if (currentEvent === 'done') {
                // Turn completed
                const assistantMsg: ChatMessage = {
                  id: `msg-${Date.now()}`,
                  conversationId: convId,
                  role: 'assistant',
                  content: streamingContent.value,
                  thought: streamingThought.value,
                  toolCalls: [...streamingToolCalls.value],
                  createdAt: Date.now(),
                };
                // The live bubble becomes a saved message in finally without remounting history.
                const gurusStore = useGurusStore();
                gurusStore.updateLastMessage(guruId, {
                  role: 'assistant',
                  content: assistantMsg.content,
                  createdAt: assistantMsg.createdAt,
                });
              }
            } catch (pErr) {}
          }
        }
      }
    } catch (err: any) {
      if (!controller.signal.aborted && err.name !== 'AbortError' && convId) {
        messages.value.push({
          id: `err-${Date.now()}`,
          conversationId: convId,
          role: 'system',
          content: `Error: ${err.message}`,
          createdAt: Date.now(),
        });
      }
    } finally {
      flushPending();
      try {
        if (activeAbortController === controller && convId && activeConversationId.value === convId && useGurusStore().activeGuruId === guruId) {
          // Keep the rendered response in place. Reloading the conversation here
          // remounts Mermaid diagrams and flashes between loading states.
          if (streamingContent.value.trim().length > 0 || streamingToolCalls.value.length > 0) {
            messages.value.push({
              id: `msg-${Date.now()}`, conversationId: convId, role: 'assistant',
              content: streamingContent.value, thought: streamingThought.value,
              toolCalls: [...streamingToolCalls.value], createdAt: Date.now(),
            });
          }
          void fetchConversations(guruId, false);
        }
      } finally {
        if (activeAbortController === controller) {
          isStreaming.value = false;
          streamingContent.value = '';
          streamingThought.value = '';
          streamingToolCalls.value = [];
          activeAbortController = null;
          activeTurnFinished = null;
          streamConversationId = null;
          streamRequestSent = false;
        }
        resolveTurn();
      }
    }
  }

  function selectModel(id: string) {
    selectedModel.value = id;
    modelSelectionManual = true;
    const conversation = activeConversation.value;
    if (!conversation) return;
    conversation.model = id;
    // Keep rapid model changes in order and persist the choice for this thread.
    modelSaveQueue = modelSaveQueue.then(async () => {
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversation.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: id }),
      });
      if (!response.ok) throw new Error('Could not save the model choice for this conversation.');
    }).catch(error => {
      messages.value.push({ id: `model-error-${Date.now()}`, conversationId: conversation.id,
        role: 'system', content: (error as Error).message, createdAt: Date.now() });
    });
  }

  async function stopStreaming(): Promise<boolean> {
    if (stopPromise) return stopPromise;
    const controller = activeAbortController;
    const finished = activeTurnFinished;
    if (!controller) return true;
    stopPromise = (async () => {
      try {
        if (streamRequestSent && streamConversationId) {
          const response = await fetch(`/api/chat/${encodeURIComponent(streamConversationId)}/stop`, { method: 'POST' });
          if (!response.ok) throw new Error('Could not stop the current response.');
        }
        controller.abort();
        if (finished) await finished;
        return true;
      } catch (error) {
        console.warn('Could not stop response:', error);
        return false;
      }
    })();
    try { return await stopPromise; }
    finally { stopPromise = null; }
  }

  async function deleteConversation(id: string) {
    if (isStreaming.value && !(await allowChatSwitch())) return;
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      conversations.value = conversations.value.filter((c) => c.id !== id);
      if (activeConversationId.value === id) {
        activeConversationId.value = null;
        messages.value = [];
        hasMoreMessages.value = false;
      }
    } catch (err) {
      console.error(`Failed to delete conversation ${id}:`, err);
    }
  }

  async function retryMessage(failedMessageId?: string) {
    if (isStreaming.value || isLoadingConversation.value) return;
    const gurus = useGurusStore();
    const guruId = gurus.activeGuruId;
    if (!guruId) return;

    let targetIndex = -1;
    if (failedMessageId) {
      targetIndex = messages.value.findIndex((m) => m.id === failedMessageId);
    }
    if (targetIndex === -1) {
      targetIndex = messages.value.length - 1;
    }

    // Find the nearest preceding user message
    let userMsg: ChatMessage | undefined;
    for (let i = targetIndex; i >= 0; i--) {
      if (messages.value[i].role === 'user') {
        userMsg = messages.value[i];
        break;
      }
    }

    if (!userMsg) {
      userMsg = [...messages.value].reverse().find((m) => m.role === 'user');
    }

    if (!userMsg || !userMsg.content) return;

    const promptToRetry = userMsg.content;
    const conversationId = activeConversationId.value;

    // Prune the failed attempt:
    // system error message, empty assistant message, and user message (sendMessage will re-create it)
    const toRemove: string[] = [];
    if (failedMessageId) toRemove.push(failedMessageId);

    for (let i = messages.value.length - 1; i >= 0; i--) {
      const m = messages.value[i];
      if (m.createdAt >= userMsg.createdAt) {
        if (m.role === 'system' || (m.role === 'assistant' && !m.content.trim()) || m.id === userMsg.id) {
          toRemove.push(m.id);
        }
      }
    }

    const removeSet = new Set(toRemove);
    messages.value = messages.value.filter((m) => !removeSet.has(m.id));

    // Best-effort delete from backend database
    if (conversationId) {
      for (const id of toRemove) {
        if (!id.startsWith('temp-') && !id.startsWith('err-') && !id.startsWith('notice-')) {
          try {
            await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(id)}`, {
              method: 'DELETE',
            });
          } catch {}
        }
      }
    }

    await sendMessage(promptToRetry, guruId);
  }

  return {
    conversations,
    switchGuru,
    switchPromptOpen,
    switchPromptBusy,
    switchPromptError,
    answerChatSwitch,
    activeConversationId,
    activeConversation,
    messages,
    selectedModel,
    selectModel,
    availableModels,
    isStreaming,
    isLoadingConversation,
    hasMoreMessages,
    isLoadingOlderMessages,
    olderMessagesError,
    loadOlderMessages,
    streamingContent,
    streamingThought,
    streamingToolCalls,
    fetchModels,
    fetchConversations,
    selectConversation,
    startNewConversation,
    sendMessage,
    retryMessage,
    stopStreaming,
    deleteConversation,
  };
});
