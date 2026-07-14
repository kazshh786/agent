const { 
  validateBody, 
  errorResponse, 
  createSupabaseServiceClient,
  rejectUnknownFields
} = require('../../_utils.js');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }
  
  res.setHeader('Cache-Control', 'no-store');

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
    // Avoid revealing token validation specifics to attackers, just return generic error
    return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid token');
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const serviceClient = createSupabaseServiceClient();

    // Query invitation using service role since anon has no access
    const { data: invitation, error: invError } = await serviceClient
      .from('workspace_invitations')
      .select('status, expires_at, role, workspace_id')
      .eq('token_hash', tokenHash)
      .single();

    if (invError || !invitation) {
      // Must not reveal complete internal errors
      return errorResponse(res, 404, 'NOT_FOUND', 'Invitation not found or invalid');
    }

    // Determine validity category
    let validityCategory = 'valid';
    if (invitation.status !== 'pending') {
      validityCategory = invitation.status; // 'accepted', 'revoked', 'expired'
    } else if (new Date(invitation.expires_at) < new Date()) {
      validityCategory = 'expired';
    }

    let workspaceName = 'Workspace';
    if (invitation.workspace_id) {
      const { data: workspace } = await serviceClient
        .from('workspaces')
        .select('name')
        .eq('id', invitation.workspace_id)
        .single();
      if (workspace && workspace.name) {
        workspaceName = workspace.name;
      }
    }

    return res.status(200).json({
      validityCategory,
      workspaceName,
      role: invitation.role,
      expiresAt: invitation.expires_at
    });

  } catch (err) {
    console.error('[inspect_invitation] Error:', err.message);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
