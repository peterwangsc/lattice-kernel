import type { AuditEvent, AuditEventType } from "@lattice-kernel/schemas";
import type { ScopeRef } from "@lattice-kernel/schemas";

export interface AuditSink {
  emit(event: AuditEvent): Promise<void>;
  query(filter: AuditQueryFilter): Promise<AuditEvent[]>;
  flush?(): Promise<void>;
}

export interface AuditQueryFilter {
  requestId?: string;
  scope?: Partial<ScopeRef>;
  type?: AuditEventType;
  actor?: string;
  since?: string;
  until?: string;
  limit?: number;
}
