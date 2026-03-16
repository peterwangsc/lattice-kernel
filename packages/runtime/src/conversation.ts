import type { Message } from "@lattice-kernel/schemas";

export interface Conversation {
  readonly id: string;
  readonly messages: ReadonlyArray<Message>;
  addUser(content: string): void;
  addAssistant(content: string): void;
  addToolResult(toolUseId: string, content: string): void;
  getMessages(): Message[];
  clear(): void;
}

export interface ConversationManagerConfig {
  maxMessages?: number;
}

export interface ConversationManager {
  create(systemPrompt?: string): Conversation;
  get(id: string): Conversation | undefined;
  delete(id: string): void;
  list(): string[];
}

let conversationCounter = 0;

export function createConversationManager(
  config: ConversationManagerConfig = {},
): ConversationManager {
  const { maxMessages = 100 } = config;
  const conversations = new Map<string, ConversationState>();

  interface ConversationState {
    id: string;
    messages: Message[];
    systemPrompt?: string;
  }

  function createConversation(systemPrompt?: string): Conversation {
    const id = `conv_${Date.now()}_${++conversationCounter}`;
    const state: ConversationState = {
      id,
      messages: [],
      systemPrompt,
    };
    conversations.set(id, state);

    return buildConversation(state);
  }

  function buildConversation(state: ConversationState): Conversation {
    function trimToMax(): void {
      while (state.messages.length > maxMessages) {
        state.messages.shift();
      }
    }

    return {
      get id() {
        return state.id;
      },

      get messages() {
        return state.messages;
      },

      addUser(content: string): void {
        state.messages.push({ role: "user", content });
        trimToMax();
      },

      addAssistant(content: string): void {
        state.messages.push({ role: "assistant", content });
        trimToMax();
      },

      addToolResult(toolUseId: string, content: string): void {
        state.messages.push({ role: "tool_result", content, toolUseId });
        trimToMax();
      },

      getMessages(): Message[] {
        return [...state.messages];
      },

      clear(): void {
        state.messages.length = 0;
      },
    };
  }

  return {
    create(systemPrompt?: string): Conversation {
      return createConversation(systemPrompt);
    },

    get(id: string): Conversation | undefined {
      const state = conversations.get(id);
      if (!state) return undefined;
      return buildConversation(state);
    },

    delete(id: string): void {
      conversations.delete(id);
    },

    list(): string[] {
      return [...conversations.keys()];
    },
  };
}
