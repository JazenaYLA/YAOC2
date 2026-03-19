-- YAOC2 schema migration
-- Run against infra-postgres (pgvector/pgvector:pg17) after upgrading from postgres:17-alpine
-- Usage: docker exec -i infra-postgres psql -U postgres < 000_yaoc2_schema.sql

-- ============================================================
-- Extensions (requires pgvector/pgvector:pg17 — not available
-- in postgres:17-alpine)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- YAOC2 database and user
-- Uses OPENCLAW_DB_PASSWORD from infra/.env (already defined)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'yaoc2') THEN
    CREATE ROLE yaoc2 LOGIN PASSWORD :'openclaw_db_password';
  END IF;
END
$$;

CREATE DATABASE yaoc2 OWNER yaoc2;

-- Connect to yaoc2 database for schema creation
\connect yaoc2

-- ============================================================
-- n8n gateway schema (n8n stores its tables here)
-- ============================================================
CREATE SCHEMA IF NOT EXISTS n8n_gateway AUTHORIZATION yaoc2;

-- ============================================================
-- Policy sets table
-- Mirrors the YAML files in policies/policy-sets/ for runtime
-- edits without redeployment
-- ============================================================
CREATE TABLE IF NOT EXISTS yaoc2.policy_sets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  version     TEXT NOT NULL,
  description TEXT,
  defaults    JSONB NOT NULL DEFAULT '{}',
  rules       JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_sets_name ON yaoc2.policy_sets (name);

-- ============================================================
-- Audit log table
-- Every ProposedAction, decision, and result is recorded here
-- ============================================================
CREATE TABLE IF NOT EXISTS yaoc2.audit_log (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposed_action_id  UUID NOT NULL,
  timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Requester
  user_id             TEXT,
  display_name        TEXT,
  channel             TEXT,
  tenant              TEXT,

  -- Action
  action_type         TEXT,
  action_name         TEXT,
  target_system       TEXT,
  action_mode         TEXT,
  risk_level          TEXT,

  -- Decision
  policy_set          TEXT,
  decision            TEXT NOT NULL,   -- allow | deny | needs-approval
  approver_id         TEXT,
  approved_at         TIMESTAMPTZ,

  -- Result
  final_status        TEXT,            -- executed | denied | pending-approval | failed
  result_summary      TEXT,
  raw_result_ref      TEXT,

  -- Full payload (for debugging/forensics)
  proposed_action_raw JSONB,
  result_raw          JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_log_proposed_action_id ON yaoc2.audit_log (proposed_action_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp          ON yaoc2.audit_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id            ON yaoc2.audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_name        ON yaoc2.audit_log (action_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_decision           ON yaoc2.audit_log (decision);

-- ============================================================
-- Seed default-threatlab policy set
-- (mirrors policies/policy-sets/default-threatlab.yaml)
-- ============================================================
INSERT INTO yaoc2.policy_sets (name, version, description, defaults, rules)
VALUES (
  'default-threatlab',
  '2026.03.1',
  'Default policy set for the threatlabs CTI homelab environment.',
  '{
    "max_cost_units": 20,
    "auto_allow_low_risk": true,
    "auto_deny_critical_without_approval": true,
    "default_approval_role": "threat-analyst"
  }',
  '[
    {
      "id": "read-only-always-allow",
      "description": "Any read-only operation is auto-allowed.",
      "match": { "mode": "read-only", "target_system": "*", "action_name": "*" },
      "decision": "allow"
    },
    {
      "id": "misp-opencti-medium-write",
      "description": "Medium-risk MISP/OpenCTI writes need analyst approval.",
      "match": { "target_system": "misp-opencti", "action_name": "ioc_enrichment_misp_opencti", "mode": "read-write", "min_risk_level": "medium" },
      "decision": "needs-approval",
      "approvers": { "role": "threat-analyst", "count": 1 }
    },
    {
      "id": "thehive-case-create",
      "description": "Creating a TheHive case requires analyst approval.",
      "match": { "target_system": "thehive", "action_name": "case_create_thehive", "mode": "read-write" },
      "decision": "needs-approval",
      "approvers": { "role": "threat-analyst", "count": 1 }
    },
    {
      "id": "thehive-admin-block",
      "description": "Admin TheHive ops are denied in default policy.",
      "match": { "target_system": "thehive", "mode": "admin" },
      "decision": "deny"
    },
    {
      "id": "shuffle-soar",
      "description": "Shuffle playbook triggers always need soc-lead approval.",
      "match": { "target_system": "shuffle", "action_name": "*" },
      "decision": "needs-approval",
      "approvers": { "role": "soc-lead", "count": 1 }
    },
    {
      "id": "critical-deny-all",
      "description": "Critical risk actions are denied.",
      "match": { "min_risk_level": "critical", "target_system": "*", "action_name": "*" },
      "decision": "deny"
    }
  ]'
) ON CONFLICT (name) DO NOTHING;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA yaoc2 TO yaoc2;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA yaoc2 TO yaoc2;
