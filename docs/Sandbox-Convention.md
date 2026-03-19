# Sandbox Convention

All high-privilege tool calls in YAOC2 follow the **sandbox convention**: they live in dedicated n8n sub-workflows named `sandbox.<domain>.<action>` and are the **only** components that hold credentials for external systems.

## Naming Convention

```
sandbox.<domain>.<action>

Examples:
  sandbox.misp.create_event
  sandbox.misp.search_ioc
  sandbox.opencti.create_report
  sandbox.web.search
  sandbox.web.reader
  sandbox.file.read
  sandbox.file.write
  sandbox.system.exec
  sandbox.shuffle.trigger_playbook
```

## Rules

1. **Only the Policy Gateway may call sandbox workflows** via `Execute Workflow` node or internal HTTP. The agent brain (n8n-claw) never calls them directly.
2. **Each sandbox workflow accepts only the `parameters` object** from the approved ProposedAction. It does NOT receive the full action payload.
3. **Credentials are stored in n8n credential store** scoped to the sandbox workflow, not in `.env` or passed via webhook.
4. **Sandbox workflows return a typed result object**:
```json
{
  "status": "success" | "error",
  "action_id": "<uuid>",
  "result": { ... },
  "error": "<message if error>",
  "executed_at": "<ISO8601>"
}
```
5. **No recursion**: Sandbox workflows cannot call the agent brain or other sandbox workflows.

## Workflow Files

See `sandbox/` directory for exported n8n workflow JSON stubs for each sandbox domain.

## Shuffle Integration

For SOAR-level actions (MISP event creation with enrichment, TheHive alert promotion, OpenCTI report push), the sandbox workflow calls Shuffle via `sandbox.shuffle.trigger_playbook`:

```json
POST http://shuffle-backend.yaoc2.local:3001/api/v1/workflows/<workflow_id>/execute
Authorization: Bearer <SHUFFLE_API_KEY>
{
  "execution_argument": { ... parameters ... }
}
```

Shuffle is then responsible for the multi-step CTI platform interaction.
