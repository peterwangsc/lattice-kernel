import type { MemoryItem, ScopeRef, TrustLevel } from "@lattice-kernel/schemas";
import type { MemoryStore, MemoryStoreConfig, MemoryWriteInput, RetrieveOptions } from "./types.js";

const TRUST_ORDER: TrustLevel[] = [
  "quarantined",
  "untrusted_model_generated",
  "untrusted_external",
  "trusted_user_implicit",
  "trusted_user_explicit",
  "trusted_admin",
  "trusted_system",
];

function trustRank(level: TrustLevel): number {
  return TRUST_ORDER.indexOf(level);
}

let idCounter = 0;

function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * In-memory MemoryStore implementation.
 * Implements the write pipeline from spec section 12.3:
 * 1. candidate proposed → 2. classify → 3. attach provenance →
 * 4. apply policy → 5. approval check → 6. generate hash →
 * 7. persist → 8. emit audit event
 */
export function createMemoryStore(config: MemoryStoreConfig): MemoryStore {
  const { policyEngine, auditSink, maxItems = 100_000 } = config;
  const items = new Map<string, MemoryItem>();

  return {
    async write(input: MemoryWriteInput): Promise<MemoryItem> {
      // Step 4: Policy check
      const decision = policyEngine.evaluate({
        operation: "canRemember",
        scope: input.scope,
        trustLevel: input.trustLevel,
      });

      if (!decision.allowed) {
        await auditSink.emit({
          eventId: `evt_mem_${Date.now()}`,
          type: "memory_write",
          requestId: `memw_${Date.now()}_${++idCounter}`,
          scope: input.scope,
          trustLevel: input.trustLevel,
          timestamp: new Date().toISOString(),
          actor: input.source,
          policyDecisions: decision.matchedRules,
          error: decision.reason ?? "Policy denied memory write",
        });
        throw new Error(
          `Policy denied memory write: ${decision.reason ?? "no reason"}`,
        );
      }

      // Step 5: Approval check (logged if required)
      if (decision.requiresApproval) {
        await auditSink.emit({
          eventId: `evt_mem_${Date.now()}`,
          type: "memory_write",
          requestId: `memw_${Date.now()}_${++idCounter}`,
          scope: input.scope,
          trustLevel: input.trustLevel,
          timestamp: new Date().toISOString(),
          actor: input.source,
          policyDecisions: decision.matchedRules,
          error: "Memory write requires approval — not yet implemented",
        });
        throw new Error("Memory write requires approval");
      }

      // Steps 6-7: Generate hash and persist
      const id = `mem_${Date.now()}_${++idCounter}`;
      const now = new Date().toISOString();
      const hash = simpleHash(input.content + id);

      const item: MemoryItem = {
        id,
        scope: input.scope,
        type: input.type,
        content: input.content,
        source: input.source,
        provenance: input.provenance,
        classification: input.classification,
        trustLevel: input.trustLevel,
        createdAt: now,
        expiresAt: input.expiresAt,
        retentionPolicy: input.retentionPolicy,
        subjectRefs: input.subjectRefs ?? [],
        tags: input.tags ?? [],
        hash,
      };

      items.set(id, item);

      // Enforce max items
      if (items.size > maxItems) {
        const oldest = items.keys().next().value;
        if (oldest !== undefined) items.delete(oldest);
      }

      // Step 8: Audit event
      await auditSink.emit({
        eventId: `evt_${id}`,
        type: "memory_write",
        requestId: id,
        scope: input.scope,
        trustLevel: input.trustLevel,
        timestamp: now,
        actor: input.source,
        policyDecisions: decision.matchedRules,
      });

      return item;
    },

    async retrieve(
      query: string,
      scope: ScopeRef,
      options: RetrieveOptions = {},
    ): Promise<MemoryItem[]> {
      const { topK = 10, types, minTrustLevel } = options;
      const minRank = minTrustLevel ? trustRank(minTrustLevel) : 0;

      let results = [...items.values()];

      // Filter by scope
      results = results.filter((item) => scopeContains(item.scope, scope));

      // Filter by type
      if (types && types.length > 0) {
        results = results.filter((item) => types.includes(item.type));
      }

      // Filter by trust
      if (minTrustLevel) {
        results = results.filter(
          (item) => trustRank(item.trustLevel) >= minRank,
        );
      }

      // Filter expired
      const now = new Date().toISOString();
      results = results.filter(
        (item) => !item.expiresAt || item.expiresAt > now,
      );

      // Simple text relevance: items containing query terms rank higher
      const queryTerms = query.toLowerCase().split(/\s+/);
      results.sort((a, b) => {
        const scoreA = queryTerms.filter((t) =>
          a.content.toLowerCase().includes(t),
        ).length;
        const scoreB = queryTerms.filter((t) =>
          b.content.toLowerCase().includes(t),
        ).length;
        if (scoreB !== scoreA) return scoreB - scoreA;
        // Tie-break: higher trust first, then newer first
        const trustDiff = trustRank(b.trustLevel) - trustRank(a.trustLevel);
        if (trustDiff !== 0) return trustDiff;
        return b.createdAt.localeCompare(a.createdAt);
      });

      return results.slice(0, topK);
    },

    async get(id: string): Promise<MemoryItem | undefined> {
      return items.get(id);
    },

    async delete(id: string): Promise<void> {
      const item = items.get(id);
      if (!item) return;
      items.delete(id);

      await auditSink.emit({
        eventId: `evt_del_${id}`,
        type: "memory_delete",
        requestId: `memd_${Date.now()}`,
        scope: item.scope,
        trustLevel: item.trustLevel,
        timestamp: new Date().toISOString(),
        actor: "system",
        policyDecisions: [],
      });
    },

    async expireStale(): Promise<number> {
      const now = new Date().toISOString();
      let expired = 0;

      for (const [id, item] of items) {
        if (item.expiresAt && item.expiresAt <= now) {
          items.delete(id);
          expired++;

          await auditSink.emit({
            eventId: `evt_exp_${id}`,
            type: "memory_expire",
            requestId: `meme_${Date.now()}`,
            scope: item.scope,
            trustLevel: item.trustLevel,
            timestamp: now,
            actor: "system",
            policyDecisions: [],
          });
        }
      }

      return expired;
    },

    count(): number {
      return items.size;
    },
  };
}

function scopeContains(
  itemScope: Record<string, unknown>,
  queryScope: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(queryScope)) {
    if (value !== undefined && itemScope[key] !== value) {
      return false;
    }
  }
  return true;
}
