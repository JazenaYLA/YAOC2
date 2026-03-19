# YAOC2 – Yet Another OpenClaw Clone

YAOC2 is a self‑hosted, **policy‑aware** OpenClaw‑style agent framework built on n8n, Flowise and Shuffle, designed for CTI and SOC homelabs running on Proxmox VE.

Instead of a single monolithic agent that directly touches all your tools, YAOC2 separates the **brain** (reasoning, skills, memory) from the **hands** (execution, SOAR), with a NemoClaw‑style policy gateway in between.

- **Brain**: n8n "OpenClaw clone" (fork of `n8n-claw`) with MCP‑style skills and memory.
- **Gateway**: n8n policy engine that receives structured ProposedAction objects, enforces policies, and dispatches to sandboxed workflows or Shuffle.
- **Execution**: thin n8n workflows and Shuffle playbooks that talk to MISP, OpenCTI, TheHive, XTM, etc., using your existing CTI stack.

---

## Architecture

YAOC2 is designed for an environment where most CTI/SOC apps run as Proxmox LXC containers, and heavy multi‑service stacks (like XTM and Shuffle) run inside a dedicated `dockge-cti` LXC.

| LXC | Role | n8n Instance | Outbound Access |
|---|---|---|---|
| `lxc-yaoc2-brain` | Reasoning, skills, memory | Instance A (port 5678) | Gateway only |
| `lxc-yaoc2-gateway` | Policy engine + sandbox execution | Instance B (port 5679) | All CTI LXCs, dockge-cti |
| `lxc-dockge-cti` | XTM, Shuffle (existing) | — | Internet, CTI LXCs |
| CTI LXCs | MISP, OpenCTI, TheHive, Flowise (existing) | — | cti-net only |

The only trust edge is: `n8n-brain → n8n-gateway → CTI services / Shuffle`.

See [`docs/architecture.md`](docs/architecture.md) and [`docs/networking.md`](docs/networking.md) for full details.

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
      lxc-yaoc2-brain.conf.example
      lxc-yaoc2-gateway.conf.example
    docker/
      n8n-brain/
        docker-compose.yml
        .env.example
      n8n-gateway/
        docker-compose.yml
        .env.example

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

## ProposedAction Schema

The brain never calls CTI tools directly. Instead it emits a structured ProposedAction JSON object and sends it to the gateway via Webhook or `Execute Workflow`.

Core fields:

- `id`, `timestamp`
- `agent`: name, version, session_id
- `requester`: user_id, display_name, channel, tenant
- `intent`: title, description, user_prompt
- `action`: type, name, target_system, mode, parameters
- `risk`: level, reasons, estimated_impact
- `constraints`: must_complete_before, max_cost_units, dry_run
- `policy`: policy_set, required_approvals

See `examples/proposed-action-misp-enrich.json` for a full example.

---

## Policy Model

Policies live as YAML files under `policies/policy-sets/` (or mirrored into Postgres). The gateway evaluates ProposedAction objects against these rules and decides: `allow`, `deny`, or `needs-approval`.

See [`docs/policies.md`](docs/policies.md) for the full policy schema and rule examples.

---

## Quick Start

1. **Create two LXC containers in Proxmox** — `lxc-yaoc2-brain` and `lxc-yaoc2-gateway`.
2. **Clone this repo** into each LXC.
3. **Copy and fill in `.env`** files — see `infra/docker/n8n-brain/.env.example` and `infra/docker/n8n-gateway/.env.example`.
4. **Bring up n8n** in each LXC: `docker compose up -d`.
5. **Import n8n workflows** from `n8n/brain/workflows/` into the brain instance, and `n8n/gateway/workflows/` into the gateway instance.
6. **Configure credentials** for MISP, OpenCTI, TheHive, Shuffle, Flowise, XTM in the gateway n8n instance.
7. **Set up firewall rules** so the brain can only reach the gateway, and the gateway can reach CTI LXCs and `dockge-cti`.
8. **Connect a front‑end** (Telegram bot, Discord bot, etc.) to the brain's webhook.

See [`docs/architecture.md`](docs/architecture.md) for the full installation walkthrough.

---

## Credits

- [freddy-schuetz/n8n-claw](https://github.com/freddy-schuetz/n8n-claw) — n8n OpenClaw implementation that forms the basis of the brain layer.
- [NVIDIA NemoClaw](https://github.com/NVIDIA/NemoClaw) — inspiration for the policy gateway and sandbox execution model.
- [openclaw/openclaw](https://github.com/openclaw/openclaw) — original OpenClaw agent framework.
- [Shuffle SOAR](https://github.com/Shuffle/Shuffle) — SOAR execution layer.
- [threatlabs-cti-stack](https://github.com/JazenaYLA/threatlabs-cti-stack) — the Proxmox CTI homelab this is designed to extend.

---

## License

MIT
