import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useGurusStore } from './gurus';

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
  const selectedModel = ref<string>('kilo::kilo-auto/free');
  const selectedMode = ref<'ask' | 'plan' | 'build'>('ask');
  const availableModels = ref<Array<{ id: string; label: string }>>([]);

  const isStreaming = ref<boolean>(false);
  const streamingContent = ref<string>('');
  const streamingThought = ref<string>('');
  const streamingToolCalls = ref<ToolCall[]>([]);

  let activeAbortController: AbortController | null = null;

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
          if (!currentMatch) {
            const defaultModel =
              availableModels.value.find((m) => m.id.includes('kilo-auto') || m.id.includes('free')) ||
              availableModels.value[0];
            if (defaultModel) {
              selectedModel.value = defaultModel.id;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to load models:', err);
    }
  }

  async function fetchConversations(guruId?: string) {
    try {
      const url = guruId ? `/api/conversations?guruId=${encodeURIComponent(guruId)}` : '/api/conversations';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      conversations.value = data.conversations || [];
      const gurusStore = useGurusStore();
      for (const conv of conversations.value) {
        if (conv.lastMessage && conv.guruId) {
          gurusStore.updateLastMessage(conv.guruId, conv.lastMessage);
        }
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  }

  async function selectConversation(id: string) {
    activeConversationId.value = id;
    messages.value = [];
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      messages.value = data.conversation.messages || [];
      if (data.conversation.model) {
        selectedModel.value = data.conversation.model;
      }
    } catch (err) {
      console.error(`Failed to load conversation ${id}:`, err);
    }
  }

  async function startNewConversation(guruId: string): Promise<string> {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guruId,
          title: 'New Conversation',
          model: selectedModel.value,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const newConv = data.conversation;
      conversations.value.unshift(newConv);
      activeConversationId.value = newConv.id;
      messages.value = [];
      return newConv.id;
    } catch (err) {
      console.error('Failed to create conversation:', err);
      throw err;
    }
  }

  async function sendMessage(prompt: string, guruId: string) {
    if (!prompt.trim() || isStreaming.value) return;

    let convId = activeConversationId.value;
    if (!convId) {
      convId = await startNewConversation(guruId);
    }

    // Add user message to UI state immediately
    const userMsg: ChatMessage = {
      id: `temp-u-${Date.now()}`,
      conversationId: convId,
      role: 'user',
      content: prompt,
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
    isStreaming.value = true;
    streamingContent.value = '';
    streamingThought.value = '';
    streamingToolCalls.value = [];

    activeAbortController = new AbortController();

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: convId,
          prompt,
          model: selectedModel.value,
          mode: selectedMode.value,
        }),
        signal: activeAbortController.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = 'message';

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

              if (currentEvent === 'token' && data.text) {
                streamingContent.value += data.text;
              } else if (currentEvent === 'thought' && data.text) {
                streamingThought.value += (streamingThought.value ? '\n' : '') + data.text;
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
                messages.value.push(assistantMsg);
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
      if (err.name !== 'AbortError') {
        messages.value.push({
          id: `err-${Date.now()}`,
          conversationId: convId,
          role: 'system',
          content: `Error: ${err.message}`,
          createdAt: Date.now(),
        });
      }
    } finally {
      isStreaming.value = false;
      streamingContent.value = '';
      streamingThought.value = '';
      streamingToolCalls.value = [];
      activeAbortController = null;
      // Refresh conversations list to update title and timestamps
      fetchConversations(guruId);
    }
  }

  function stopStreaming() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }
    isStreaming.value = false;
  }

  async function deleteConversation(id: string) {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      conversations.value = conversations.value.filter((c) => c.id !== id);
      if (activeConversationId.value === id) {
        activeConversationId.value = null;
        messages.value = [];
      }
    } catch (err) {
      console.error(`Failed to delete conversation ${id}:`, err);
    }
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    messages,
    selectedModel,
    selectedMode,
    availableModels,
    isStreaming,
    streamingContent,
    streamingThought,
    streamingToolCalls,
    fetchModels,
    fetchConversations,
    selectConversation,
    startNewConversation,
    sendMessage,
    stopStreaming,
    deleteConversation,
  };
});
