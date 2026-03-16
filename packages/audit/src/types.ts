import type { AuditEvent } from "@lattice-kernel/schemas";

export interface AuditSink {
  emit(event: AuditEvent): Promise<void>;
  query(filter: AuditQueryFilter): Promise<AuditEvent[]>;
}

export interface AuditQueryFilter {
  requestId?: string;
  scope?: Record<string, string | undefined>;
  type?: string;
  since?: string;
  limit?: number;
}
