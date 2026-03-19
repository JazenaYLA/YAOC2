// YAOC2 Brain — build-proposed-action.js
// Paste into the "Build ProposedAction" Code node in the brain workflow.
// Input:  item with:
//   item.llm_output  — structured object from LLM reasoning node
//   item.session_id  — conversation/session identifier
//   item.user        — { user_id, display_name, channel, tenant }
// Output: valid ProposedAction JSON ready to POST to gateway

const { v4: uuidv4 } = require('uuid');  // n8n ships uuid

const llm     = $input.item.json.llm_output;
const session = $input.item.json.session_id;
const user    = $input.item.json.user;

// Risk scoring — deterministic, not LLM-assigned
// LLM output must include action.mode and action.target_system;
// risk level is derived here from those values, never from free text.
const RISK_MAP = {
  'read-only':  'low',
  'read-write': 'medium',
  'admin':      'high',
};

const HIGH_RISK_SYSTEMS = ['shuffle', 'xtm', 'dfir-iris'];

function deriveRiskLevel(mode, targetSystem) {
  let level = RISK_MAP[mode] ?? 'medium';
  if (HIGH_RISK_SYSTEMS.includes(targetSystem)) {
    // Bump risk one level for high-risk systems
    const order = ['low', 'medium', 'high', 'critical'];
    const idx = order.indexOf(level);
    if (idx < order.length - 1) level = order[idx + 1];
  }
  return level;
}

// Sanitise parameters — strip any key whose value is a string > 500 chars
function sanitiseParams(params) {
  if (!params || typeof params !== 'object') return {};
  const safe = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v.length > 500) continue;  // drop — likely prompt leakage
    safe[k] = v;
  }
  return safe;
}

const mode         = llm.action?.mode ?? 'read-only';
const targetSystem = llm.action?.target_system ?? 'unknown';
const riskLevel    = deriveRiskLevel(mode, targetSystem);

const proposedAction = {
  id:        uuidv4(),
  timestamp: new Date().toISOString(),

  agent: {
    name:       'yaoc2-threat-analyst',
    version:    '2026.03.1',
    session_id: session,
  },

  requester: {
    user_id:      user.user_id,
    display_name: user.display_name,
    channel:      user.channel,
    tenant:       user.tenant ?? 'threatlabs',
  },

  intent: {
    title:       llm.intent?.title       ?? 'Agent action',
    description: llm.intent?.description ?? '',
    user_prompt: $input.item.json.user_message ?? '',
  },

  action: {
    type:          llm.action?.type          ?? 'workflow',
    name:          llm.action?.name,
    target_system: targetSystem,
    mode:          mode,
    parameters:    sanitiseParams(llm.action?.parameters),
  },

  risk: {
    level:            riskLevel,
    reasons:          llm.risk_reasons ?? [],
    estimated_impact: llm.estimated_impact ?? '',
  },

  constraints: {
    must_complete_before: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // +2h
    max_cost_units:       20,
    dry_run:              false,
  },

  policy: {
    policy_set:         process.env.DEFAULT_POLICY_SET ?? 'default-threatlab',
    required_approvals: [],
  },

  llm_explanation: {
    reasoning_summary:       llm.reasoning_summary       ?? '',
    alternatives_considered: llm.alternatives_considered ?? [],
  },
};

return [{ json: { proposed_action: proposedAction } }];
