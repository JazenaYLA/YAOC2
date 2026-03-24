# Implementation Divergence: ThreatLabs CTI Stack (Enterprise)

> **Last updated:** March 2026  
> **Purpose:** Ground truth for future architectural proposals. Summarizes where the live implementation diverges from earlier conceptual designs found in `docs/review`.

---

## 1. Forgejo-MCP (Enterprise Bridge)

### Conceptual Design

- Envisioned as a standard Go-based bridge server using SSE transport.
- Suggested as a portable "skill template" under the `cti-forgejo` ID.

### Live Implementation Divergence

- **Custom Build Logic**: The `Dockerfile` specifically targets the `enterprise` branch and performs **in-place code modification** to bypass SSL verification (`InsecureSkipVerify: true`) and adjust Go versions (1.25.0 → 1.24.0).
- **Hardened sidecar**: Runs as a Docker container with an `alpine:latest` runtime, exposed on port 8080 and specifically configured for SSE mode.
- **Manual Patching**: The SSL bypass is not a config flag but a `sed` injection into `pkg/forgejo/forgejo.go` during the build phase.

> **Next step (recommended):** Move the SSL bypass from a `sed` patch to a runtime environment variable or a volume-mounted internal CA cert for robustness.

---

## 2. n8n Ecosystem Unification (Brain & Gateway)

### Conceptual Design

- "OS vs. App Store" model: yaoc2 as core, templates as plugins.
- Discussed as separate instances (Brain LXC and Gateway Docker).

### Live Implementation Divergence

- **Unified Persistence**: Both the Brain (systemd LXC at `192.168.101.168`) and Gateway (Docker-based `yaoc2-gateway`) have been migrated to a shared **PostgreSQL backend** (`infra-postgres`) using isolated schemas (`n8n_brain` and `n8n_gateway`).
- **Unified Trust Model**: By sharing the Postgres backend, both instances share credentials and maintain a unified execution log across the Brain-Gateway split.
- **Native MCP Bridge**: Instead of purely relying on external skill templates, the Gateway hosts a **native n8n-based MCP server** (`/rest/mcp/sse`) with `N8N_BLOCK_MCP_ACCESS=true`.
- **Receptionist Pattern**: The Gateway uses "Canonical Listeners" (Receptionists) to receive external triggers (WhatsApp/Telegram) and bridge them to the Brain's reasoning engine.
- **Secret Management**: Integrated with **Infisical** for all core secrets (e.g., `N8N_GATEWAY_MCP_TOKEN`).
- **Tool Exposure**: Workflows for MISP, TheHive, and OpenCTI are implemented natively in n8n and marked with `availableInMCP: true`, allowing the Brain to consume them as tools through a direct SSE bridge.
- **Storage**: Standardized on **bind-mounts** (`./volumes/data`) for data persistence across Docker stacks.

---

## 3. Ingress & Connectivity

### Conceptual Design

- Generalized discussion about webhooks and ingress.

### Live Implementation Divergence

- **ngrok Tunneling**: Production ingress for WhatsApp and Telegram relies on an automated **ngrok sidecar** on the Gateway.
- **Autonomous Recovery (Heartbeat PRO)**: A specialized "Heartbeat PRO" workflow polls the ngrok API to detect tunnel resets and automatically updates the webhook URLs for external platforms.
- **Evolution API (WhatsApp)**: The V2 WhatsApp stack is stabilized on the shared PostgreSQL instance, moving away from local SQLite.
- **Unified Management**: Deployment is managed via standardized scripts: `startup.sh`, `update-secrets.sh`, and `volume-config.sh`.

---

## 4. Architectural Summary

### Ground Rules

| Rule | Detail |
|---|---|
| **Internal Forgejo is Source of Truth** | The `enterprise` branch on the internal instance holds all live configs and Dockerfiles |
| **Shared State is Rule #1** | Any new service should use `infra-postgres` rather than local storage |
| **SSL Bypass is Expected** | Lab uses internal CAs; implementation code often requires explicit bypasses (as in Forgejo-MCP) |
| **Manual Verification Needed** | Some final sync steps (e.g., MCP token in Infisical) may still require manual host verification |

### Current "OS" Layers

| Layer | Host | Role |
|---|---|---|
| **Intelligence Layer** | n8n Brain — LXC `192.168.101.168` | Orchestrates reasoning and tiered routing |
| **Policy/Ingress Layer** | yaoc2-gateway — Docker `192.168.101.169` | Handles webhooks, ngrok, and tool exposure |
| **Data Layer** | `infra-postgres` (Postgres 17) + `infra-valkey` | Unified state for n8n, OpenAEV, FlowIntel, OpenClaw |

---

## 5. LXC & Service Inventory (Live State)

### Native LXC Services (VLAN 101)

| Service | Host | Notes |
|---|---|---|
| **Wazuh** | Dedicated LXC | Running as native systemd services: `wazuh-manager`, `wazuh-indexer`, `wazuh-dashboard`. Not containerized. |
| **Cortex** | `192.168.101.198` | Running in a local Dockge instance on its LXC. |
| **AIL Framework** | Dedicated LXC | Installed in `/opt/AIL-framework` (or similar path). |
| **n8n Brain** | `192.168.101.168` | systemd-based native service, pointing to shared `infra-postgres` on the Docker host. |
| **OpenClaw** | PCT 112 | Configured in `infra` database but LXC was **unreachable during audit** — gap to investigate. |

### Docker Stack Divergences (Dockge-CTI — `192.168.101.169`)

| Stack | Key Divergence |
|---|---|
| **OpenCTI** | Hosted as part of the `xtm` stack, **not** a standalone `opencti` stack. Use `xtm` context for any Docker-level orchestration. |
| **MISP** | Uses a standalone **MariaDB 10.11** within its own stack — has **not** been unified with `infra-postgres`. |
| **`infra` stack** | Authoritative provider of shared resources (Postgres 17, Valkey, ElasticSearch). Manages the `cti-net` external network used by all other stacks. |

---

## 6. Recommended Next Steps

| Priority | Item | Detail |
|---|---|---|
| 🔴 High | **Investigate OpenClaw (PCT 112)** | LXC was unreachable during audit; it is referenced in `infra` DB. Determine if the container is down or misconfigured. |
| 🟡 Medium | **Migrate MISP to `infra-postgres`** | Eliminates the standalone MariaDB instance and reduces resource footprint. Evaluate MariaDB-to-Postgres compatibility first. |
| 🟡 Medium | **Migrate TheHive to `infra-postgres`** | Same rationale as MISP migration. |
| 🟡 Medium | **Harden Forgejo-MCP SSL bypass** | Replace the `sed`-based `InsecureSkipVerify` patch with a runtime env var or volume-mounted internal CA cert. |
| 🟢 Low | **XTM-OpenCTI naming** | Future n8n workflows targeting OpenCTI must reference the `xtm` stack context, not a generic `opencti` stack name. |
