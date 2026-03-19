# Policy Model

## Overview

Policies define what the YAOC2 agent is allowed to do, under what conditions, and whether human approval is required. They are evaluated by the `yaoc2-policy-gateway` workflow for every ProposedAction.

Policies are stored as YAML files in `policies/policy-sets/` and optionally mirrored into the gateway Postgres DB for runtime edits without redeployment.

---

## ProposedAction Schema

```json
{
  "id": "uuid-v4",
  "timestamp": "ISO-8601",

  "agent": {
    "name": "string",
    "version": "string",
    "session_id": "string"
  },

  "requester": {
    "user_id": "string",
    "display_name": "string",
    "channel": "telegram | discord | web | api",
    "tenant": "string"
  },

  "intent": {
    "title": "string",
    "description": "string",
    "user_prompt": "string"
  },

  "action": {
    "type": "workflow | http_call | shell | external_soar",
    "name": "string",
    "target_system": "string",
    "mode": "read-only | read-write | admin",
    "parameters": {}
  },

  "risk": {
    "level": "low | medium | high | critical",
    "reasons": ["string"],
    "estimated_impact": "string"
  },

  "constraints": {
    "must_complete_before": "ISO-8601",
    "max_cost_units": 10,
    "dry_run": false
  },

  "policy": {
    "policy_set": "string",
    "required_approvals": [
      { "role": "string", "count": 1 }
    ]
  },

  "llm_explanation": {
    "reasoning_summary": "string",
    "alternatives_considered": ["string"]
  }
}
```

---

## Policy YAML Schema

```yaml
meta:
  name: string
  version: string

defaults:
  max_cost_units: int
  auto_allow_low_risk: bool
  auto_deny_critical_without_approval: bool

rules:
  - id: string
    description: string
    match:
      target_system: string        # exact or "*"
      action_name: string          # exact or "*"
      mode: string                 # read-only | read-write | admin | "*"
      min_risk_level: string       # low | medium | high | critical
      channel: string              # telegram | discord | web | api | "*"
      tenant: string               # or "*"
    decision: allow | deny | needs-approval
    approvers:
      role: string
      count: int
```

---

## Policy Evaluation Order

1. Find all rules where `match` fields are satisfied (most specific first).
2. The first matching rule's `decision` wins.
3. If no rule matches, fall back to `defaults`:
   - `low` risk → `allow` (if `auto_allow_low_risk: true`).
   - `critical` risk → `deny` (if `auto_deny_critical_without_approval: true`).
   - Otherwise → `needs-approval`.

---

## Gateway Response Schema

```json
{
  "proposed_action_id": "uuid-v4",
  "final_status": "executed | denied | pending-approval | failed",
  "result_summary": "string",
  "raw_result_ref": "string"
}
```
