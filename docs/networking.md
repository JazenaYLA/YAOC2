# Networking

## Proxmox Network Layout

All YAOC2 and CTI LXCs share the `cti-net` bridge on Proxmox VE. Network policies enforce which LXCs may speak to which.

```
Proxmox Host
│
├── vmbr0 (WAN / management)
│
└── cti-net (internal bridge, e.g. 10.10.10.0/24)
    ├── lxc-yaoc2-brain     10.10.10.50
    ├── lxc-yaoc2-gateway   10.10.10.51
    ├── lxc-dockge-cti      10.10.10.10   (XTM, Shuffle)
    ├── lxc-misp            10.10.10.20
    ├── lxc-opencti         10.10.10.21
    ├── lxc-thehive         10.10.10.22
    ├── lxc-flowise         10.10.10.30
    └── lxc-n8n             10.10.10.40   (existing general n8n, if any)
```

Adjust IPs to match your actual `threatlabs-cti-stack` addressing.

---

## Trust Edges

| Source | Destination | Port(s) | Protocol | Purpose |
|---|---|---|---|---|
| lxc-yaoc2-brain | lxc-yaoc2-gateway | 5679 | HTTPS | ProposedAction submissions |
| lxc-yaoc2-brain | Internet (Telegram/Discord) | 443 | HTTPS | User-facing channel bots |
| lxc-yaoc2-gateway | lxc-misp | 443 | HTTPS | MISP REST API |
| lxc-yaoc2-gateway | lxc-opencti | 8080 | HTTPS | OpenCTI GraphQL API |
| lxc-yaoc2-gateway | lxc-thehive | 9000 | HTTPS | TheHive REST API |
| lxc-yaoc2-gateway | lxc-flowise | 3000 | HTTPS | Flowise REST API |
| lxc-yaoc2-gateway | lxc-dockge-cti | 3001, 8088 | HTTPS | Shuffle REST API, XTM API |
| lxc-yaoc2-gateway | Internet (Telegram/Discord) | 443 | HTTPS | Approval notifications |

**The brain must NOT have a route to CTI LXCs directly.** Use Proxmox firewall rules or iptables inside the brain LXC to enforce this.

---

## Firewall Rules (Proxmox FW or iptables)

On `lxc-yaoc2-brain`, block outbound traffic to CTI LXCs directly:

```bash
# Allow outbound to gateway only (adjust IPs)
iptables -A OUTPUT -d 10.10.10.51 -j ACCEPT
# Allow outbound to Telegram/Discord
iptables -A OUTPUT -d 0.0.0.0/0 -p tcp --dport 443 -j ACCEPT
# Block everything else on cti-net
iptables -A OUTPUT -d 10.10.10.0/24 -j DROP
```

On `lxc-yaoc2-gateway`, allow inbound from brain only:

```bash
iptables -A INPUT -s 10.10.10.50 -p tcp --dport 5679 -j ACCEPT
iptables -A INPUT -s 10.10.10.0/24 -p tcp --dport 5679 -j DROP
```

---

## Environment Variable Hostnames

In `infra/docker/n8n-gateway/.env`, use the internal cti-net hostnames or IPs:

```dotenv
MISP_BASE_URL=https://10.10.10.20
OPENCTI_BASE_URL=https://10.10.10.21:8080
THEHIVE_BASE_URL=https://10.10.10.22:9000
FLOWISE_BASE_URL=https://10.10.10.30:3000
SHUFFLE_BASE_URL=https://10.10.10.10:3001
XTM_BASE_URL=https://10.10.10.10:8088

GATEWAY_WEBHOOK_SECRET=changeme
```

In `infra/docker/n8n-brain/.env`:

```dotenv
GATEWAY_WEBHOOK_URL=https://10.10.10.51:5679/webhook/proposed-action
GATEWAY_WEBHOOK_SECRET=changeme
```
