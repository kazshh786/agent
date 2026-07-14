const {
  requireAuth,
  requirePlatformRole,
  errorResponse,
  handleCors,
} = require('../_utils');

const ALL_PLATFORM_ROLES = ['platform_owner', 'platform_admin', 'platform_support'];

module.exports = async function (req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed');
  }

  try {
    const auth = await requireAuth(req);
    if (auth.error) {
      return errorResponse(res, auth.status, auth.error, 'Authentication required');
    }

    const { user, supabase } = auth;

    const roleCheck = await requirePlatformRole(supabase, user.id, ALL_PLATFORM_ROLES);
    if (roleCheck.error) {
      return errorResponse(res, roleCheck.status, roleCheck.error, 'Platform access denied');
    }

    // Determine permitted modes
    const { data: memberships } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1);

    const hasWorkspaces = memberships && memberships.length > 0;

    const permittedModes = ['agency'];
    if (hasWorkspaces) permittedModes.push('customer');

    return res.status(200).json({
      platformRole: roleCheck.platformRole,
      isActive: true,
      permittedModes,
    });
  } catch {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
