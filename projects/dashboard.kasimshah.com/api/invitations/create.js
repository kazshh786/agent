const { 
  requireAuth, 
  validateBody, 
  errorResponse, 
  createSupabaseServerClient, 
  createSupabaseServiceClient,
  rejectUnknownFields,
  validateUUID
} = require('../_utils.js');
const { sendInvitationEmail } = require('../_email.js');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  // CORS handles in vercel.json or _utils.js. Let's assume standard handling.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }
  
  res.setHeader('Cache-Control', 'no-store');

  const { user, supabase, error, status } = await requireAuth(req);
  if (error) {
    return errorResponse(res, status, error, 'Unauthorized');
  }

  const { valid, missing } = validateBody(req.body, ['workspaceId', 'email', 'role']);
  if (!valid) {
    return errorResponse(res, 400, 'BAD_REQUEST', `Missing fields: ${missing.join(', ')}`);
  }

  const { valid: fieldsValid, unknown } = rejectUnknownFields(req.body, ['workspaceId', 'email', 'role']);
  if (!fieldsValid) {
    return errorResponse(res, 400, 'BAD_REQUEST', 'Unknown fields detected');
  }

  const { workspaceId, email, role } = req.body;

  if (!validateUUID(workspaceId)) {
    return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid workspace ID');
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid email format');
  }

  if (!['owner', 'admin', 'editor', 'viewer'].includes(role)) {
    return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid role');
  }

  try {
    // Generate raw token
    const rawToken = crypto.randomBytes(32).toString('base64url');
    // Hash token server-side (SHA-256)
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    
    // Set expiry (72 hours)
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    // Call securely over RPC via the caller's auth context (to apply RLS and role checks)
    const { data: invitationId, error: rpcError } = await supabase.rpc('create_workspace_invitation', {
      p_workspace_id: workspaceId,
      p_email: normalizedEmail,
      p_role: role,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt
    });

    if (rpcError) {
      console.error('[create_invitation] RPC Error:', rpcError.message);
      // Generic public error
      return errorResponse(res, 403, 'FORBIDDEN', 'Unauthorized or invalid request');
    }

    // Get Workspace Name for the email
    const serviceClient = createSupabaseServiceClient();
    const { data: workspace } = await serviceClient
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single();

    const workspaceName = workspace ? workspace.name : 'your agency';
    
    const host = req.headers.host || 'dashboard.kasimshah.com';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const inviteLink = `${protocol}://${host}/?invite=${rawToken}`;

    const deliveryResult = await sendInvitationEmail({
      to: normalizedEmail,
      role,
      workspaceName,
      inviteLink
    });

    if (deliveryResult.status === 'DELIVERY_FAILED') {
      // Return 200 but specify failed delivery. The audit log is handled by the provider/webhook, but we can return it.
      return res.status(200).json({ status: 'DELIVERY_FAILED', message: 'Invitation created but email failed to send.' });
    }

    if (deliveryResult.status === 'DELIVERY_NOT_CONFIGURED') {
      // Check if user is platform admin/owner to safely return link
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
          inviteLink: deliveryResult.inviteLink // Safe to expose ONLY to platform admins
        });
      } else {
        return res.status(200).json({
          status: 'DELIVERY_NOT_CONFIGURED',
          message: 'Email delivery is not configured'
        });
      }
    }

    return res.status(200).json({ status: 'SENT', message: 'Invitation sent successfully' });

  } catch (err) {
    console.error('[create_invitation] Error:', err.message);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
