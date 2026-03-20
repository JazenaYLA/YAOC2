# Caddy Routes — YAOC2 + n8n Platform

Add these blocks to your existing `Caddyfile` on the Caddy LXC/host.
All routes assume internal lab DNS resolves `*.lab.local` to the Caddy host.

**Last updated:** 2026-03-19

---

## Existing routes (reference — do not duplicate)

```caddy
# These should already exist from n8n-ecosystem-unified setup
n8n.lab.local {
  reverse_proxy <N8N_LXC_IP>:5678
}

flowise.lab.local {
  reverse_proxy <FLOWISE_LXC_IP>:3000
}
```

---

## New route — YAOC2 Gateway

The gateway n8n instance runs inside `lxc-dockge-cti` as a Dockge stack on port `5679`.

```caddy
n8n-gateway.lab.local {
  # yaoc2-gateway Dockge stack on dockge-cti LXC
  reverse_proxy <DOCKGE_CTI_LXC_IP>:5679

  # Optional: restrict to lab VLAN only
  # @internal remote_ip 10.0.0.0/8 192.168.0.0/16 172.16.0.0/12
  # handle @internal { reverse_proxy <DOCKGE_CTI_LXC_IP>:5679 }
  # handle { respond 403 }
}
```

---

## env vars to update after adding route

On the **n8n LXC** (`/opt/n8n.env`), ensure:
```bash
GATEWAY_WEBHOOK_URL=https://n8n-gateway.lab.local
```

On the **gateway n8n** (Dockge `.env`):
```bash
WEBHOOK_URL=https://n8n-gateway.lab.local
N8N_HOST=n8n-gateway.lab.local
N8N_PROTOCOL=https
```

---

## Full Caddyfile template (all lab services)

```caddy
# ──────────────────────────────────────────────────
# Automation
# ──────────────────────────────────────────────────
n8n.lab.local {
  reverse_proxy <N8N_LXC_IP>:5678
}

n8n-gateway.lab.local {
  reverse_proxy <DOCKGE_CTI_LXC_IP>:5679
}

flowise.lab.local {
  reverse_proxy <FLOWISE_LXC_IP>:3000
}

# ──────────────────────────────────────────────────
# CTI Platform
# ──────────────────────────────────────────────────
misp.lab.local {
  reverse_proxy <DOCKGE_CTI_LXC_IP>:9012
}

opencti.lab.local {
  reverse_proxy <DOCKGE_CTI_LXC_IP>:8080
}

thehive.lab.local {
  reverse_proxy <DOCKGE_CTI_LXC_IP>:9000
}

cortex.lab.local {
  reverse_proxy <DOCKGE_CTI_LXC_IP>:9001
}

# ──────────────────────────────────────────────────
# Publishing
# ──────────────────────────────────────────────────
ghost.lab.local {
  reverse_proxy <GHOST_LXC_OR_CONTAINER_IP>:2368
}
```

---

## UniFi DNS entries needed

Add these A records in UniFi → Network → DNS (or your Pi-hole / AdGuard):

| Hostname | Points to |
|---|---|
| `n8n.lab.local` | Caddy host IP |
| `n8n-gateway.lab.local` | Caddy host IP |
| `flowise.lab.local` | Caddy host IP |
| `misp.lab.local` | Caddy host IP |
| `opencti.lab.local` | Caddy host IP |
| `thehive.lab.local` | Caddy host IP |
| `cortex.lab.local` | Caddy host IP |
| `ghost.lab.local` | Caddy host IP |

All resolve to Caddy — Caddy routes by SNI/hostname to the correct backend.
