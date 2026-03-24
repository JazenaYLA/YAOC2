# YAOC2 — Runtime Capability Onboarding

YAOC2 uses a **runtime capability guard** pattern: when a capability (channel, LLM provider, or external service) is first attempted and is not yet configured, the system detects it, alerts the operator with exact instructions, and optionally walks through interactive setup — rather than failing silently.

---

## How It Works

```
Policy Gateway wants to use capability X
  │
  ▼
[YAOC2] Capability Guard — Communications
  Checks env vars for X
  ├─ status: ok      → proceed normally
  └─ status: missing →
          ▼
    [YAOC2] Onboarding — Capability (Runtime Guard Handler)
      ├─ Log to yaoc2.audit_log (event_type: capability_missing)
      ├─ Alert operator via Telegram: exact missing vars + setup instructions
      └─ If onboarding_workflow set → Execute that named workflow
```

---

## Full CHECKS Registry

All capabilities live in **one place**: the `CHECKS` object in `yaoc2-capability-guard-comms.json`.

### Communications Channels

| Key | Required env vars | Onboarding workflow |
|---|---|---|
| `telegram` | `TELEGRAM_BOT_TOKEN`, `APPROVAL_CHAT_ID` | [YAOC2] Onboarding — Capability: Telegram |
| `whatsapp` | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`, `WHATSAPP_PHONE` | [YAOC2] Onboarding — Capability: WhatsApp |
| `slack` | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_DEFAULT_CHANNEL` | [YAOC2] Onboarding — Capability: Slack |

### Google Services

| Key | Required env vars | Notes |
|---|---|---|
| `google_ai` | `GOOGLE_AI_API_KEY` | Gemini models. Key from aistudio.google.com/apikey. |
| `gmail` | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth2 — complete OAuth flow in n8n Credentials after setting env vars. |
| `google_calendar` | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Same OAuth2 app as Gmail. Enable Calendar API separately. |

> **Note on Google OAuth:** env vars here serve as a *presence signal* only. The actual OAuth2 access tokens are stored in n8n's credential store, not in `/opt/n8n.env`. After setting the client ID/secret, you must complete the OAuth flow manually in n8n Settings → Credentials.

### LLM Providers

| Key | Required env vars | Covers |
|---|---|---|
| `openai-compat` | `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_KEY` | OpenAI, Groq, Mistral, OpenRouter, Ollama, LM Studio, LiteLLM, vLLM, Claude via proxy |
| `deepseek` | `DEEPSEEK_API_KEY` | DeepSeek native. Can also route via `openai-compat` with base URL `https://api.deepseek.com/v1`. |
| `anthropic_direct` | `ANTHROPIC_API_KEY` | Claude native API. Use `openai-compat` instead if routing via OpenRouter or LiteLLM. |

---

## Choosing: `openai-compat` vs `anthropic_direct`

| Scenario | Use |
|---|---|
| OpenAI, Groq, Mistral, Ollama, LM Studio, local models | `openai-compat` |
| Claude via OpenRouter or LiteLLM proxy | `openai-compat` (set base URL to router) |
| Claude via Anthropic's native API directly | `anthropic_direct` |
| DeepSeek via OpenAI-compatible endpoint | `openai-compat` |
| DeepSeek with its own dedicated key | `deepseek` |
| Gemini models | `google_ai` |

The `openai-compat` entry is intentionally broad: in n8n, create an OpenAI credential and override the **Base URL** field to `{{ $env.OPENAI_COMPAT_BASE_URL }}`. This single credential pattern supports dozens of providers without new credential types.

---

## Adding a New Capability

1. Add one entry to `CHECKS` in `yaoc2-capability-guard-comms.json`:

```javascript
discord: {
  env: ['DISCORD_BOT_TOKEN', 'DISCORD_DEFAULT_GUILD_ID'],
  instructions: 'Create a Discord bot at discord.com/developers. Enable Message Content Intent. Add to server with bot + applications.commands scope. Set DISCORD_BOT_TOKEN and DISCORD_DEFAULT_GUILD_ID in /opt/n8n.env.',
  onboarding_workflow: '[YAOC2] Onboarding — Capability: Discord'
}
```

2. Optionally create `n8n/gateway/workflows/yaoc2-onboarding-capability-discord.json`.
3. Nothing else changes. Guard logic, audit logging, and operator alerts are all automatic.

---

## Operator Alert Format

When a capability is missing, you receive a Telegram message:

```
⚠️ YAOC2 — Capability Not Configured

Capability: google_ai
Missing: GOOGLE_AI_API_KEY
Requested by: analyst@default
Context: brain_llm_call

What to do:
Get a Gemini API key at aistudio.google.com/apikey...

Once configured, the next request will proceed automatically.
```

The event is written to `yaoc2.audit_log` with `event_type: capability_missing`.

---

## Relationship to User Onboarding

This is **operator-facing** (you configuring a service). It is separate from **user-facing** onboarding (a new chat user registering their profile):

| System | Trigger | Handler |
|---|---|---|
| Capability Guard | Attempt to use unconfigured service | `yaoc2-onboarding-capability.json` → Telegram alert to operator |
| User Onboarding Router | Unknown user_id+channel in user_profiles | `yaoc2-onboarding-router.json` → channel-specific onboarding workflow |
| Telegram user onboarding | New Telegram user first message | `yaoc2-onboarding-telegram.json` |
| WhatsApp user onboarding | New WhatsApp number first message | `yaoc2-onboarding-whatsapp.json` |
