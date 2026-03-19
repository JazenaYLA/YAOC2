# Policy Gateway Design

The Policy Gateway is the NemoClaw-equivalent layer in YAOC2. It is implemented as a set of n8n workflows that intercept every proposed agent action before execution.

## ProposedAction Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ProposedAction",
  "type": "object",
  "required": ["action_id", "action_type", "resource", "parameters", "risk_level", "user", "channel", "timestamp"],
  "properties": {
    "action_id":    { "type": "string", "format": "uuid" },
    "action_type":  { "type": "string", "pattern": "^[a-z0-9_]+\\.[a-z0-9_]+$",
                      "description": "Namespaced action: resource.verb (e.g. misp.create_event, web.search, file.write)" },
    "resource":     { "type": "string" },
    "parameters":   { "type": "object" },
    "risk_level":   { "type": "string", "enum": ["low", "medium", "high", "critical"] },
    "user":         { "type": "string", "description": "channel:user_id (e.g. telegram:12345)" },
    "channel":      { "type": "string", "enum": ["telegram", "discord", "slack", "whatsapp", "api"] },
    "session_id":   { "type": "string" },
    "timestamp":    { "type": "string", "format": "date-time" },
    "context":      { "type": "object", "description": "Optional: conversation history snippet, project ref, etc." }
  }
}
```

## Risk Level Definitions

| Level | Examples | Default Behavior |
|---|---|---|
| `low` | web.search, memory.read, weather.get | Auto-approve |
| `medium` | misp.create_event, file.read, api.post | Approval prompt via configured channel |
| `high` | file.write, system.exec, opencti.create_report | Auto-deny if `POLICY_HIGH_RISK_AUTO_DENY=true`, else approval |
| `critical` | infra.*, credential.*, system.delete | Always deny |

## Policy Rules Configuration

See [policy/rules.yaml](../policy/rules.yaml) for the full allow/deny list. The gateway workflow loads this at runtime from Postgres.

## Approval Flow

```
Policy Gateway receives ProposedAction
    ↓
1. Validate JSON schema
2. Check action_type against policy/rules.yaml
   ├─ Denied action_type → DENY immediately, log, return error to agent
   └─ Allowed action_type → evaluate risk_level
3. Risk evaluation:
   ├─ low    → AUTO-APPROVE, log, call sandbox workflow
   ├─ medium → send approval request (Telegram/Slack)
   │          wait up to APPROVAL_TIMEOUT_SECONDS
   │          ├─ approved → log, call sandbox workflow
   │          └─ denied/timeout → DENY, log, return error
   ├─ high   → if POLICY_HIGH_RISK_AUTO_DENY=true → DENY
   │          else → same as medium
   └─ critical → always DENY
4. Audit log → Postgres yaoc2_policy.action_log
```

## n8n Workflow Files

See `lxc-n8nclaw/workflows/policy-gateway.json` (to be exported from n8n after import).

## Audit Log Schema (Postgres)

```sql
CREATE TABLE IF NOT EXISTS action_log (
    id            SERIAL PRIMARY KEY,
    action_id     UUID NOT NULL,
    action_type   TEXT NOT NULL,
    resource      TEXT NOT NULL,
    risk_level    TEXT NOT NULL,
    "user"        TEXT NOT NULL,
    channel       TEXT NOT NULL,
    decision      TEXT NOT NULL,  -- auto_approved | user_approved | denied | timeout
    decided_by    TEXT,           -- system | telegram:user_id
    parameters    JSONB,
    context       JSONB,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
```
