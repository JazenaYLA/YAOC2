# LXC Provisioning Guide

All LXCs are provisioned from the Proxmox host shell using `scripts/setup.sh`. This guide documents the per-LXC configuration.

## LXC Specifications

| LXC | VMID | Cores | RAM | Disk | IP | Notes |
|---|---|---|---|---|---|---|
| lxc-postgres | 200 | 2 | 2GB | 20GB | POSTGRES_IP | Unprivileged, nesting off |
| lxc-valkey | 201 | 1 | 512MB | 5GB | VALKEY_IP | Unprivileged |
| lxc-proxy | 202 | 1 | 512MB | 5GB | CADDY_IP | Unprivileged |
| lxc-infisical | 203 | 2 | 2GB | 10GB | INFISICAL_IP | Unprivileged, Docker inside |
| lxc-headscale | 204 | 1 | 512MB | 5GB | HEADSCALE_IP | Unprivileged |
| lxc-n8nclaw | 210 | 4 | 4GB | 30GB | N8N_IP | Unprivileged |
| lxc-flowise | 211 | 2 | 2GB | 10GB | FLOWISE_IP | Unprivileged |
| lxc-dockge-cti | 220 | 4 | 8GB | 60GB | DOCKGE_CTI_IP | **Privileged**, nesting+Docker |

## Creation Template (all LXCs)

```bash
pct create <VMID> <STORAGE>:vztmpl/<TEMPLATE>.tar.zst \
  --hostname <NAME> \
  --cores <CORES> \
  --memory <RAM_MB> \
  --rootfs <STORAGE>:<DISK_GB> \
  --net0 name=eth0,bridge=<BRIDGE>,ip=<IP>/24,gw=<GW> \
  --nameserver 1.1.1.1 \
  --unprivileged 1 \
  --features nesting=1 \
  --start 1
```

> For `lxc-dockge-cti`, use `--unprivileged 0` and add `--features nesting=1,keyctl=1`.

## Post-Creation Bootstrap

Each LXC has a corresponding `setup.sh` in its directory. Run via:

```bash
pct exec <VMID> -- bash -c "$(cat lxc-<name>/setup.sh)"
```

Or copy the script into the LXC and run it:

```bash
pct push <VMID> lxc-<name>/setup.sh /root/setup.sh
pct exec <VMID> -- bash /root/setup.sh
```

## Startup Order

1. `lxc-postgres` (databases must be ready first)
2. `lxc-valkey`
3. `lxc-infisical`
4. `lxc-headscale`
5. `lxc-proxy`
6. `lxc-n8nclaw`
7. `lxc-flowise`
8. `lxc-dockge-cti` (XTM + Shuffle)
