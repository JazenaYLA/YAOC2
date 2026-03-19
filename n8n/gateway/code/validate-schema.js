// YAOC2 Policy Gateway — validate-schema.js
// Paste into the "Validate Schema" Code node (runs once per item).
// Input:  raw webhook body (ProposedAction)
// Output: adds item.valid (bool) and item.errors (string[])
//         Strips unknown top-level keys.

const REQUIRED_TOP = ['id', 'timestamp', 'agent', 'requester', 'intent', 'action', 'risk', 'policy'];
const REQUIRED_REQUESTER = ['user_id', 'channel', 'tenant'];
const REQUIRED_ACTION = ['type', 'name', 'target_system', 'mode'];
const REQUIRED_RISK = ['level'];
const REQUIRED_POLICY = ['policy_set'];

const VALID_ACTION_TYPES = ['workflow', 'http_call', 'shell', 'external_soar'];
const VALID_MODES        = ['read-only', 'read-write', 'admin'];
const VALID_RISK_LEVELS  = ['low', 'medium', 'high', 'critical'];
const VALID_CHANNELS     = ['telegram', 'discord', 'web', 'api'];

// Allowed top-level keys (strip everything else)
const ALLOWED_TOP = new Set([
  'id', 'timestamp', 'agent', 'requester', 'intent',
  'action', 'risk', 'constraints', 'policy', 'llm_explanation'
]);

const errors = [];
const body   = $input.item.json;

// --- Strip unknown top-level keys ---
const stripped = {};
for (const key of Object.keys(body)) {
  if (ALLOWED_TOP.has(key)) stripped[key] = body[key];
}

// --- Required top-level fields ---
for (const field of REQUIRED_TOP) {
  if (!stripped[field]) errors.push(`Missing required field: ${field}`);
}

// --- id: must look like a UUID ---
if (stripped.id && !/^[0-9a-f-]{36}$/i.test(stripped.id)) {
  errors.push('Field id must be a UUID v4 string');
}

// --- requester ---
if (stripped.requester) {
  for (const f of REQUIRED_REQUESTER) {
    if (!stripped.requester[f]) errors.push(`Missing requester.${f}`);
  }
  if (stripped.requester.channel && !VALID_CHANNELS.includes(stripped.requester.channel)) {
    errors.push(`requester.channel must be one of: ${VALID_CHANNELS.join(', ')}`);
  }
}

// --- action ---
if (stripped.action) {
  for (const f of REQUIRED_ACTION) {
    if (!stripped.action[f]) errors.push(`Missing action.${f}`);
  }
  if (stripped.action.type && !VALID_ACTION_TYPES.includes(stripped.action.type)) {
    errors.push(`action.type must be one of: ${VALID_ACTION_TYPES.join(', ')}`);
  }
  if (stripped.action.mode && !VALID_MODES.includes(stripped.action.mode)) {
    errors.push(`action.mode must be one of: ${VALID_MODES.join(', ')}`);
  }
  // Sanitise parameters — reject if any value is a raw prompt string (>500 chars)
  if (stripped.action.parameters) {
    for (const [k, v] of Object.entries(stripped.action.parameters)) {
      if (typeof v === 'string' && v.length > 500) {
        errors.push(`action.parameters.${k} exceeds 500 chars — raw prompt injection suspected`);
      }
    }
  }
}

// --- risk ---
if (stripped.risk) {
  for (const f of REQUIRED_RISK) {
    if (!stripped.risk[f]) errors.push(`Missing risk.${f}`);
  }
  if (stripped.risk.level && !VALID_RISK_LEVELS.includes(stripped.risk.level)) {
    errors.push(`risk.level must be one of: ${VALID_RISK_LEVELS.join(', ')}`);
  }
}

// --- policy ---
if (stripped.policy) {
  for (const f of REQUIRED_POLICY) {
    if (!stripped.policy[f]) errors.push(`Missing policy.${f}`);
  }
}

return [{
  json: {
    ...stripped,
    _gateway: {
      valid:  errors.length === 0,
      errors: errors,
    }
  }
}];
