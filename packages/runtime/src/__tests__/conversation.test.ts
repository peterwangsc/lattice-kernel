import { describe, it, expect } from "vitest";
import { createConversationManager } from "../conversation.js";

describe("ConversationManager", () => {
  it("creates a conversation with unique ID", () => {
    const mgr = createConversationManager();
    const conv = mgr.create();
    expect(conv.id).toBeTruthy();
    expect(conv.messages).toHaveLength(0);
  });

  it("tracks message history", () => {
    const mgr = createConversationManager();
    const conv = mgr.create();

    conv.addUser("Hello");
    conv.addAssistant("Hi there!");
    conv.addUser("How are you?");

    expect(conv.messages).toHaveLength(3);
    expect(conv.messages[0]).toEqual({ role: "user", content: "Hello" });
    expect(conv.messages[1]).toEqual({ role: "assistant", content: "Hi there!" });
    expect(conv.messages[2]).toEqual({ role: "user", content: "How are you?" });
  });

  it("supports tool result messages", () => {
    const mgr = createConversationManager();
    const conv = mgr.create();

    conv.addUser("What's the weather?");
    conv.addAssistant("Let me check.");
    conv.addToolResult("toolu_123", '{"temp": 72}');

    expect(conv.messages[2]).toEqual({
      role: "tool_result",
      content: '{"temp": 72}',
      toolUseId: "toolu_123",
    });
  });

  it("getMessages returns a copy", () => {
    const mgr = createConversationManager();
    const conv = mgr.create();
    conv.addUser("test");

    const msgs = conv.getMessages();
    msgs.push({ role: "user", content: "injected" });

    expect(conv.messages).toHaveLength(1);
  });

  it("enforces maxMessages limit", () => {
    const mgr = createConversationManager({ maxMessages: 3 });
    const conv = mgr.create();

    conv.addUser("msg1");
    conv.addAssistant("resp1");
    conv.addUser("msg2");
    conv.addAssistant("resp2"); // This should evict msg1

    expect(conv.messages).toHaveLength(3);
    expect(conv.messages[0]!.content).toBe("resp1");
  });

  it("clears conversation history", () => {
    const mgr = createConversationManager();
    const conv = mgr.create();
    conv.addUser("hello");
    conv.addAssistant("hi");

    conv.clear();
    expect(conv.messages).toHaveLength(0);
  });

  it("retrieves conversation by ID", () => {
    const mgr = createConversationManager();
    const conv = mgr.create();
    conv.addUser("stored message");

    const retrieved = mgr.get(conv.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.messages).toHaveLength(1);
  });

  it("returns undefined for unknown ID", () => {
    const mgr = createConversationManager();
    expect(mgr.get("nonexistent")).toBeUndefined();
  });

  it("deletes conversations", () => {
    const mgr = createConversationManager();
    const conv = mgr.create();
    mgr.delete(conv.id);
    expect(mgr.get(conv.id)).toBeUndefined();
  });

  it("lists all conversation IDs", () => {
    const mgr = createConversationManager();
    mgr.create();
    mgr.create();
    mgr.create();

    expect(mgr.list()).toHaveLength(3);
  });
});
