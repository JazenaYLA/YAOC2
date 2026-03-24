# Setup Checklist — YAOC2

> **Last updated:** 2026-03-24  
> **Antigravity shortcut:** See `docs/ANTIGRAVITY_RECONFIGURE.md` for fully automated deployment.  
> **n8n platform checklist:** See [`n8n-ecosystem-unified/SETUP_CHECKLIST.md`](https://github.com/JazenaYLA/n8n-ecosystem-unified/blob/main/SETUP_CHECKLIST.md)

---

## Architecture Reminder

| Component | Host | No new LXC needed |
|---|---|---|
| Brain workflows | lxc-n8n (existing systemd n8n) | ✅ |
| Policy Gateway | lxc-dockge-cti (new Dockge stack) | ✅ |
| infra-postgres | lxc-dockge-cti (existing, image upgraded) | ✅ |

---

## 🔴 Phase 1 — dockge-cti LXC

| Step | Action | Status |
|---|---|---|
| 1 | `docker compose pull postgres && docker compose up -d postgres` in `/opt/stacks/infra` | 🔴 |
| 2 | Verify pgvector: `docker exec infra-postgres psql -U postgres -c 'SELECT extversion FROM pg_extension WHERE extname = '\''vector'\'''` | 🔴 |
| 3 | Run YAOC2 migration: `docker exec -i infra-postgres psql -U postgres < /tmp/yaoc2/infra/migrations/000_yaoc2_schema.sql` | 🔴 |
| 4 | Verify schema: `docker exec infra-postgres psql -U postgres -c '\dt yaoc2.*'` shows 3 tables | 🔴 |
| 5 | Copy gateway stack to `/opt/stacks/yaoc2-gateway/`, fill `.env`, `docker compose up -d` | 🔴 |
| 6 | Verify gateway n8n: `curl http://localhost:5679/healthz` returns `{"status":"ok"}` | 🔴 |

## 🟡 Phase 2 — n8n LXC

| Step | Action | Status |
|---|---|---|
| 7 | Export n8n backup: UI → Settings → Export → Download JSON | 🔴 |
| 8 | Run `migrate-to-postgres.sh` (or manual path — see n8n-ecosystem-unified checklist) | 🔴 |
| 9 | Append `GATEWAY_WEBHOOK_URL`, `GATEWAY_WEBHOOK_SECRET`, `APPROVAL_CHAT_ID` to `/opt/n8n.env` | 🔴 |
| 10 | `systemctl restart n8n` → verify logs show Postgres connection | 🔴 |

## 🟢 Phase 3 — n8n UI (brain instance — n8n.lab.local)

| Step | Action | Status |
|---|---|---|
| 11 | Create owner account + API key → store in Infisical | 🔴 |
| 12 | Settings → Variables: add `GATEWAY_WEBHOOK_URL`, `GATEWAY_WEBHOOK_SECRET`, `APPROVAL_CHAT_ID` | 🔴 |
| 13 | Settings → Credentials: create `infra-postgres` (user: yaoc2, schema: n8n_gateway), Telegram Bot, OpenRouter | 🔴 |
| 14 | Import workflows in order: Tiered Model Router → Multi-Channel Router → Email Manager → YAOC2 Brain | 🔴 |
| 15 | Activate `[YAOC2] Brain — OpenClaw Agent` | 🔴 |

## 🟢 Phase 4 — Gateway n8n UI (n8n-gateway.lab.local)

| Step | Action | Status |
|---|---|---|
| 16 | Create owner account + API key → store in Infisical | 🔴 |
| 17 | Settings → Credentials: `infra-postgres` (user: yaoc2), Gateway Webhook Secret, Telegram Bot | 🔴 |
| 18 | Import sandbox workflows first: MISP Enrich, OpenCTI Sync, TheHive Case | 🔴 |
| 19 | Import `yaoc2-policy-gateway.json` last | 🔴 |
| 20 | Activate all four gateway workflows | 🔴 |

## 🟣 Phase 5 — Smoke Test

| Step | Action | Status |
|---|---|---|
| 21 | Send test ProposedAction to gateway (see `docs/ANTIGRAVITY_RECONFIGURE.md` Step 8) | 🔴 |
| 22 | Send a message to the Telegram bot and verify end-to-end response | 🔴 |
| 23 | Check `yaoc2.audit_log` has a row: `SELECT * FROM yaoc2.audit_log LIMIT 1;` | 🔴 |

---

## 🤖 Antigravity Shortcut

Tell Antigravity:
> *"Follow `docs/ANTIGRAVITY_RECONFIGURE.md` in the YAOC2 repo. Deploy the full YAOC2 stack: upgrade postgres, run migrations, deploy gateway Dockge stack, configure n8n LXC, import all workflows in correct order, activate, and run smoke test. Report back with all URLs and workflow IDs."*

---

## 🛠️ Troubleshooting

### sqlite3 Native Bindings Error (n8n LXC — Proxmox Helper Script Install)

**Symptom:** Workflow nodes (AI Agent, SQLite community node) throw:
```
Could not locate the bindings file. Tried:
→ /usr/lib/node_modules/n8n/node_modules/sqlite3/build/Release/node_sqlite3.node
...
→ /usr/lib/node_modules/n8n/node_modules/sqlite3/compiled/24.14.0/linux/x64/node_sqlite3.node
```

**Root cause:** The Proxmox helper script installs n8n globally under Node 24 (ABI 137), but `sqlite3` ships no prebuilt binary for that ABI. The native `.node` binding must be compiled from source.

**Confirmed environment:** Node v24.14.0 · n8n v2.12.3 · Debian LXC (lxc-n8n, CT 104)

**Fix (one-time, run inside the n8n LXC):**

```bash
# Enter the LXC from Proxmox host
pct enter 104

# Ensure build tools are present
apt install -y build-essential python3 make g++

# Rebuild sqlite3 native bindings for the current Node version
cd /usr/lib/node_modules/n8n
npm rebuild sqlite3 --build-from-source

# Restart n8n
systemctl restart n8n

# Verify
systemctl status n8n
```

**Expected output from rebuild:**
```
rebuilt dependencies successfully
```

> ⚠️ **After every n8n major version upgrade**, re-run `npm rebuild sqlite3 --build-from-source` if Node version changes, as the ABI will differ and the compiled binary will be stale.

**If using the community `n8n-nodes-sqlite3` package**, also rebuild in the community node directory:

```bash
cd /root/.n8n/nodes/node_modules/n8n-nodes-sqlite3
npm rebuild sqlite3 --build-from-source
systemctl restart n8n
```

---

### Telegram Trigger Webhook Error — `Failed to resolve host`

**Symptom:** Telegram Trigger node in n8n throws:
```
Bad Request: bad webhook: Failed to resolve host: Name or service not known
```

**Root cause:** n8n's `WEBHOOK_URL` is set to an internal-only hostname (e.g. `n8n.lab.threatresearcher.net`) that is not publicly resolvable by Telegram's servers. Both Telegram and WhatsApp Cloud integrations require a **public HTTPS URL** that Telegram/Meta can reach to deliver webhook events.

**Fix — Option A: Cloudflare Tunnel (recommended, permanent)**

Set up a Cloudflared LXC or add a tunnel to your existing setup. Once you have a public domain routing to n8n, update `/opt/n8n.env` (or wherever the Proxmox helper script stores n8n env vars):

```bash
# In /opt/n8n.env (adjust path if your setup uses a different file)
WEBHOOK_URL=https://n8n.yourdomain.com
WEBHOOK_TUNNEL_URL=https://n8n.yourdomain.com
```

Then restart n8n and re-activate the Telegram trigger workflow:

```bash
systemctl restart n8n
```

**Fix — Option B: ngrok (temporary, until Cloudflare tunnel is ready)**

Install ngrok inside CT 104 (the n8n LXC) and run a tunnel to port 5678:

```bash
# Install ngrok (Debian)
curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | tee /etc/apt/sources.list.d/ngrok.list
apt update && apt install -y ngrok

# Authenticate (get token from https://dashboard.ngrok.com)
ngrok config add-authtoken YOUR_NGROK_TOKEN

# Start tunnel (note the HTTPS URL it gives you, e.g. https://abcd-1234.ngrok-free.app)
ngrok http 5678
```

Set the ngrok URL in n8n and restart:

```bash
export WEBHOOK_URL=https://abcd-1234.ngrok-free.app
export WEBHOOK_TUNNEL_URL=https://abcd-1234.ngrok-free.app
systemctl restart n8n
```

**Make ngrok persistent** (optional, so it survives reboots):

```bash
cat >/etc/systemd/system/ngrok.service <<'EOF'
[Unit]
Description=ngrok tunnel for n8n
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/ngrok http 5678
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now ngrok
```

> ⚠️ **ngrok free tier** gives a random URL that changes on every restart. You must update `WEBHOOK_URL` and restart n8n each time. The paid tier supports static domains. For production, migrate to Cloudflare Tunnel.

**After any webhook URL change:**
1. In n8n UI — deactivate and re-activate the Telegram trigger workflow so n8n re-registers the webhook with Telegram.
2. Verify from an external machine: `curl -I https://<your-public-url>/rest/webhooks/receptionist` — should return an HTTP response (not a DNS error).

**Applies to:** Telegram Trigger, WhatsApp Business Cloud Trigger, and any other n8n webhook-based integration requiring a public HTTPS callback URL.
