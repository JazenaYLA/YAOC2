# Architecture

## Overview

YAOC2 uses **zero new LXC containers**. It deploys as:

1. Brain workflows — imported into the existing `lxc-n8n` (managed by n8n-ecosystem-unified).
2. Gateway Dockge stack — deployed inside the existing `lxc-dockge-cti` alongside all other CTI stacks.

```
[User / Channel]
      │
      ▼
┌─────────────────────────────────┐
│  lxc-n8n  (existing)            │  systemd n8n :5678
│  YAOC2 Brain                    │  n8n-ecosystem-unified manages this LXC
│                                 │
│  Trigger → Load Memory          │
│  → LLM Reason                   │
│  → Build ProposedAction         │
│  → POST to gateway :5679        │
│  → Handle response              │
│  → Save Memory                  │
│  → Reply to user                │
│                                 │
│  Memory DB: infra-postgres      │  shared with dockge-cti over cti-net
└───────────────┬─────────────────┘
                │  ProposedAction JSON
                │  POST https://infra-postgres-host:5679/webhook/proposed-action
                │  Authorization: Bearer <GATEWAY_WEBHOOK_SECRET>
                ▼
┌──────────────────────────────────────────────────────────────┐
│  lxc-dockge-cti  (existing)                                  │
│                                                              │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  yaoc2-gateway  (new Dockge stack)  :5679             │   │
│  │                                                       │   │
│  │  1.  Webhook entry                                    │   │
│  │  2.  validate-schema.js    ← real JS code             │   │
│  │  3.  Load policies (infra-postgres)                   │   │
│  │  4.  evaluate-policy.js    ← real JS code             │   │
│  │  5.  Route: allow / deny / needs-approval             │   │
│  │  6.  [approval] Telegram notify + callback            │   │
│  │  7.  map-to-sandbox.js     ← real JS code             │   │
│  │  8.  Execute sandbox workflow                         │   │
│  │  9.  normalise-response.js ← real JS code             │   │
│  │  10. Respond to brain                                 │   │
│  │                                                       │   │
│  │  Audit log → infra-postgres (yaoc2.audit_log)         │   │
│  └──────────────────────┬────────────────────────────────┘   │
│                         │  validated calls on cti-net         │
│                         ▼                                     │
│  infra-postgres (pgvector/pgvector:pg17)                     │
│  infra-valkey                                                │
│  misp · opencti/xtm · thehive · dfir-iris                   │
│  shuffle · flowintel · lacus · ail-project                  │
└──────────────────────────────────────────────────────────────┘
```

---

## infra-postgres Image Upgrade

The infra stack is upgrading from `postgres:17-alpine` to `pgvector/pgvector:pg17`.

| | postgres:17-alpine | pgvector/pgvector:pg17 |
|---|---|---|
| Base | Alpine (musl libc) | Debian (glibc) |
| pgvector | ✗ | ✓ |
| pg_stat_statements | Limited | Full |
| Extension support | Minimal | Full upstream |
| Image size | ~80 MB | ~180 MB |
| Used by n8n AI memory | ✗ | ✓ |

All existing databases (n8n, opencti, thehive, flowintel etc.) are preserved on volume — only the
container image changes. Run `docker compose pull && docker compose up -d postgres` in the `infra/`
directory on dockge-cti to apply.

---

## Gateway Code Nodes

All five Code nodes have real JavaScript implementations in `n8n/gateway/code/`.
The files are imported directly into the n8n Code node "JS" field.

| File | Node | Purpose |
|---|---|---|
| `validate-schema.js` | Validate Schema | Checks required fields, strips unknowns, sets valid/errors |
| `evaluate-policy.js` | Evaluate Policy | Matches rules, returns allow/deny/needs-approval |
| `build-proposed-action.js` | Build ProposedAction (brain) | Constructs ProposedAction from LLM output |
| `map-to-sandbox.js` | Map to Sandbox | Resolves action name → sandbox workflow ID |
| `normalise-response.js` | Normalise Response | Builds standard result object, writes audit log |

---

## Installation Walkthrough

### 1. Upgrade infra-postgres (on dockge-cti LXC)

```bash
# Edit threatlabs-cti-stack/infra/docker-compose.yml
# Change:  image: postgres:17-alpine
# To:      image: pgvector/pgvector:pg17

cd /path/to/threatlabs-cti-stack/infra
docker compose pull postgres
docker compose up -d postgres
# Data volume is preserved — only image changes
```

### 2. Run YAOC2 DB migration (on dockge-cti LXC)

```bash
docker exec -i infra-postgres psql -U postgres \
  < /path/to/YAOC2/infra/migrations/000_yaoc2_schema.sql
```

### 3. Deploy gateway Dockge stack (on dockge-cti LXC)

Copy `infra/dockge/yaoc2-gateway/` into the dockge-cti LXC, fill in `.env`, then add the
stack in the Dockge UI pointing at the `docker-compose.yml`.

### 4. Import brain workflows (on n8n LXC)

In the n8n UI at `:5678`, go to **Workflows → Import from file** and import
`n8n/brain/workflows/yaoc2-brain-openclaw.json`.

### 5. Import gateway workflows (on gateway n8n :5679)

Import all files from `n8n/gateway/workflows/` in this order:
1. `yaoc2-sandbox-misp-enrich.json`
2. `yaoc2-sandbox-opencti-sync.json`
3. `yaoc2-sandbox-thehive-case.json`
4. `yaoc2-policy-gateway.json` (last — references sandbox workflow IDs)

### 6. Paste Code node JavaScript

For each Code node in `yaoc2-policy-gateway.json`, paste the corresponding file from
`n8n/gateway/code/` into the node's JS editor. IDs are matched by node name.
