# Networking

## Overview

YAOC2 adds no new LXC containers and no new Docker networks.
The gateway runs inside `lxc-dockge-cti` on the existing `cti-net` Docker network,
giving it direct container-to-container access to all CTI services.

```
Proxmox Host
│
├── vmbr0  (WAN / management)
│
└── cti-net bridge  (internal, e.g. 10.10.10.0/24)
    │
    ├── lxc-n8n             10.10.10.40   YAOC2 brain (existing n8n LXC)
    ├── lxc-dockge-cti      10.10.10.10   all Docker stacks
    │    └── Docker network: cti-net
    │         ├── infra-postgres   :5432
    │         ├── infra-valkey     :6379
    │         ├── misp             :80
    │         ├── opencti / xtm    :8080
    │         ├── thehive          :9000
    │         ├── dfir-iris        :443
    │         ├── shuffle          :3001
    │         ├── flowintel        :5000
    │         └── yaoc2-gateway    :5679   ← NEW (inside same Docker network)
    ├── lxc-flowise         10.10.10.30
    └── lxc-caddy           10.10.10.5    *.lab.local reverse proxy
```

---

## Trust Edges

| Source | Destination | Transport | Purpose |
|---|---|---|---|
| lxc-n8n (brain) | lxc-dockge-cti :5679 | HTTPS over cti-net bridge | ProposedAction submissions |
| lxc-n8n (brain) | Telegram/Discord :443 | HTTPS outbound | User-facing channel bots |
| yaoc2-gateway | infra-postgres :5432 | Docker network (cti-net) | Policy rules + audit log |
| yaoc2-gateway | misp :80/443 | Docker network (cti-net) | MISP REST API |
| yaoc2-gateway | opencti :8080 | Docker network (cti-net) | OpenCTI GraphQL |
| yaoc2-gateway | thehive :9000 | Docker network (cti-net) | TheHive REST API |
| yaoc2-gateway | shuffle :3001 | Docker network (cti-net) | Shuffle REST API |
| yaoc2-gateway | flowise LXC :3000 | cti-net bridge (inter-LXC) | Flowise REST API |
| yaoc2-gateway | Telegram :443 | HTTPS outbound | Approval notifications |

The brain (lxc-n8n) must NOT have a route to CTI service ports directly.
Enforce with iptables on lxc-n8n or Proxmox firewall rules:

```bash
# On lxc-n8n — allow only gateway and outbound HTTPS
iptables -A OUTPUT -d 10.10.10.10 -p tcp --dport 5679 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 443 -j ACCEPT
iptables -A OUTPUT -d 10.10.10.0/24 -j DROP
```

---

## Environment Variable Hostnames

In `infra/dockge/yaoc2-gateway/.env`, use Docker service names for same-network services
and LXC IPs for inter-LXC services:

```dotenv
# Same Docker network (cti-net) — use container names
MISP_BASE_URL=http://misp
OPENCTI_BASE_URL=http://opencti:8080
THEHIVE_BASE_URL=http://thehive:9000
SHUFFLE_BASE_URL=http://shuffle-backend:3001
INFRA_POSTGRES_HOST=infra-postgres

# Inter-LXC (different LXC, same Proxmox bridge)
FLOWISE_BASE_URL=http://10.10.10.30:3000

# Gateway public URL (for Telegram callback webhook)
GATEWAY_WEBHOOK_URL=https://n8n-gateway.lab.local
```

Adjust container names to match your actual threatlabs-cti-stack service names.
