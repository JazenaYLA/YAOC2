# MCP Skill Templates

This directory contains MCP-style skill templates for the YAOC2 brain.

Each skill is a small n8n sub-workflow (or external MCP endpoint) that the brain can register and call via the MCP skill registry.

## Skill contract

Every skill must:

1. Accept a structured JSON input (not raw user text).
2. Return a structured JSON output.
3. NOT call CTI services directly — if a skill requires a CTI action, it must build a ProposedAction and route it through the gateway.

## Planned skills

- `web_search` — search the web for threat intel context.
- `web_reader` — fetch and summarise a URL.
- `ioc_enrich` → emits ProposedAction `ioc_enrichment_misp_opencti`.
- `case_create` → emits ProposedAction `case_create_thehive`.
- `daily_briefing` — summarise recent MISP events and OpenCTI observables (read-only, auto-allowed).
- `threat_lookup` — query public threat intel feeds (read-only, auto-allowed).

## Adding a new skill

1. Create a new n8n workflow named `skill.<skill_name>`.
2. Export it as JSON and add to this directory.
3. Register it in the brain's MCP skill registry node.
