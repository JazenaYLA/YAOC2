// YAOC2 Policy Gateway — map-to-sandbox.js
// Paste into the "Map to Sandbox Workflow" Code node.
// Input:  item with ProposedAction + item._gateway.decision = 'allow'
// Output: adds item._gateway.sandbox_workflow_name (string)
//         The Execute Workflow node uses this name to call the correct sandbox.

// Map action.name → sandbox workflow name (as imported in this n8n instance)
// Update these values to match the actual workflow names after import.
const SANDBOX_MAP = {
  'ioc_enrichment_misp_opencti':  'YAOC2 Sandbox — MISP Enrich + OpenCTI Sync',
  'opencti_sync':                 'YAOC2 Sandbox — OpenCTI Sync',
  'case_create_thehive':          'YAOC2 Sandbox — TheHive Case Create',
  // Add more as you build them:
  // 'alert_create_thehive':      'YAOC2 Sandbox — TheHive Alert Create',
  // 'shuffle_trigger':           'YAOC2 Sandbox — Shuffle Trigger',
  // 'flowise_query':             'YAOC2 Sandbox — Flowise Query',
};

const item       = $input.item.json;
const actionName = item.action?.name;

if (!actionName) {
  throw new Error('action.name is missing — cannot map to sandbox');
}

const sandboxWorkflow = SANDBOX_MAP[actionName];

if (!sandboxWorkflow) {
  throw new Error(`No sandbox mapped for action.name: ${actionName}. Add it to SANDBOX_MAP in map-to-sandbox.js`);
}

return [{
  json: {
    ...item,
    _gateway: {
      ...item._gateway,
      sandbox_workflow_name: sandboxWorkflow,
      // Pass only sanitised action.parameters to the sandbox — not the full ProposedAction
      sandbox_input: item.action.parameters ?? {},
    }
  }
}];
