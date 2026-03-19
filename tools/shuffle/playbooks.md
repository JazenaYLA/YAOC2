# Shuffle SOAR Playbooks

Shuffle is used in YAOC2 as the **SOAR execution layer** for high-privilege or multi-step automated response actions. It is always called from the YAOC2 policy gateway after policy approval — never directly from the brain.

## How YAOC2 calls Shuffle

The gateway's `execute-sandbox` node maps actions with `type: external_soar` to Shuffle playbook webhook URLs:

```
POST {{ $env.SHUFFLE_BASE_URL }}/api/v1/hooks/webhook_<playbook-id>
Authorization: Bearer {{ $env.SHUFFLE_API_KEY }}

{ ...sanitised action.parameters... }
```

## Planned playbooks

### misp-enrich-opencti-sync.yaml

See `tools/shuffle/misp-enrich-opencti-sync.yaml`.

Trigger: webhook from gateway.
Steps:
1. Search MISP for IOC.
2. Enrich via Cortex analyzers.
3. Sync enriched result to OpenCTI.
4. Return result JSON to gateway.

### thehive-case-escalate

Trigger: webhook from gateway.
Steps:
1. Get TheHive case by ID.
2. Run Cortex analyzers on observables.
3. Update case severity and tags based on results.
4. Notify analyst via Telegram.

### block-indicator

Trigger: webhook from gateway (high-risk: `lab-highrisk` policy set only).
Steps:
1. Receive `{ indicator_type, indicator_value, block_target }`.
2. Push block rule to firewall/EDR (integration-specific).
3. Log action to TheHive case.
4. Return confirmation.
