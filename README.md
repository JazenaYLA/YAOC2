# YAOC2 — Yet Another OpenClaw Clone 2

A self-hosted, Proxmox VE–native implementation of **OpenClaw + NemoClaw** capabilities, built on **n8n** (agent brain), **Flowise AI** (sub-agent reasoning), and **Shuffle** (SOAR execution). Designed to mirror the enterprise-tier infra pattern of [threatlabs-cti-stack](https://github.com/JazenaYLA/threatlabs-cti-stack).

---

## Architecture Overview

```
Proxmox VE Host
├── lxc-n8nclaw          (n8n agent core — OpenClaw brain)
├── lxc-flowise          (Flowise AI — sub-agent reasoning)
├── lxc-postgres         (shared Postgres 17 — agent memory & policy store)
├── lxc-valkey           (shared Valkey/Redis — session & queue)
├── lxc-proxy            (Caddy — reverse proxy + TLS)
├── lxc-infisical        (Infisical — secrets management)
├── lxc-headscale        (Headscale — zero-trust overlay VPN)
└── lxc-dockge-cti       (Dockge-managed Docker stack)
    ├── xtm              (OpenCTI / OpenAEV)
    └── shuffle          (Shuffle SOAR)
```

All services communicate over a **Headscale VPN mesh** (`yaoc2-net`) and optionally through the **Caddy** reverse proxy with `*.yaoc2.local` domains.

See [docs/Architecture.md](docs/Architecture.md) for the full layered design.

---

## Layered Design (OpenClaw + NemoClaw)

| Layer | Component | Responsibility |
|---|---|---|
| **Reasoning / Skills** | n8n (n8n-claw core) | Agent brain, MCP skills registry, long-term memory, multi-channel front-end |
| **Sub-Agent Reasoning** | Flowise AI | Pluggable LLM chains called via HTTP from n8n |
| **Policy Gateway** | n8n policy workflows | ProposedAction schema validation, allow/deny/approve |
| **Execution / SOAR** | Shuffle playbooks | High-privilege actions (MISP, TheHive, OpenCTI, infra) |
| **Sandbox Convention** | `sandbox.*` n8n workflows | All external tool calls go through here, never directly from LLM |
| **Secrets** | Infisical | API keys, credentials, per-LXC env injection |
| **Zero-Trust Net** | Headscale | Mesh VPN between all LXCs |
| **Observability** | n8n execution logs → Postgres | Audit trail for all ProposedActions |

---

## Directory Structure

```
YAOC2/
├── docs/                   # Architecture, deployment guides, troubleshooting
├── infra/                  # Proxmox LXC provisioning scripts (shared for all LXCs)
├── lxc-n8nclaw/            # n8n agent LXC — setup, config, n8n workflow exports
├── lxc-flowise/            # Flowise AI LXC — setup, config, chatflow exports
├── lxc-postgres/           # Shared Postgres LXC — init SQL, setup script
├── lxc-valkey/             # Shared Valkey/Redis LXC — config, setup script
├── lxc-proxy/              # Caddy LXC — Caddyfile templates
├── lxc-infisical/          # Infisical secrets LXC — setup script
├── lxc-headscale/          # Headscale VPN LXC — config template
├── lxc-dockge-cti/         # Dockge-managed Docker stack LXC
│   ├── xtm/                # OpenCTI + OpenAEV
│   └── shuffle/            # Shuffle SOAR
├── policy/                 # ProposedAction schema, policy YAML configs
├── sandbox/                # Sandbox n8n workflow stubs (exported JSON)
├── scripts/                # Helper scripts: setup.sh, reset.sh, sync-identity.sh
├── .env.example            # Root-level env template
├── .gitignore
└── README.md
```

---

## Quick Start

### Prerequisites
- Proxmox VE 8.x host
- Debian 12 LXC template available
- `pct` CLI access from the Proxmox shell
- Cloudflare account (optional, for tunnel access)

### 1. Clone

```bash
git clone https://github.com/JazenaYLA/YAOC2.git
cd YAOC2
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — set your IPs, passwords, API keys
```

### 3. Provision LXCs

Run the master provisioning script from your **Proxmox host shell**:

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

This will:
1. Create all LXCs (Postgres, Valkey, Caddy, Infisical, Headscale, n8n, Flowise)
2. Bootstrap the `lxc-dockge-cti` Docker stack
3. Start XTM (OpenCTI) and Shuffle inside Dockge
4. Output connection details and next steps

### 4. Import n8n Workflows

See [lxc-n8nclaw/README.md](lxc-n8nclaw/README.md) for importing the agent brain, policy gateway, and sandbox workflows.

### 5. Import Flowise Chatflows

See [lxc-flowise/README.md](lxc-flowise/README.md) for sub-agent chain imports.

---

## Documentation

- [Architecture & Design Decisions](docs/Architecture.md)
- [LXC Provisioning Guide](docs/LXC-Provisioning.md)
- [n8n-claw Agent Setup](docs/n8nclaw-Setup.md)
- [Policy Gateway Design](docs/Policy-Gateway.md)
- [Sandbox Convention](docs/Sandbox-Convention.md)
- [Shuffle Playbook Guide](docs/Shuffle-Playbooks.md)
- [Flowise Sub-Agent Guide](docs/Flowise-SubAgents.md)
- [Headscale Zero-Trust Setup](docs/Headscale.md)
- [Reverse Proxy Guide](docs/Reverse-Proxy.md)
- [Troubleshooting](docs/Troubleshooting.md)

---

## Credits

Built on top of:
- [freddy-schuetz/n8n-claw](https://github.com/freddy-schuetz/n8n-claw) — n8n OpenClaw re-implementation
- [shabbirun/n8nclaw](https://github.com/shabbirun/n8nclaw) — lightweight OpenClaw n8n reference
- [NVIDIA NemoClaw](https://github.com/NVIDIA/NemoClaw) — policy/sandbox inspiration
- [openclaw/openclaw](https://github.com/openclaw/openclaw) — original OpenClaw
- [JazenaYLA/threatlabs-cti-stack](https://github.com/JazenaYLA/threatlabs-cti-stack) — infra pattern
