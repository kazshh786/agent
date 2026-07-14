const { 
  requireAuth, 
  validateBody, 
  errorResponse, 
  validateUUID,
  rejectUnknownFields
} = require('../../_utils.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }
  
  res.setHeader('Cache-Control', 'no-store');

  const { supabase, error, status } = await requireAuth(req);
  if (error) {
    return errorResponse(res, status, error, 'Unauthorized');
  }

  const { valid, missing } = validateBody(req.body, ['invitationId']);
  if (!valid) {
    return errorResponse(res, 400, 'BAD_REQUEST', 'Missing invitationId');
  }

  const { valid: fieldsValid } = rejectUnknownFields(req.body, ['invitationId']);
  if (!fieldsValid) {
    return errorResponse(res, 400, 'BAD_REQUEST', 'Unknown fields detected');
  }

  const { invitationId } = req.body;
  if (!validateUUID(invitationId)) {
    return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid invitation ID');
  }

  try {
    const { error: rpcError } = await supabase.rpc('revoke_workspace_invitation', {
      p_invitation_id: invitationId
    });

    if (rpcError) {
      console.error('[revoke_invitation] RPC Error:', rpcError.message);
      return errorResponse(res, 403, 'FORBIDDEN', 'Unauthorized or invalid request');
    }

    return res.status(200).json({ status: 'REVOKED' });
  } catch (err) {
    console.error('[revoke_invitation] Error:', err.message);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
