import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createWebhookAuditSink } from "../webhook-sink.js";
import type { AuditEvent } from "@lattice-kernel/schemas";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    eventId: `evt_${Math.random()}`,
    type: "infer",
    requestId: "req_1",
    scope: {},
    trustLevel: "trusted_user_explicit",
    timestamp: new Date().toISOString(),
    actor: "test",
    policyDecisions: [],
    ...overrides,
  };
}

describe("WebhookAuditSink", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "ok",
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends event via HTTP POST", async () => {
    const sink = createWebhookAuditSink({
      url: "https://hooks.example.com/audit",
    });

    await sink.emit(makeEvent());

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe("https://hooks.example.com/audit");
    expect(call[1].method).toBe("POST");

    const body = JSON.parse(call[1].body as string);
    expect(body.events).toHaveLength(1);
  });

  it("sends custom headers", async () => {
    const sink = createWebhookAuditSink({
      url: "https://hooks.example.com/audit",
      headers: { Authorization: "Bearer secret" },
    });

    await sink.emit(makeEvent());

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[1].headers.Authorization).toBe("Bearer secret");
  });

  it("filters by event type", async () => {
    const sink = createWebhookAuditSink({
      url: "https://hooks.example.com/audit",
      eventTypes: ["infer"],
    });

    await sink.emit(makeEvent({ type: "infer" }));
    await sink.emit(makeEvent({ type: "remember" }));
    await sink.emit(makeEvent({ type: "infer" }));

    // Only 2 infer events should be sent (in 2 separate calls since batchSize=1)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("batches events", async () => {
    const sink = createWebhookAuditSink({
      url: "https://hooks.example.com/audit",
      batchSize: 3,
    });

    await sink.emit(makeEvent());
    await sink.emit(makeEvent());
    expect(globalThis.fetch).not.toHaveBeenCalled(); // Not yet

    await sink.emit(makeEvent()); // Triggers batch
    expect(globalThis.fetch).toHaveBeenCalledOnce();

    const body = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]![1].body as string,
    );
    expect(body.events).toHaveLength(3);
  });

  it("flushes remaining events", async () => {
    const sink = createWebhookAuditSink({
      url: "https://hooks.example.com/audit",
      batchSize: 10,
    });

    await sink.emit(makeEvent());
    await sink.emit(makeEvent());
    expect(globalThis.fetch).not.toHaveBeenCalled();

    await sink.flush!();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("calls onError on delivery failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    });

    const errors: Error[] = [];
    const sink = createWebhookAuditSink({
      url: "https://hooks.example.com/audit",
      onError: (err) => errors.push(err),
    });

    await sink.emit(makeEvent());
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("500");
  });

  it("query returns empty (write-only)", async () => {
    const sink = createWebhookAuditSink({
      url: "https://hooks.example.com/audit",
    });
    const result = await sink.query({});
    expect(result.events).toEqual([]);
  });
});
