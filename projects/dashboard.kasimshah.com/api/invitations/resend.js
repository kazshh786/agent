const { 
  requireAuth, 
  validateBody, 
  errorResponse, 
  validateUUID,
  rejectUnknownFields,
  createSupabaseServiceClient
} = require('../../_utils.js');
const { sendInvitationEmail } = require('../../_email.js');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }
  
  res.setHeader('Cache-Control', 'no-store');

  const { user, supabase, error, status } = await requireAuth(req);
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
    // Generate new raw token
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const { error: rpcError } = await supabase.rpc('resend_workspace_invitation', {
      p_invitation_id: invitationId,
      p_new_token_hash: tokenHash,
      p_new_expires_at: expiresAt
    });

    if (rpcError) {
      console.error('[resend_invitation] RPC Error:', rpcError.message);
      return errorResponse(res, 403, 'FORBIDDEN', 'Unauthorized or invalid request');
    }

    // Retrieve email details for resend
    const serviceClient = createSupabaseServiceClient();
    const { data: invData } = await serviceClient
      .from('workspace_invitations')
      .select('email, role, workspace_id')
      .eq('id', invitationId)
      .single();

    if (!invData) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Invitation not found');
    }

    const { data: workspace } = await serviceClient
      .from('workspaces')
      .select('name')
      .eq('id', invData.workspace_id)
      .single();

    const workspaceName = workspace ? workspace.name : 'your agency';
    
    const host = req.headers.host || 'dashboard.kasimshah.com';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const inviteLink = `${protocol}://${host}/?invite=${rawToken}`;

    const deliveryResult = await sendInvitationEmail({
      to: invData.email,
      role: invData.role,
      workspaceName,
      inviteLink
    });

    if (deliveryResult.status === 'DELIVERY_FAILED') {
      return res.status(200).json({ status: 'DELIVERY_FAILED', message: 'Invitation regenerated but email failed to send.' });
    }

    if (deliveryResult.status === 'DELIVERY_NOT_CONFIGURED') {
      const { data: platformUser } = await serviceClient
        .from('platform_users')
        .select('role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();
        
      if (platformUser && ['platform_owner', 'platform_admin'].includes(platformUser.role)) {
        return res.status(200).json({
          status: 'DELIVERY_NOT_CONFIGURED',
          message: 'Email delivery is not configured',
          inviteLink: deliveryResult.inviteLink 
        });
      } else {
        return res.status(200).json({
          status: 'DELIVERY_NOT_CONFIGURED',
          message: 'Email delivery is not configured'
        });
      }
    }

    return res.status(200).json({ status: 'RESENT', message: 'Invitation resent successfully' });

  } catch (err) {
    console.error('[resend_invitation] Error:', err.message);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
