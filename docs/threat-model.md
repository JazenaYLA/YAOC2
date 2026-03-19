# Threat Model

## Trust Boundaries

| Boundary | What crosses it | Risk |
|---|---|---|
| User → Brain | Free-text messages, commands | Prompt injection, social engineering |
| Brain → Gateway | ProposedAction JSON (structured) | Malformed or adversarial JSON payloads |
| Gateway → CTI services | Narrow API calls with validated params | Credential exposure, SSRF, over-privileged actions |
| Gateway → Approver | Approval notification messages | Approver spoofing, approval fatigue |

## Mitigations

- **Prompt injection**: Brain workflows must not pass raw user text into ProposedAction `parameters`. Use structured extraction nodes (Function/Code) to build parameters programmatically.
- **ProposedAction validation**: Gateway validates schema strictly before any policy evaluation. Unknown fields are stripped.
- **Credential isolation**: Only the gateway n8n instance holds CTI service credentials. Brain has no access.
- **Least privilege API keys**: Each CTI service has a dedicated YAOC2 service account with only the permissions needed (e.g. MISP read+event-create only; no admin).
- **Approval fatigue**: Policies should be tuned to auto-allow low-risk read-only operations to minimise approval noise. Reserve human approval for write/admin actions.
- **Audit log**: Every ProposedAction, decision, and result is written to the gateway Postgres audit table.
- **Network isolation**: Brain cannot reach CTI services directly (enforced by firewall rules — see `docs/networking.md`).
