import type { AuditEvent, AuditEventType } from "@lattice-kernel/schemas";
import type { ScopeRef } from "@lattice-kernel/schemas";

export interface AuditSink {
  emit(event: AuditEvent): Promise<void>;
  query(filter: AuditQueryFilter): Promise<AuditQueryResult>;
  flush?(): Promise<void>;
}

export interface AuditQueryFilter {
  requestId?: string;
  traceId?: string;
  scope?: Partial<ScopeRef>;
  type?: AuditEventType;
  actor?: string;
  modelId?: string;
  since?: string;
  until?: string;
  hasError?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuditQueryResult {
  events: AuditEvent[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}
