# ADR-002: Default-Deny Policy Engine

## Status
Accepted

## Context
The system handles sensitive operations (memory writes, adaptation, cloud routing, tool execution). The spec mandates that "policy is not optional" and that the runtime must "verify and constrain, not merely relay."

## Decision
The policy engine defaults to denying operations when no rules match (`defaultDeny: true`). Deny rules take absolute precedence over allow rules regardless of priority. The precedence order is: deny > require_approval > allow.

## Consequences
- New deployments must explicitly configure allow rules before operations succeed
- Development/testing can override with `defaultDeny: false`
- Accidental misconfiguration results in blocked operations (safe failure) rather than unauthorized access
- Rule upsert by ID prevents policy bloat from duplicate rules
- Glob pattern matching on scope, model, and tool fields allows flexible but auditable policies
