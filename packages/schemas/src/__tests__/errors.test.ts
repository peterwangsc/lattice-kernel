import { describe, it, expect } from "vitest";
import {
  LatticeError,
  PolicyDeniedError,
  ApprovalRequiredError,
  AdapterError,
  ToolNotFoundError,
  CheckpointNotFoundError,
  NoAdaptersError,
} from "../errors.js";

describe("Structured Errors", () => {
  it("LatticeError has code and context", () => {
    const err = new LatticeError("TEST_CODE", "test message", { key: "val" });
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test message");
    expect(err.context).toEqual({ key: "val" });
    expect(err.name).toBe("LatticeError");
    expect(err instanceof Error).toBe(true);
  });

  it("PolicyDeniedError includes operation and matched rules", () => {
    const err = new PolicyDeniedError("infer", "no matching rules", ["rule-1"]);
    expect(err.code).toBe("POLICY_DENIED");
    expect(err.message).toContain("infer");
    expect(err.matchedRules).toEqual(["rule-1"]);
    expect(err instanceof LatticeError).toBe(true);
  });

  it("ApprovalRequiredError", () => {
    const err = new ApprovalRequiredError("memory write", ["rule-2"]);
    expect(err.code).toBe("APPROVAL_REQUIRED");
    expect(err.matchedRules).toEqual(["rule-2"]);
  });

  it("AdapterError includes provider and status", () => {
    const err = new AdapterError("anthropic", "rate limited", 429);
    expect(err.code).toBe("ADAPTER_ERROR");
    expect(err.providerId).toBe("anthropic");
    expect(err.statusCode).toBe(429);
  });

  it("ToolNotFoundError", () => {
    const err = new ToolNotFoundError("calc");
    expect(err.code).toBe("TOOL_NOT_FOUND");
    expect(err.toolId).toBe("calc");
  });

  it("CheckpointNotFoundError", () => {
    const err = new CheckpointNotFoundError("cp_123");
    expect(err.code).toBe("CHECKPOINT_NOT_FOUND");
    expect(err.checkpointId).toBe("cp_123");
  });

  it("NoAdaptersError", () => {
    const err = new NoAdaptersError();
    expect(err.code).toBe("NO_ADAPTERS");
  });

  it("errors are catchable by type", () => {
    try {
      throw new PolicyDeniedError("infer", "denied", []);
    } catch (err) {
      if (err instanceof PolicyDeniedError) {
        expect(err.code).toBe("POLICY_DENIED");
      } else {
        expect.unreachable();
      }
    }
  });
});
