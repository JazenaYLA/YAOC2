# YAOC2 – Yet Another OpenClaw Clone

YAOC2 is a self-hosted, **policy-aware** OpenClaw-style agent framework built on n8n, Flowise and Shuffle,
designed for CTI and SOC homelabs running on Proxmox VE.

Instead of a single monolithic agent that directly touches all your tools, YAOC2 separates the
**brain** (reasoning, skills, memory) from the **hands** (execution, SOAR), with a NemoClaw-style
policy gateway in between.

- **Brain**: YAOC2 brain workflows imported into your existing n8n LXC (set up via [n8n-ecosystem-unified](https://github.com/JazenaYLA/n8n-ecosystem-unified)).
- **Gateway**: A lightweight Dockge stack (`yaoc2-gateway`) deployed inside the existing `lxc-dockge-cti`, sharing `cti-net` and `infra-postgres` with all other CTI services.
- **Execution**: Sandbox workflows inside the gateway call MISP, OpenCTI, TheHive, Shuffle, XTM etc. directly over Docker network — zero inter-LXC hops.

---

## Prerequisites

| Requirement | Repo |
|---|---|
| Proxmox VE CTI service stack | [threatlabs-cti-stack](https://github.com/JazenaYLA/threatlabs-cti-stack) |
| n8n LXC (systemd, Postgres-backed) | [n8n-ecosystem-unified](https://github.com/JazenaYLA/n8n-ecosystem-unified) |
| `infra-postgres` running `pgvector/pgvector:pg17` | threatlabs-cti-stack `infra/` stack |

---

## Architecture

```
[User / Channel — Telegram, Discord, Web]
        │
        ▼
┌────────────────────────────────┐
│  lxc-n8n  (existing)           │  systemd n8n  :5678
│  YAOC2 Brain workflows         │  set up by n8n-ecosystem-unified
│  Memory → infra-postgres       │  NO direct access to CTI services
└────────────────┬───────────────┘
                 │  ProposedAction JSON  (HTTP POST)
                 ▼
┌────────────────────────────────────────────────────────┐
│  lxc-dockge-cti  (existing)                            │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │  yaoc2-gateway  Dockge stack  :5679              │  │
│  │  n8n gateway + policy engine                    │  │
│  │  audit log → infra-postgres (yaoc2 schema)      │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │  validated, policy-approved   │
│                         ▼                               │
│  infra-postgres · infra-valkey · cti-net               │
│  misp · opencti · thehive · dfir-iris                  │
│  xtm · shuffle · flowintel · lacus · ail               │
└────────────────────────────────────────────────────────┘
```

**Resource delta to add YAOC2:** ~400 MB RAM inside existing dockge-cti LXC. Zero new LXC containers.

---

## Architecture Overview

YAOC2 is a **policy-governed CTI bridge** that connects chat channels (Telegram, WhatsApp) and AI
agents to internal threat-intel tooling (MISP, OpenCTI, TheHive, Cortex) via a hardened gateway.
It assumes a separate AI platform repo (`n8n-ecosystem-unified`) that provides generic model routing
and agent workflows.

### Layered Design

**1. Ingress & Edge Security (Gateway n8n)**

Terminates all public webhooks. Authenticates, filters, and normalises traffic before it reaches the Brain.

Gateway workflows (`n8n/gateway/workflows/`):
- `tg-receptionist.json` – Telegram Receptionist: Bot API webhook → internal HTTP POST with `X-Gateway-Secret`.
- `wa-receptionist.json` – WhatsApp Receptionist: Evolution API `messages.upsert` → internal HTTP POST.
- `heartbeat.json` – Polls `ngrok:4040`, updates Telegram/WhatsApp webhooks on tunnel restart, and works around n8n "Ghost 404" webhook deregistration issues.

**2. Policy & Execution Layer (Gateway n8n)**

Enforces who can do what, where, and at which risk level. Maps high-level actions from the Brain into
sandboxed CTI workflows.

Gateway workflows (`n8n/gateway/workflows/`):
- `policy-gateway.json` – Receives `ProposedAction` objects, validates schema, loads a policy set from
  Postgres, evaluates rules, triggers human approval where required, and writes full audit records to
  `yaoc2.audit_log`.
- `sandbox-misp-enrich.json` – MISP attribute search → Cortex analyser → OpenCTI observable push.
- `sandbox-opencti.json` – STIX bundle import / object lookup in OpenCTI.
- `sandbox-thehive.json` – TheHive case creation with observables and tasks.

**3. Reasoning Platform (Brain n8n — separate repo)**

Lives in `n8n-ecosystem-unified` and runs on a separate n8n instance (LXC "Brain").

Provides:
- Multi-channel normalisation and response routing.
- Tiered model router (Haiku / Sonnet / Opus) with shared memory and MCP tools.
- Generic agents (e.g., Gmail Email Manager).

The Brain only talks to YAOC2 via:
- Internal HTTP from Receptionists using `X-Gateway-Secret`.
- MCP tools exposed by the Gateway (for CTI sandboxes), authenticated with `Bearer $GATEWAY_MCP_TOKEN`.

### Integration Contract

**Gateway → Brain message envelope**

Receptionists forward a normalised object:

```json
{
  "userMessage": "string",
  "chatId": "string",
  "userId": "string",
  "source": "telegram|whatsapp|discord|slack",
  "metadata": {
    "raw": { "...": "..." }
  }
}
```

**Brain → YAOC2 `ProposedAction`**

When the Brain wants to perform a CTI action it submits a `ProposedAction` JSON to the Policy Gateway
webhook. Minimum required fields:

```json
{
  "id": "<uuid-v4>",
  "timestamp": "<ISO8601>",
  "agent": { "name": "tiered-model-router", "version": "1.1.0" },
  "requester": {
    "user_id": "string",
    "channel": "telegram|whatsapp|web|api",
    "tenant": "string",
    "display_name": "string"
  },
  "intent": {
    "title": "IOC enrichment",
    "summary": "Enrich 1.1.1.1 in MISP and OpenCTI"
  },
  "action": {
    "type": "workflow|http_call|shell|external_soar",
    "name": "ioc_enrichment_misp_opencti",
    "target_system": "yaoc2-sandbox",
    "mode": "read-only|read-write|admin",
    "parameters": { "...": "..." }
  },
  "risk": { "level": "low|medium|high|critical" },
  "policy": { "policy_set": "default" },
  "llm_explanation": "why this action was proposed"
}
```

**YAOC2 → CTI Tools**

Only YAOC2 sandbox workflows call MISP, OpenCTI, TheHive, etc. The Brain never talks to those
systems directly.

**Brain ↔ YAOC2 MCP tools**

The Brain's agents call YAOC2-controlled CTI tools only via MCP:
- MCP endpoint: `https://gateway.lab.threatresearcher.net/rest/mcp/sse`
- Auth: `Authorization: Bearer {{ $env.GATEWAY_MCP_TOKEN }}` — store in `/opt/n8n.env` on the Brain LXC, rotate via Infisical.
- MCP tools represent virtual actions (`misp_enrich`, `opencti_sync`, etc.); the actual implementations live as sandbox workflows in this repo.

---

## Repository Layout

```text
yaoc2/
  README.md
  .env.example
  .gitignore

  docs/
    architecture.md
    networking.md
    policies.md
    threat-model.md

  infra/
    proxmox/
      lxc-yaoc2-brain.conf.example   # reference only — brain reuses existing n8n LXC
    dockge/
      yaoc2-gateway/
        docker-compose.yml           # drop into dockge-cti alongside other stacks
        .env.example
    migrations/
      000_yaoc2_schema.sql           # run against infra-postgres

  n8n/
    brain/
      workflows/
        yaoc2-brain-openclaw.json
      mcp-templates/
        README.md
    gateway/
      workflows/
        yaoc2-policy-gateway.json
        yaoc2-sandbox-misp-enrich.json
        yaoc2-sandbox-opencti-sync.json
        yaoc2-sandbox-thehive-case.json
        tg-receptionist.json
        wa-receptionist.json
        heartbeat.json
      code/
        validate-schema.js           # Code node — schema validation
        evaluate-policy.js           # Code node — policy evaluation
        build-proposed-action.js     # Code node — brain side
        map-to-sandbox.js            # Code node — action → workflow dispatch
        normalise-response.js        # Code node — result normalisation

  policies/
    policy-sets/
      default-threatlab.yaml
      lab-highrisk.yaml

  tools/
    flowise/
      example-flows.md
    shuffle/
      playbooks.md
      misp-enrich-opencti-sync.yaml

  examples/
    proposed-action-misp-enrich.json
    proposed-action-thehive-case.json
```

---

## Quick Start

1. **Ensure prerequisites** — threatlabs-cti-stack running, n8n-ecosystem-unified installed.
2. **Upgrade infra-postgres** to `pgvector/pgvector:pg17` (non-alpine) if not already done — see `infra/` notes below.
3. **Run DB migration** on dockge-cti LXC:
   ```bash
   docker exec -i infra-postgres psql -U postgres < infra/migrations/000_yaoc2_schema.sql
   ```
4. **Deploy gateway Dockge stack** — copy `infra/dockge/yaoc2-gateway/` into dockge-cti LXC and add via Dockge UI.
5. **Import brain workflows** — import `n8n/brain/workflows/yaoc2-brain-openclaw.json` into your existing n8n LXC.
6. **Import gateway workflows** — import `n8n/gateway/workflows/*.json` into the gateway n8n instance.
7. **Set credentials** — add MISP, OpenCTI, TheHive, Shuffle, Flowise, XTM, Telegram credentials in the gateway n8n.

See `docs/architecture.md` for the full walkthrough.

---

## infra-postgres: Alpine → Full Image

The `infra/` stack in threatlabs-cti-stack is being upgraded from `postgres:17-alpine` to
`pgvector/pgvector:pg17` (full Debian-based image with pgvector extension).

This gives YAOC2 (and n8n-ecosystem-unified) access to:
- `pgvector` — vector similarity search for n8n AI memory nodes.
- Full `pg_stat_statements`, logical replication, and extension support not available in Alpine builds.
- Consistent behaviour with upstream PostgreSQL packages.

See `infra/migrations/000_yaoc2_schema.sql` for the YAOC2-specific schema that runs on top of this.

---

## Credits

- [freddy-schuetz/n8n-claw](https://github.com/freddy-schuetz/n8n-claw) — n8n OpenClaw implementation that forms the basis of the brain layer.
- [NVIDIA NemoClaw](https://github.com/NVIDIA/NemoClaw) — inspiration for the policy gateway and sandbox execution model.
- [openclaw/openclaw](https://github.com/openclaw/openclaw) — original OpenClaw agent framework.
- [Shuffle SOAR](https://github.com/Shuffle/Shuffle) — SOAR execution layer.
- [threatlabs-cti-stack](https://github.com/JazenaYLA/threatlabs-cti-stack) — CTI platform this is designed to extend.
- [n8n-ecosystem-unified](https://github.com/JazenaYLA/n8n-ecosystem-unified) — n8n platform layer (install, DB, Caddy, base workflows).

---

## License

MIT
