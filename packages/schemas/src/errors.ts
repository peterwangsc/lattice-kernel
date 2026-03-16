/**
 * Structured error types for the Lattice runtime.
 * Each error carries a code, message, and optional context
 * for programmatic error handling.
 */

export class LatticeError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(code: string, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "LatticeError";
    this.code = code;
    this.context = context;
  }
}

export class PolicyDeniedError extends LatticeError {
  readonly matchedRules: string[];

  constructor(
    operation: string,
    reason: string | undefined,
    matchedRules: string[],
    context?: Record<string, unknown>,
  ) {
    super(
      "POLICY_DENIED",
      `Policy denied ${operation}: ${reason ?? "no reason given"}`,
      context,
    );
    this.name = "PolicyDeniedError";
    this.matchedRules = matchedRules;
  }
}

export class ApprovalRequiredError extends LatticeError {
  readonly matchedRules: string[];

  constructor(
    operation: string,
    matchedRules: string[],
    context?: Record<string, unknown>,
  ) {
    super(
      "APPROVAL_REQUIRED",
      `${operation} requires approval`,
      context,
    );
    this.name = "ApprovalRequiredError";
    this.matchedRules = matchedRules;
  }
}

export class AdapterError extends LatticeError {
  readonly providerId: string;
  readonly statusCode?: number;

  constructor(
    providerId: string,
    message: string,
    statusCode?: number,
    context?: Record<string, unknown>,
  ) {
    super("ADAPTER_ERROR", message, context);
    this.name = "AdapterError";
    this.providerId = providerId;
    this.statusCode = statusCode;
  }
}

export class ToolNotFoundError extends LatticeError {
  readonly toolId: string;

  constructor(toolId: string) {
    super("TOOL_NOT_FOUND", `Tool not found: ${toolId}`, { toolId });
    this.name = "ToolNotFoundError";
    this.toolId = toolId;
  }
}

export class CheckpointNotFoundError extends LatticeError {
  readonly checkpointId: string;

  constructor(checkpointId: string) {
    super("CHECKPOINT_NOT_FOUND", `Checkpoint not found: ${checkpointId}`, {
      checkpointId,
    });
    this.name = "CheckpointNotFoundError";
    this.checkpointId = checkpointId;
  }
}

export class NoAdaptersError extends LatticeError {
  constructor() {
    super("NO_ADAPTERS", "No adapters configured");
    this.name = "NoAdaptersError";
  }
}
