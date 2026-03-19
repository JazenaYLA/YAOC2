# Architecture

## Overview

YAOC2 implements a three‑layer model:

```
[User / Channel]
      │
      ▼
┌─────────────────────────┐
│   lxc-yaoc2-brain       │   n8n Instance A
│   (Reasoning / Skills)  │   Port 5678
│                         │   Fork of n8n-claw
└───────────┬─────────────┘
            │  ProposedAction JSON (HTTP / Execute Workflow)
            ▼
┌─────────────────────────┐
│   lxc-yaoc2-gateway     │   n8n Instance B
│   (Policy + Sandbox)    │   Port 5679
│                         │   Policy engine + sandbox flows
└───────────┬─────────────┘
            │  Validated, policy-approved calls
            ▼
┌────────────────────────────────────────┐
│   CTI LXCs / dockge-cti               │
│   MISP · OpenCTI · TheHive · XTM      │
│   Shuffle · Flowise · Cortex          │
└────────────────────────────────────────┘
```

---

## Layer 1 — Brain (lxc-yaoc2-brain)

The brain is a customised fork of `freddy-schuetz/n8n-claw`. It provides:

- **Multi‑channel ingestion**: Telegram, Discord, Web chat, API webhooks.
- **LLM reasoning**: pluggable model (local Ollama, OpenAI, Anthropic, Nemotron via NemoClaw API).
- **MCP‑style skills registry**: dynamic tool registration; each skill is a small sub‑workflow or external MCP endpoint.
- **Long‑term memory**: Postgres‑backed project memory and conversation history.
- **Proactive tasks**: scheduled briefings, heartbeat checks, reminders.

### What the brain does NOT do

The brain has **no credentials** for MISP, OpenCTI, TheHive, Shuffle, or any other CTI service. It cannot make direct HTTP calls to them. Every high‑risk action is emitted as a ProposedAction object and sent to the gateway.

---

## Layer 2 — Gateway (lxc-yaoc2-gateway)

The gateway runs n8n Instance B. It contains:

- **yaoc2-policy-gateway** workflow: the central entry point for all ProposedAction objects.
- **Sandbox workflows**: one per target system (MISP, OpenCTI, TheHive, Shuffle). Each accepts a narrow, typed parameter set — no raw prompts or arbitrary JSON.
- **Policy storage**: YAML files in `policies/policy-sets/` (or mirrored into Postgres for runtime edits).
- **Approval UX**: Telegram/Discord bot messages with Approve/Reject buttons routed back to a callback webhook.
- **Audit log**: every ProposedAction, decision, and result written to Postgres.

### Gateway workflow nodes (yaoc2-policy-gateway)

1. `Webhook` — entry point; receives ProposedAction JSON.
2. `Code (Validate)` — check required fields; reject malformed requests.
3. `Postgres (Load Policies)` — load matching policy rules for action + requester.
4. `Code (Evaluate Policy)` — compute decision: `allow` / `deny` / `needs-approval`.
5. `Switch (Route Decision)` — branch on decision.
6. `[needs-approval branch]`
   - `Telegram/Discord (Notify Approver)` — send summary + Approve/Reject buttons.
   - `Webhook (Approval Callback)` — wait for response.
   - `Code (Record Decision)` — write to audit table.
7. `[allow branch] Code (Map to Sandbox)` — resolve action name to sandbox workflow ID.
8. `Execute Workflow` — call the appropriate sandbox workflow with sanitised parameters.
9. `Code (Normalise Response)` — build a standard result object.
10. `Respond to Webhook` — return result to the brain.

---

## Layer 3 — Execution (CTI LXCs + dockge-cti)

Existing services are unchanged. YAOC2 treats them as black‑box APIs. Sandbox workflows in the gateway call these services using:

- Dedicated low‑privilege service accounts (separate from admin accounts).
- Narrow API endpoints — only the operations YAOC2 needs.
- Input sanitisation before any API call.

| Target | Access method | Example operations |
|---|---|---|
| MISP | REST API (PyMISP compatible) | Search events, create event, add attribute |
| OpenCTI | GraphQL API | Create observable, link indicator, sync |
| TheHive | REST API | Create case/alert, add observable, update status |
| Cortex | REST API | Run analyzer, get report |
| Shuffle | REST API + playbook webhooks | Trigger playbook, get execution status |
| Flowise | REST API | Chat with specialized sub-agent chain |
| XTM | REST API | Threat feed query, indicator enrichment |

---

## Data Flow Example

User sends: *"Enrich 1.2.3.4 in MISP and push results to OpenCTI."*

1. Brain (n8n Instance A) receives message via Telegram.
2. Brain LLM reasons over intent; builds a ProposedAction (action: `ioc_enrichment_misp_opencti`, parameters: `{observable_type: ip, observable_value: 1.2.3.4, ...}`).
3. Brain posts ProposedAction to gateway webhook.
4. Gateway validates schema → loads `default-threatlab` policy set → evaluates: risk=`medium`, decision=`needs-approval`.
5. Gateway sends Telegram approval request to analyst.
6. Analyst taps Approve.
7. Gateway maps action to sandbox workflow `yaoc2-sandbox-misp-enrich` → executes it.
8. Sandbox workflow calls MISP REST API → creates/updates event → calls OpenCTI GraphQL → links indicator.
9. Gateway normalises result → responds to brain.
10. Brain formats user‑friendly reply → sends to Telegram.

---

## Installation Walkthrough

### 1. Proxmox LXC setup

Use the example configs in `infra/proxmox/` as a base. Recommended specs:

- `lxc-yaoc2-brain`: 2 vCPU, 4 GB RAM, 20 GB disk. Debian 12.
- `lxc-yaoc2-gateway`: 2 vCPU, 4 GB RAM, 20 GB disk. Debian 12.

Both containers should be **unprivileged** and attached to `cti-net`.

### 2. Docker setup in each LXC

Install Docker and Docker Compose in each LXC, then:

```bash
git clone https://github.com/JazenaYLA/YAOC2.git
cd YAOC2

# In lxc-yaoc2-brain:
cd infra/docker/n8n-brain
cp .env.example .env   # fill in values
docker compose up -d

# In lxc-yaoc2-gateway:
cd infra/docker/n8n-gateway
cp .env.example .env   # fill in values
docker compose up -d
```

### 3. n8n workflow import

In each n8n UI, go to **Workflows → Import from file** and import the relevant JSON files from `n8n/brain/workflows/` (brain) and `n8n/gateway/workflows/` (gateway).

### 4. Credentials

In the **gateway** n8n instance, add credentials for:

- MISP (API key + base URL)
- OpenCTI (API key + base URL)
- TheHive (API key + base URL)
- Shuffle (API key + base URL)
- Flowise (API key + base URL)
- Telegram Bot (for approval notifications)
- Postgres (audit DB)

The **brain** instance needs only:

- LLM provider (Ollama / OpenAI / Anthropic / Nemotron)
- Telegram/Discord bot (for user-facing front-end)
- Postgres (for memory)
- Gateway webhook URL + shared secret
