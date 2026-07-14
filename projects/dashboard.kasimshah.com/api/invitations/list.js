const { 
  requireAuth, 
  errorResponse, 
  validateUUID,
  createSupabaseServiceClient,
  requireWorkspaceMember,
  requirePlatformRole
} = require('../../_utils.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }
  
  res.setHeader('Cache-Control', 'no-store');

  const { user, supabase, error, status } = await requireAuth(req);
  if (error) {
    return errorResponse(res, status, error, 'Unauthorized');
  }

  const { workspaceId } = req.query;

  if (!validateUUID(workspaceId)) {
    return errorResponse(res, 400, 'BAD_REQUEST', 'Invalid workspace ID');
  }

  try {
    // We need to check if the user is a platform admin OR a workspace admin/owner.
    let isPlatformAdmin = false;
    const { platformRole } = await requirePlatformRole(supabase, user.id, ['platform_owner', 'platform_admin']);
    if (platformRole) isPlatformAdmin = true;
    
    let isWorkspaceAdmin = false;
    const { member } = await requireWorkspaceMember(supabase, user.id, workspaceId);
    if (member && ['owner', 'admin'].includes(member.role)) isWorkspaceAdmin = true;

    if (!isPlatformAdmin && !isWorkspaceAdmin) {
      return errorResponse(res, 403, 'FORBIDDEN', 'You do not have permission to list invitations for this workspace');
    }

    const serviceClient = createSupabaseServiceClient();
    
    // We explicitly exclude token_hash and other sensitive fields
    const { data: invitations, error: dbError } = await serviceClient
      .from('workspace_invitations')
      .select('id, email, role, status, expires_at, created_at, accepted_at, revoked_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('[list_invitations] DB Error:', dbError.message);
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to retrieve invitations');
    }

    return res.status(200).json({ invitations });
  } catch (err) {
    console.error('[list_invitations] Error:', err.message);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
