// YAOC2 Policy Gateway — normalise-response.js
// Paste into the "Normalise Response" Code node.
// Input:  item with ProposedAction + item._gateway + item._sandbox_result
// Output: standard response object + audit log insert payload

const item           = $input.item.json;
const gateway        = item._gateway ?? {};
const sandboxResult  = item._sandbox_result ?? {};

// Determine final status
let finalStatus;
if (gateway.decision === 'deny') {
  finalStatus = 'denied';
} else if (sandboxResult.status === 'success') {
  finalStatus = 'executed';
} else if (sandboxResult.status === 'partial') {
  finalStatus = 'executed';  // partial success still counts as executed
} else if (!sandboxResult.status) {
  finalStatus = 'pending-approval';
} else {
  finalStatus = 'failed';
}

// Build the response the brain receives
const response = {
  proposed_action_id: item.id,
  final_status:       finalStatus,
  result_summary:     sandboxResult.result_summary ?? gateway.deny_reason ?? 'No result',
  raw_result_ref:     sandboxResult.raw_result_ref  ?? null,
};

// Build the audit log record to INSERT (pass to Postgres node)
const auditRecord = {
  proposed_action_id: item.id,
  timestamp:          new Date().toISOString(),
  user_id:            item.requester?.user_id,
  display_name:       item.requester?.display_name,
  channel:            item.requester?.channel,
  tenant:             item.requester?.tenant,
  action_type:        item.action?.type,
  action_name:        item.action?.name,
  target_system:      item.action?.target_system,
  action_mode:        item.action?.mode,
  risk_level:         item.risk?.level,
  policy_set:         item.policy?.policy_set,
  decision:           gateway.decision,
  approver_id:        gateway.approver_id   ?? null,
  approved_at:        gateway.approved_at   ?? null,
  final_status:       finalStatus,
  result_summary:     response.result_summary,
  raw_result_ref:     response.raw_result_ref,
  proposed_action_raw: JSON.stringify(item),
  result_raw:         JSON.stringify(sandboxResult),
};

return [{
  json: {
    response,
    audit_record: auditRecord,
  }
}];
