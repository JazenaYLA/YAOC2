# YAOC2 — Runtime Capability Onboarding

YAOC2 uses a **runtime capability guard** pattern inspired by OpenClaw's onboarding model, but applied dynamically: when a capability (channel, LLM provider, or external service) is first attempted and is not yet configured, the system detects it, alerts the operator, and optionally walks through interactive setup — rather than failing silently or requiring a pre-startup configuration wizard.

---

## How It Works

```
Policy Gateway wants to use capability X
  │
  ▼
[YAOC2] Capability Guard — Communications
  Checks env vars for X
  ├─ status: ok    → proceed normally
  └─ status: missing →
          ▼
    [YAOC2] Onboarding — Capability (Runtime Guard Handler)
      ├─ Log to yaoc2.audit_log
      ├─ Alert operator via Telegram with exact missing fields + instructions
      └─ If onboarding_workflow set → Execute it
```

---

## CHECKS Registry

All capabilities are declared in **one place only**: the `CHECKS` object inside `yaoc2-capability-guard-comms.json`.

| Capability key | Required env vars | Onboarding workflow |
|---|---|---|
| `telegram` | `TELEGRAM_BOT_TOKEN`, `APPROVAL_CHAT_ID` | [YAOC2] Onboarding — Capability: Telegram |
| `whatsapp` | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`, `WHATSAPP_PHONE` | [YAOC2] Onboarding — Capability: WhatsApp |
| `deepseek` | `DEEPSEEK_API_KEY` | [YAOC2] Onboarding — Capability: LLM Provider |
| `slack` | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_DEFAULT_CHANNEL` | [YAOC2] Onboarding — Capability: Slack |
| `openai-compat` | `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_KEY` | [YAOC2] Onboarding — Capability: LLM Provider |

---

## Adding a New Capability

1. **Add an entry to `CHECKS`** in `yaoc2-capability-guard-comms.json`:
```json
"discord": {
  "env": ["DISCORD_BOT_TOKEN", "DISCORD_DEFAULT_GUILD_ID"],
  "instructions": "Create a Discord bot at discord.com/developers, enable Message Content Intent, add to server. Set DISCORD_BOT_TOKEN and DISCORD_DEFAULT_GUILD_ID in /opt/n8n.env.",
  "onboarding_workflow": "[YAOC2] Onboarding — Capability: Discord"
}
```

2. **Optionally create** `n8n/gateway/workflows/yaoc2-onboarding-capability-discord.json` following the pattern of the existing capability onboarding workflows.

3. **That’s it.** The guard, audit log, and operator alert all work automatically. No changes to the policy gateway or brain.

---

## LLM Providers: Why No Template Needed

Most new LLM providers (Groq, Mistral, local Ollama, LM Studio, future DeepSeek versions) offer OpenAI-compatible endpoints. They slot directly into the `openai-compat` capability entry — only `OPENAI_COMPAT_BASE_URL` and `OPENAI_COMPAT_KEY` need to change. A new LLM only warrants a new CHECKS entry if it uses a fundamentally different API shape (e.g., a non-REST, non-OpenAI-compat protocol).

---

## Operator Alert Format

When a capability is missing, the operator receives a Telegram message:

```
⚠️ YAOC2 — Capability Not Configured

Capability: slack
Missing: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET
Requested by: user@tenant
Context: route_message action

What to do:
Create a Slack app at api.slack.com/apps...

Once configured, the next request will proceed automatically.
```

The event is also written to `yaoc2.audit_log` with `event_type: capability_missing` for audit trail and retrospective analysis.

---

## Relationship to User Onboarding

This is **operator-facing** onboarding (you configuring a service). It is distinct from **user-facing** onboarding (a new Telegram/WhatsApp user registering their profile), which is handled by:
- `yaoc2-onboarding-router.json` — first-contact detection
- `yaoc2-onboarding-telegram.json` — new Telegram user profile creation
- `yaoc2-onboarding-whatsapp.json` — new WhatsApp user profile creation
