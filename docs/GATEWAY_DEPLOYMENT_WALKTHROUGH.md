# Walkthrough — YAOC2 Gateway Integration

> **Branch:** `enterprise`  
> **Status:** Changes implemented by agent; final sync/deployment requires manual execution due to terminal environment limitations (nsjail).

---

## 🛠️ Changes Implemented

### 1. Gateway Configuration

| File | Change |
|---|---|
| `docker-compose.yml` | Enabled native MCP Server (`N8N_BLOCK_MCP_ACCESS=true`); standardized to bind-mounts (`./volumes/data`); integrated Infisical variable names for all core secrets |
| `.env` | Prepared with local defaults for initial seeding |

**Location:** `/opt/stacks/yaoc2-gateway/`

### 2. Infrastructure Integration

| File | Change |
|---|---|
| `scripts/volume-config.sh` | Added `yaoc2-gateway` to the canonical stack list, ensuring it follows the repository's permission and reset lifecycle |

**Location:** `/opt/stacks/scripts/volume-config.sh`

---

## 🚀 Final Deployment (Manual Steps)

Run the following commands on the host terminal (Dockge-CTI LXC — `192.168.101.169`).

### Step 1: Create Directories & Set Permissions

```bash
cd /opt/stacks
mkdir -p yaoc2-gateway/volumes/data
sudo chown -R 1000:1000 yaoc2-gateway/volumes/data
```

### Step 2: Synchronize Secrets from Infisical

Ensure the following secrets are declared in Infisical under the `/yaoc2-gateway/` path, then run:

```bash
./scripts/update-secrets.sh yaoc2-gateway
```

> ⚠️ `N8N_GATEWAY_MCP_TOKEN` is a **post-deploy** secret — it is generated in Step 4 after the instance is up. Leave it blank or placeholder at this stage.

### Step 3: Start the Gateway

```bash
./startup.sh yaoc2-gateway
```

Verify the container is healthy:

```bash
curl http://localhost:5679/healthz
# Expected: {"status":"ok"}
```

### Step 4: Configure n8n Native MCP Token

1. Log in to the Gateway UI: `https://n8n-gateway.lab.threatresearcher.net`
2. Go to **Settings → Instance-level MCP**
3. Generate a **Personal MCP Access Token**
4. Store this token in Infisical:
   - **Path:** `/yaoc2-gateway/N8N_GATEWAY_MCP_TOKEN`
   - **Value:** `<generated token>`
5. Re-run secrets sync so the running container picks it up:
   ```bash
   ./scripts/update-secrets.sh yaoc2-gateway
   ```

---

## ✅ Verification Checklist

| Check | Command / Action | Expected Result |
|---|---|---|
| Gateway health | `curl http://localhost:5679/healthz` | `{"status":"ok"}` |
| Brain → Gateway reachability | From Brain LXC: `curl http://192.168.101.169:5679/healthz` | `{"status":"ok"}` |
| MCP Bridge | Brain AI nodes list tools from Gateway SSE endpoint (`/rest/mcp/sse`) | Tool list returned without auth error |
| Telegram trigger | In n8n UI — confirm consolidated Telegram trigger is **active only on the Gateway**, not the Brain | Single active trigger on Gateway |
| Workflow activation | All four gateway workflows active: Policy Gateway, MISP Enrich, OpenCTI Sync, TheHive Case | Status ✅ in Gateway UI |

---

## 🗒️ Notes

- **MCP access is blocked by default** (`N8N_BLOCK_MCP_ACCESS=true` is set). The Brain connects to the Gateway's MCP endpoint using the `N8N_GATEWAY_MCP_TOKEN`. Do not expose this endpoint publicly.
- **Telegram trigger consolidation**: The Telegram bot trigger must not be active on both the Brain and the Gateway simultaneously. Deactivate any duplicate on the Brain after confirming the Gateway trigger is live.
- **Infisical sync order matters**: `N8N_GATEWAY_MCP_TOKEN` must be written to Infisical *after* the Gateway generates it (Step 4), then secrets sync must be re-run so downstream consumers (e.g. Brain workflows) can resolve it.
- See [`IMPLEMENTATION_DIVERGENCE.md`](IMPLEMENTATION_DIVERGENCE.md) for broader architectural context on why the Gateway pattern exists.
- See [`SETUP_CHECKLIST.md`](../SETUP_CHECKLIST.md) for the full Phase 1–5 deployment sequence this walkthrough is part of.
