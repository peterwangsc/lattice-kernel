# ADR-003: Trust Level Taxonomy and Ordering

## Status
Accepted

## Context
Every state mutation must carry trust provenance (spec section 11). Memory retrieval needs to rank results by trust when relevance scores tie. The system must distinguish between system-generated, admin-approved, user-explicit, user-implicit, external, model-generated, and quarantined inputs.

## Decision
Define a fixed 7-level trust taxonomy ordered from lowest to highest:
1. `quarantined`
2. `untrusted_model_generated`
3. `untrusted_external`
4. `trusted_user_implicit`
5. `trusted_user_explicit`
6. `trusted_admin`
7. `trusted_system`

This ordering is used for memory retrieval ranking (higher trust breaks ties) and for minimum trust level filtering.

## Consequences
- Memory retrieval can filter by minimum trust level using numeric comparison
- Trust levels are string enums validated by zod, preventing invalid values
- The ordering places model-generated content above quarantined but below all user/admin/system trust — reflecting that model output should never be auto-trusted
- Adding new trust levels requires updating the ordered array in memory-store.ts and the zod enum in schemas
