const { 
  requireAuth, 
  validateBody, 
  errorResponse, 
  rejectUnknownFields
} = require('../../_utils.js');
const crypto = require('crypto');

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

  const { valid, missing } = validateBody(req.body, ['token']);
  if (!valid) {
    return errorResponse(res, 400, 'BAD_REQUEST', 'Missing token');
  }

  const { valid: fieldsValid } = rejectUnknownFields(req.body, ['token']);
  if (!fieldsValid) {
    return errorResponse(res, 400, 'BAD_REQUEST', 'Unknown fields detected');
  }

  const { token } = req.body;
  if (typeof token !== 'string' || token.length < 32 || token.length > 64) {
    return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid token');
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { data: workspaceId, error: rpcError } = await supabase.rpc('accept_workspace_invitation', {
      p_token_hash: tokenHash
    });

    if (rpcError) {
      console.error('[accept_invitation] RPC Error:', rpcError.message);
      // Mask internal database errors and exact rejection reasons for security
      return errorResponse(res, 403, 'FORBIDDEN', 'Invitation is invalid, expired, or cannot be accepted by this user.');
    }

    return res.status(200).json({ status: 'ACCEPTED', workspaceId });
  } catch (err) {
    console.error('[accept_invitation] Error:', err.message);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
