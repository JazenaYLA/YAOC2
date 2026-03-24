# Antigravity Reconfiguration Guide — YAOC2

This document is the **instruction set for Antigravity (or any AI coding agent)**
to deploy or reconfigure all YAOC2 components from scratch or after a reset.

**Last updated:** 2026-03-24  
**Status:** Ready to execute after infra-postgres pgvector migration

---

## Context

YAOC2 has two deployment targets:

| Component | Host | Install model |
|---|---|---|
| Brain workflows (`[YAOC2] Brain — *`) | **lxc-n8n** — existing systemd n8n LXC | Import JSON into existing n8n instance |
| Policy Gateway (`yaoc2-gateway`) | **lxc-dockge-cti** — inside existing Dockge | Dockge stack, Docker Compose |
| infra-postgres (shared DB) | **lxc-dockge-cti** — inside infra Dockge stack | Already running, image upgraded to pgvector |

There is **no new LXC**. The brain runs inside the existing `lxc-n8n`.

---

## Pre-flight Checks

```bash
# 1. pgvector image is running on dockge-cti
ssh dockge-cti "docker exec infra-postgres psql -U postgres -c 'SELECT extversion FROM pg_extension WHERE extname = '\''vector'\'''"
# Expected: a version string. If error: run Step 1 below.

# 2. n8n LXC can reach infra-postgres
ssh lxc-n8n "nc -zv <DOCKGE_CTI_IP> 5432"
# Expected: Connection succeeded

# 3. n8n is currently running
ssh lxc-n8n "systemctl is-active n8n"
# Expected: active

# 4. YAOC2 repo is cloned or accessible
ssh dockge-cti "test -d /tmp/yaoc2 || git clone https://github.com/JazenaYLA/YAOC2.git /tmp/yaoc2"
```

---

## Step 1 — Upgrade infra-postgres to pgvector (if not done)

The `threatlabs-cti-stack` infra compose already has `pgvector/pgvector:pg17`.
If the running container is still on `postgres:17-alpine`:

```bash
ssh dockge-cti
cd /opt/stacks/infra
docker compose pull postgres
docker compose up -d postgres

# Verify
docker exec infra-postgres psql -U postgres -c \
  'CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname = '"'"'vector'"'"';'
```

---

## Step 2 — Run YAOC2 Schema Migration

From the **dockge-cti LXC**:

```bash
git clone https://github.com/JazenaYLA/YAOC2.git /tmp/yaoc2 2>/dev/null || \
  git -C /tmp/yaoc2 pull

docker exec -i infra-postgres psql -U postgres \
  < /tmp/yaoc2/infra/migrations/000_yaoc2_schema.sql

# Verify
docker exec infra-postgres psql -U postgres -c '\dt yaoc2.*'
# Expected: audit_log, conversation_memory, policy_sets

docker exec infra-postgres psql -U postgres -c \
  "SELECT name, version FROM yaoc2.policy_sets;"
# Expected: default-threatlab | 2026.03.1
```

---

## Step 3 — Deploy yaoc2-gateway Dockge Stack

From the **dockge-cti LXC**:

```bash
# Copy gateway stack files into Dockge stacks directory
mkdir -p /opt/stacks/yaoc2-gateway
cp /tmp/yaoc2/infra/dockge/yaoc2-gateway/docker-compose.yml /opt/stacks/yaoc2-gateway/
cp /tmp/yaoc2/infra/dockge/yaoc2-gateway/.env.example /opt/stacks/yaoc2-gateway/.env

# Populate .env — Antigravity must read from infra/.env and substitute:
INFRA_ENV=/opt/stacks/infra/.env
POSTGRES_ROOT_USER=$(grep POSTGRES_ROOT_USER $INFRA_ENV | cut -d= -f2)
POSTGRES_ROOT_PASSWORD=$(grep POSTGRES_ROOT_PASSWORD $INFRA_ENV | cut -d= -f2)
OPENCLAW_DB_PASSWORD=$(grep OPENCLAW_DB_PASSWORD $INFRA_ENV | cut -d= -f2)

# Generate gateway webhook secret
GATEWAY_SECRET=$(openssl rand -hex 32)

# Write final .env (Antigravity substitutes all <PLACEHOLDER> values)
# Mandatory fields to fill in .env:
# N8N_ENCRYPTION_KEY   — generate: openssl rand -hex 32
# GATEWAY_WEBHOOK_SECRET — $GATEWAY_SECRET (also needed on n8n LXC)
# POSTGRES_ROOT_PASSWORD — from infra/.env
# OPENCLAW_DB_PASSWORD   — from infra/.env
# TELEGRAM_BOT_TOKEN     — from enterprise secrets / Infisical
# APPROVAL_CHAT_ID       — from enterprise secrets / Infisical
# All CTI URLs           — use Docker container names (e.g. http://misp)

# Bring up the stack
docker compose -f /opt/stacks/yaoc2-gateway/docker-compose.yml up -d

# Verify
docker ps | grep yaoc2-gateway
curl -s http://localhost:5679/healthz
# Expected: {"status":"ok"}
```

---

## Step 4 — Configure n8n LXC for YAOC2 (brain)

From the **n8n LXC** (or via SSH):

```bash
# Append YAOC2-specific vars to /opt/n8n.env
# Antigravity: only append if keys don't already exist
cat >> /opt/n8n.env << EOF

# ── YAOC2 Brain ───────────────────────────────────────────────
GATEWAY_WEBHOOK_URL=https://n8n-gateway.lab.local
GATEWAY_WEBHOOK_SECRET=<same value as GATEWAY_WEBHOOK_SECRET in gateway .env>
APPROVAL_CHAT_ID=<telegram analyst chat ID>
EOF

systemctl daemon-reload
systemctl restart n8n
journalctl -u n8n -f
# Wait for: "n8n ready on 0.0.0.0, port 5678"
```

> **Note:** If n8n is not yet migrated to Postgres, complete
> `n8n-ecosystem-unified/SETUP_CHECKLIST.md` Phases 1–3 first,
> then come back here.

---

## Step 5 — Import Workflows into n8n (brain LXC)

Antigravity can use the n8n API to import workflows programmatically.
Obtain the n8n API key first:

```bash
# n8n UI → Settings → API → Create API key
# Store in Infisical as: N8N_API_KEY
N8N_API_KEY=<from Infisical or n8n UI>
N8N_URL=https://n8n.lab.local
```

Import order (sub-workflows before callers):

```bash
# 1. UNIFIED workflows first
for wf in \
  tiered-model-router.json \
  multi-channel-router.json \
  email-manager.json; do
  curl -s -X POST "$N8N_URL/api/v1/workflows" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" \
    -d @/tmp/n8n-unified/workflows/unified/$wf
  echo "Imported: $wf"
done

# 2. YAOC2 brain workflow
curl -s -X POST "$N8N_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/yaoc2/n8n/brain/workflows/yaoc2-brain-openclaw.json
echo "Imported: yaoc2-brain-openclaw.json"
```

---

## Step 6 — Import Workflows into Gateway n8n

```bash
GATEWAY_API_KEY=<from gateway n8n UI → Settings → API>
GATEWAY_URL=https://n8n-gateway.lab.local

# Sandbox workflows first (gateway calls them by name)
for wf in \
  sandbox-misp-enrich.json \
  sandbox-opencti-sync.json \
  sandbox-thehive-case.json; do
  curl -s -X POST "$GATEWAY_URL/api/v1/workflows" \
    -H "X-N8N-API-KEY: $GATEWAY_API_KEY" \
    -H "Content-Type: application/json" \
    -d @/tmp/yaoc2/n8n/gateway/workflows/$wf
  echo "Imported: $wf"
done

# Gateway workflow last
curl -s -X POST "$GATEWAY_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/yaoc2/n8n/gateway/workflows/yaoc2-policy-gateway.json
echo "Imported: yaoc2-policy-gateway.json"
```

---

## Step 6b — Import Communications Capability Guard Workflows (Gateway n8n)

> **Why this step exists:** The capability guard is a mandatory pre-flight sub-workflow
> called by `yaoc2-policy-gateway` before any outbound send or LLM call. It must be
> imported and active **before** the gateway workflow is activated. If it is missing,
> every gateway execution that routes through a guarded capability will fail.

Import in this order (guard handler before guard itself, both before policy gateway):

```bash
# 1. Runtime onboarding handler (called when guard returns 'missing')
curl -s -X POST "$GATEWAY_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/yaoc2/n8n/gateway/workflows/yaoc2-onboarding-capability.json
echo "Imported: yaoc2-onboarding-capability.json"

# 2. Capability guard (the CHECKS registry)
curl -s -X POST "$GATEWAY_URL/api/v1/workflows" \
  -H "X-N8N-API-KEY: $GATEWAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/yaoc2/n8n/gateway/workflows/yaoc2-capability-guard-comms.json
echo "Imported: yaoc2-capability-guard-comms.json"

# 3. User onboarding router + channel-specific onboarding workflows
for wf in \
  yaoc2-onboarding-router.json \
  yaoc2-onboarding-telegram.json \
  yaoc2-onboarding-whatsapp.json; do
  curl -s -X POST "$GATEWAY_URL/api/v1/workflows" \
    -H "X-N8N-API-KEY: $GATEWAY_API_KEY" \
    -H "Content-Type: application/json" \
    -d @/tmp/yaoc2/n8n/gateway/workflows/$wf
  echo "Imported: $wf"
done
```

### Verify guard env vars are set on the gateway n8n instance

Before activating, check that the gateway `.env` contains at minimum the
**core communication vars** (Telegram is the fallback alert channel — it must
be set even if WhatsApp/Slack/Google are not yet configured):

```bash
grep -E 'TELEGRAM_BOT_TOKEN|APPROVAL_CHAT_ID' /opt/stacks/yaoc2-gateway/.env
# Both must be non-empty. If missing, add them before proceeding.
```

For each additional capability you intend to use at launch, also verify:

| Capability | Required env vars |
|---|---|
| `whatsapp` | `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_NAME`, `WHATSAPP_PHONE` |
| `slack` | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_DEFAULT_CHANNEL` |
| `google_ai` | `GOOGLE_AI_API_KEY` |
| `gmail` / `google_calendar` | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` |
| `openai-compat` | `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `anthropic_direct` | `ANTHROPIC_API_KEY` |

> **If a capability env var is missing at runtime:** The guard will return
> `{status: 'missing'}`, log the event to `yaoc2.audit_log`, and send you a
> Telegram alert with exact missing fields and setup instructions. The gateway
> will not attempt to use that capability. This is expected behavior —
> capabilities can be added incrementally without redeployment.

---

## Step 7 — Activate Workflows

```bash
# Activate all imported workflows via API
for URL in $N8N_URL $GATEWAY_URL; do
  API_KEY=$([ "$URL" = "$N8N_URL" ] && echo $N8N_API_KEY || echo $GATEWAY_API_KEY)
  WORKFLOWS=$(curl -s "$URL/api/v1/workflows" -H "X-N8N-API-KEY: $API_KEY" | \
    python3 -c "import sys,json; [print(w['id']) for w in json.load(sys.stdin)['data'] if not w['active']]")
  for WF_ID in $WORKFLOWS; do
    curl -s -X PATCH "$URL/api/v1/workflows/$WF_ID" \
      -H "X-N8N-API-KEY: $API_KEY" \
      -H "Content-Type: application/json" \
      -d '{"active": true}'
    echo "Activated workflow: $WF_ID on $URL"
  done
done
```

---

## Step 8 — End-to-End Smoke Test

```bash
# Send a test ProposedAction to the gateway directly
curl -s -X POST https://n8n-gateway.lab.local/webhook/proposed-action \
  -H "Authorization: Bearer $GATEWAY_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "00000000-0000-0000-0000-000000000001",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "agent": { "name": "test-agent", "version": "smoke-test", "session_id": "smoke-001" },
    "requester": { "user_id": "tester", "display_name": "Smoke Test", "channel": "api", "tenant": "threatlabs" },
    "intent": { "title": "Smoke test", "description": "Verify gateway is alive" },
    "action": { "type": "workflow", "name": "misp_search", "target_system": "misp", "mode": "read-only", "parameters": { "ioc": "1.2.3.4" } },
    "risk": { "level": "low", "reasons": [] },
    "policy": { "policy_set": "default-threatlab" }
  }'
# Expected: { "final_status": "executed", ... } or { "status": "pending-approval", ... }
```

Also smoke test the capability guard directly:

```bash
# Test guard with a known-missing capability (should return status:missing, not error)
curl -s -X POST https://n8n-gateway.lab.local/webhook/test \
  -H "Content-Type: application/json" \
  -d '{"capability": "slack"}'
# If SLACK_BOT_TOKEN is not set:
# Expected: { "status": "missing", "capability": "slack", "missingFields": [...], "instructions": "..." }
# A clean missing response means the guard is working correctly.
```

---

## Antigravity Task Summary

When asked to deploy or reconfigure YAOC2, Antigravity should:

1. Run pre-flight checks (Step 0)
2. Upgrade infra-postgres image if still on alpine (Step 1)
3. Run YAOC2 schema migration from dockge-cti (Step 2)
4. Deploy `yaoc2-gateway` Dockge stack, populating `.env` from infra secrets (Step 3)
5. Append YAOC2 env vars to `/opt/n8n.env` on n8n LXC, restart n8n (Step 4)
6. Import UNIFIED + brain workflows into n8n via API in correct order (Step 5)
7. Import sandbox + gateway workflows into gateway n8n via API in correct order (Step 6)
8. **Import capability guard + onboarding workflows into gateway n8n (Step 6b) — before activating gateway**
9. Verify `TELEGRAM_BOT_TOKEN` and `APPROVAL_CHAT_ID` are set; check other capability env vars per launch scope (Step 6b table)
10. Activate all workflows (Step 7)
11. Run smoke test against gateway webhook + capability guard (Step 8)
12. Report: gateway URL, brain URL, any errors, workflow IDs activated, any capabilities reporting `status:missing`

**Do NOT:**
- Create a new LXC for the brain — it runs in the existing `lxc-n8n`
- Install Docker on `lxc-n8n` — it uses native systemd n8n
- Modify `/etc/systemd/system/n8n.service` — only append to `/opt/n8n.env`
- Run migrations twice — all SQL files are idempotent (`IF NOT EXISTS`) but check first
- Commit real IPs, passwords, or API keys to any public repo
- Activate the gateway workflow before sandbox workflows exist — order matters
- **Activate the gateway workflow before `yaoc2-capability-guard-comms` and `yaoc2-onboarding-capability` are imported — the gateway calls them by name**
- **Remove or bypass the capability guard nodes in `yaoc2-policy-gateway` — they are mandatory and not optional wiring**
- **Hard-code fallback credentials or skip the guard for “already configured” capabilities — the guard is the source of truth for configuration state**
- **Modify the guard’s logic block — only add new entries to the `CHECKS` registry object at the top of the Code node**
