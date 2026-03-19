# Setup Checklist — YAOC2

> **Last updated:** 2026-03-19  
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
