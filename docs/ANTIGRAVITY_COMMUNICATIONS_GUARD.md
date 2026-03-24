# Antigravity Integration Notes — Communications Capability Guard

This document is the **enterprise Threat Intel branch integration guide** for the
YAOC2 communications capability guard system. It tells Antigravity (and any human
engineer) exactly what the guard is, where it lives, what it enforces, and how to
extend it safely for enterprise-specific channels.

**Last updated:** 2026-03-24  
**Guard version:** `2026.03.3` (9-capability registry)

---

## What the Guard Does

Before any YAOC2 workflow sends a message or calls an LLM, it calls
`[YAOC2] Capability Guard — Communications` via Execute Workflow. The guard:

1. Checks that all required env vars for the requested capability are present and non-empty.
2. Returns `{status: 'ok'}` if everything is configured.
3. Returns `{status: 'missing', missingFields: [], instructions: '', onboarding_workflow: ''}` if anything is absent.
4. **Never throws an error.** A missing capability is a handled state, not a failure.

On `missing`, the calling workflow routes to `[YAOC2] Onboarding — Capability (Runtime Guard Handler)`, which:
- Logs to `yaoc2.audit_log` with `event_type: capability_missing`
- Sends the operator a Telegram alert with exact missing vars and setup instructions
- Optionally triggers a named onboarding sub-workflow for that capability

---

## File Locations

| File | Purpose |
|---|---|
| `n8n/gateway/workflows/yaoc2-capability-guard-comms.json` | Guard — CHECKS registry + guard logic |
| `n8n/gateway/workflows/yaoc2-onboarding-capability.json` | Runtime handler for `status:missing` |
| `n8n/gateway/workflows/yaoc2-onboarding-router.json` | User onboarding router (first-contact detection) |
| `n8n/gateway/workflows/yaoc2-onboarding-telegram.json` | New Telegram user profile creation |
| `n8n/gateway/workflows/yaoc2-onboarding-whatsapp.json` | New WhatsApp user profile creation |
| `docs/CAPABILITY_ONBOARDING.md` | Full pattern documentation + CHECKS table |

---

## Current CHECKS Registry (v2026.03.3)

### Communications Channels

| Capability key | Required env vars | Alert channel |
|---|---|---|
| `telegram` | `TELEGRAM_BOT_TOKEN`, `APPROVAL_CHAT_ID` | — (this IS the alert channel; must always be set) |
| `whatsapp` | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`, `WHATSAPP_PHONE` | Telegram |
| `slack` | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_DEFAULT_CHANNEL` | Telegram |

### Google Services

| Capability key | Required env vars | Notes |
|---|---|---|
| `google_ai` | `GOOGLE_AI_API_KEY` | Gemini models. Key from aistudio.google.com. |
| `gmail` | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth tokens stored in n8n credential store, not env. |
| `google_calendar` | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Same OAuth app as Gmail; enable Calendar API separately. |

### LLM Providers

| Capability key | Required env vars | Covers |
|---|---|---|
| `openai-compat` | `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_KEY` | OpenAI, Groq, Mistral, OpenRouter, Ollama, LM Studio, LiteLLM, vLLM, Claude via proxy |
| `deepseek` | `DEEPSEEK_API_KEY` | DeepSeek native. Can also route via `openai-compat`. |
| `anthropic_direct` | `ANTHROPIC_API_KEY` | Claude native API. Use `openai-compat` for Claude via proxy. |

---

## Mandatory Antigravity Requirements

### On initial deployment (run from ANTIGRAVITY_RECONFIGURE.md Step 6b)

1. Import `yaoc2-onboarding-capability.json` **before** `yaoc2-capability-guard-comms.json`.
2. Import `yaoc2-capability-guard-comms.json` **before** `yaoc2-policy-gateway.json` is activated.
3. Verify `TELEGRAM_BOT_TOKEN` and `APPROVAL_CHAT_ID` are set in the gateway `.env` —
   Telegram is the fallback alert channel and **must always be configured**.
4. For each capability in scope at launch, verify its env vars are present (see table above).

### On reconfiguration

1. Do **not** remove the Execute Workflow nodes in `yaoc2-policy-gateway` that call the guard.
2. Do **not** bypass the guard by hard-coding credentials or skipping the guard call.
3. Do **not** modify the guard logic block (below the `CHECKS` object in the Code node).
4. If a capability env var changes (e.g., new `TELEGRAM_BOT_TOKEN`), update `/opt/n8n.env`
   and restart n8n (or reload env if using Infisical dynamic injection). No workflow changes needed.
5. If a capability is deliberately removed from scope, remove its env vars from `.env` —
   the guard will automatically return `missing` for it and alert you, which is the correct
   behavior and confirms the removal propagated.

---

## Enterprise Extension Rules

The enterprise Threat Intel branch may need additional capabilities not in the base registry
(e.g., Microsoft Teams, PagerDuty, Jira, email SMTP, custom threat intel feeds).

**Rule: Add to CHECKS only. Never modify guard logic.**

To add a new capability:

```javascript
// In yaoc2-capability-guard-comms.json, CHECKS object only:
teams: {
  env: ['TEAMS_WEBHOOK_URL'],
  instructions: 'Create an Incoming Webhook connector in your Teams channel. Set TEAMS_WEBHOOK_URL in /opt/n8n.env.',
  onboarding_workflow: '[YAOC2] Onboarding — Capability: Teams'
}
```

Then optionally create `yaoc2-onboarding-capability-teams.json` following the existing
onboarding workflow pattern. No other files need changing.

**Do not fork the guard workflow.** Enterprise branches should extend the `CHECKS` object
in the shared `yaoc2-capability-guard-comms.json` and submit the addition upstream so all
branches benefit from the new capability definition.

---

## Boundary with n8n-unified

The capability guard lives entirely in the **YAOC2 gateway n8n instance**. It does not run
in `n8n-unified` (the multi-channel router for direct chat use cases).

| System | Guard? | Notes |
|---|---|---|
| `yaoc2-gateway` n8n | ✅ Yes — mandatory | All outbound sends and LLM calls go through guard |
| `n8n-unified` | ❌ No | Telegram + WhatsApp are already wired there; guard pattern not yet applied |

For enterprise deployments where `n8n-unified` is also used for agentic workflows,
consider applying the same guard pattern to the `multi-channel-router` workflow. The
CHECKS registry and onboarding handler are reusable as-is — just import the two
workflows into the `n8n-unified` instance and call the guard before outbound nodes.

---

## Audit Trail

Every `status:missing` event is written to `yaoc2.audit_log`:

```sql
SELECT event_type, capability, detail, created_at
FROM yaoc2.audit_log
WHERE event_type = 'capability_missing'
ORDER BY created_at DESC
LIMIT 20;
```

This gives the Threat Intel team a retrospective view of which capabilities were
attempted but unconfigured, who requested them, and when — useful for both
capacity planning and security audit.
