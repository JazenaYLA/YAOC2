// YAOC2 Policy Gateway — evaluate-policy.js
// Paste into the "Evaluate Policy" Code node.
// Input:  item with ProposedAction + item._gateway.valid=true
//         + item._policy_rules (array of rules loaded from Postgres)
// Output: adds item._gateway.decision ('allow'|'deny'|'needs-approval')
//         and item._gateway.approvers (array|null)

const RISK_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

const item         = $input.item.json;
const action       = item.action;
const requester    = item.requester;
const risk         = item.risk;
const policySet    = item._policy_set;   // loaded from Postgres by prior node
const rules        = policySet?.rules ?? [];
const defaults     = policySet?.defaults ?? {};

// Wildcard matcher — rule value '*' matches anything
function matches(ruleVal, actualVal) {
  if (!ruleVal || ruleVal === '*') return true;
  return ruleVal === actualVal;
}

// min_risk_level matcher — actual risk must be >= rule threshold
function meetsRiskThreshold(ruleMinLevel, actualLevel) {
  if (!ruleMinLevel) return true;
  return RISK_ORDER[actualLevel] >= RISK_ORDER[ruleMinLevel];
}

function matchesRule(rule, action, requester, risk) {
  const m = rule.match || {};
  return (
    matches(m.target_system, action.target_system) &&
    matches(m.action_name,   action.name) &&
    matches(m.mode,          action.mode) &&
    matches(m.channel,       requester.channel) &&
    matches(m.tenant,        requester.tenant) &&
    meetsRiskThreshold(m.min_risk_level, risk.level)
  );
}

// Evaluate rules — first match wins
let decision  = null;
let approvers = null;
let matchedRule = null;

for (const rule of rules) {
  if (matchesRule(rule, action, requester, risk)) {
    decision    = rule.decision;
    approvers   = rule.approvers ?? null;
    matchedRule = rule.id;
    break;
  }
}

// Fall back to policy defaults
if (!decision) {
  const level = risk.level;
  if (level === 'low' && defaults.auto_allow_low_risk) {
    decision = 'allow';
    matchedRule = '__default_low_allow';
  } else if (level === 'critical' && defaults.auto_deny_critical_without_approval) {
    decision = 'deny';
    matchedRule = '__default_critical_deny';
  } else {
    decision = 'needs-approval';
    approvers = { role: defaults.default_approval_role ?? 'threat-analyst', count: 1 };
    matchedRule = '__default_needs_approval';
  }
}

return [{
  json: {
    ...item,
    _gateway: {
      ...item._gateway,
      decision,
      approvers,
      matched_rule: matchedRule,
    }
  }
}];
