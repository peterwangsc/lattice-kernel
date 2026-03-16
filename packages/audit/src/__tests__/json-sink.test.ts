import { describe, it, expect } from "vitest";
import { createJsonAuditSink } from "../json-sink.js";
import type { AuditEvent } from "@lattice-kernel/schemas";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    eventId: "evt_1",
    type: "infer",
    requestId: "req_1",
    scope: { tenantId: "acme" },
    trustLevel: "trusted_user_explicit",
    timestamp: "2025-01-01T00:00:00.000Z",
    actor: "test",
    policyDecisions: ["rule-1"],
    ...overrides,
  };
}

describe("JsonAuditSink", () => {
  it("writes structured JSON lines", async () => {
    const lines: string[] = [];
    const sink = createJsonAuditSink({ writer: (line) => lines.push(line) });

    await sink.emit(makeEvent());

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.level).toBe("info");
    expect(parsed.eventId).toBe("evt_1");
    expect(parsed.type).toBe("infer");
    expect(parsed.scope.tenantId).toBe("acme");
  });

  it("marks error events with error level", async () => {
    const lines: string[] = [];
    const sink = createJsonAuditSink({ writer: (line) => lines.push(line) });

    await sink.emit(makeEvent({ error: "something failed" }));

    const parsed = JSON.parse(lines[0]!);
    expect(parsed.level).toBe("error");
    expect(parsed.error).toBe("something failed");
  });

  it("query returns empty (write-only sink)", async () => {
    const sink = createJsonAuditSink({ writer: () => {} });
    await sink.emit(makeEvent());

    const results = await sink.query({});
    expect(results.events).toEqual([]);
    expect(results.total).toBe(0);
  });

  it("writes multiple events as separate lines", async () => {
    const lines: string[] = [];
    const sink = createJsonAuditSink({ writer: (line) => lines.push(line) });

    await sink.emit(makeEvent({ eventId: "evt_1" }));
    await sink.emit(makeEvent({ eventId: "evt_2" }));
    await sink.emit(makeEvent({ eventId: "evt_3" }));

    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[2]!).eventId).toBe("evt_3");
  });
});
