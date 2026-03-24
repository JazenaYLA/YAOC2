# Antigravity — Communications Capability Guard

> **Last updated:** March 2026  
> **Applies to:** All agents (Antigravity, Copilot, manual contributors) making changes to gateway send workflows.

---

## Purpose

The Capability Guard is a pre-flight check that runs **before any outbound communication node** (Telegram send, WhatsApp send, etc.) in the Policy Gateway. It prevents silent failures when environment variables or credentials are absent by returning a structured `{status, missingFields, instructions}` response that can be logged to `yaoc2.audit_log` and surfaced as an operator alert.

---

## Workflow Location

| Workflow | File | Call method |
|---|---|---|
| `[YAOC2] Capability Guard — Communications` | `n8n/gateway/workflows/yaoc2-capability-guard-comms.json` | Execute Workflow (synchronous, same owner) |

---

## Call Contract

### Input

```json
{ "capability": "telegram" }
```

Valid `capability` values: `telegram`, `whatsapp`, `deepseek`

### Output — Success

```json
{ "status": "ok", "capability": "telegram", "checkedFields": ["TELEGRAM_BOT_TOKEN", "APPROVAL_CHAT_ID"] }
```

### Output — Failure

```json
{
  "status": "missing",
  "missingFields": ["TELEGRAM_BOT_TOKEN"],
  "instructions": "Set TELEGRAM_BOT_TOKEN and APPROVAL_CHAT_ID in your n8n environment, and ensure the Telegram Bot credential is configured."
}
```

---

## Required Environment Variables Per Channel

### Telegram

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Auth token for the Telegram Bot API |
| `APPROVAL_CHAT_ID` | Chat ID where approval requests and operator alerts are sent |

### WhatsApp (Evolution API)

| Variable | Purpose |
|---|---|
| `EVOLUTION_API_URL` | Base URL of the Evolution API instance (e.g. `http://192.168.101.169:8080`) |
| `EVOLUTION_API_KEY` | Global API key for Evolution API auth |
| `EVOLUTION_INSTANCE_NAME` | The Evolution instance name for this n8n stack (e.g. `yaoc2`) |
| `WHATSAPP_PHONE` | The WhatsApp phone number tied to the Evolution instance |

### DeepSeek

| Variable | Purpose |
|---|---|
| `DEEPSEEK_API_KEY` | API key for DeepSeek inference (used by Brain AI Agent nodes) |

---

## Integration Pattern in Policy Gateway

The guard is inserted in the `needs-approval` branch of the Decision Route, immediately before the Telegram send node:

```
Decision Route (needs-approval)
  └─▶ Capability Guard — Telegram        [Execute Workflow]
        ├─▶ ok      → Telegram — Request Approval  [Telegram node]
        │               └─▶ Respond 202 Pending
        └─▶ missing → Log Guard Failure            [Postgres insert]
                        └─▶ Telegram — Operator Alert (Guard Failure)
```

The guard failure path still attempts a Telegram send (for the operator alert) — this is intentional. If Telegram is genuinely broken, that second send will also fail, but the audit log entry will have been written first, preserving the event record regardless.

---

## Antigravity Responsibilities

When modifying or extending the gateway, agents **must**:

1. **Preserve guard call sites** — never remove or bypass the `Capability Guard — Telegram` Execute Workflow node from the approval branch.
2. **Add new capability cases** for future channels — when adding Slack, Teams, email, or any new outbound channel:
   - Add the channel key and its `env` array + `instructions` string to the `CHECKS` object in `yaoc2-capability-guard-comms.json`.
   - Insert a corresponding guard call + Switch node before the new send node in the affected workflow.
   - Update this document with the new channel's required env vars.
3. **Never hard-code tokens** — all secrets must reference `$env.VARIABLE_NAME` and be seeded via `update-secrets.sh` from Infisical.
4. **Always write to `yaoc2.audit_log`** on guard failure — the log entry is the source of truth for debugging missing credentials in production.

---

## Testing the Guard

To test the guard in isolation without running the full gateway:

1. Open `[YAOC2] Capability Guard — Communications` in the n8n UI.
2. Click **Test workflow**.
3. Pass `{ "capability": "telegram" }` as input.
4. Confirm the response is `{"status": "ok", ...}` if env vars are set, or `{"status": "missing", ...}` if any are absent.

To simulate a guard failure end-to-end:
1. Temporarily unset `TELEGRAM_BOT_TOKEN` in the n8n environment.
2. Trigger a `needs-approval` decision through the Policy Gateway.
3. Confirm the audit log receives a `capability-missing` row and the operator alert fires (or fails gracefully if Telegram itself is down).
