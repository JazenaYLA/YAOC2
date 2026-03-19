# Flowise Example Flows

Flowise is used in YAOC2 as a pluggable **reasoning sub-agent** layer, called by the gateway or brain via HTTP Request node. It does NOT orchestrate actions directly — it returns structured analysis results that the brain or gateway uses to build ProposedAction objects.

## Recommended flows to build in Flowise

### 1. IOC Context Enricher

Input: `{ observable_type, observable_value }`

Steps:
- Query public OSINT sources (VirusTotal, AbuseIPDB, Shodan via API tool nodes).
- Summarise findings.
- Return: `{ context_summary, confidence, tags[], references[] }`

Used by: brain skill `ioc_enrich` before building the ProposedAction.

### 2. Threat Report Summariser

Input: `{ report_url }`

Steps:
- Fetch URL (web reader tool).
- Extract IOCs and TTPs.
- Summarise in structured form.
- Return: `{ summary, iocs[], ttps[], references[] }`

Used by: brain skill `threat_report_summarise`.

### 3. Daily Briefing Generator

Input: `{ since_hours: 24 }`

Steps:
- Query MISP for recent events (read-only, auto-allowed).
- Query OpenCTI for new observables.
- Summarise highlights.
- Return: `{ briefing_text, event_count, observable_count }`

Used by: brain proactive task `daily_briefing`.

## Integration pattern

In your n8n brain workflow, add an `HTTP Request` node pointing to:

```
POST {{ $env.FLOWISE_BASE_URL }}/api/v1/prediction/<flow-id>
Content-Type: application/json
Authorization: Bearer {{ $env.FLOWISE_API_KEY }}

{ "question": "<structured JSON input as string>" }
```

Parse the `text` field of the response as JSON.
