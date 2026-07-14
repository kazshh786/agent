const {
  requireAuth,
  errorResponse,
  handleCors,
} = require('./_utils');

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

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return errorResponse(res, 404, 'NOT_FOUND', 'User profile not found');
    }

    // Fetch user's workspaces
    const { data: memberships, error: memberError } = await supabase
      .from('workspace_members')
      .select('role, workspace_id, workspaces(id, name, slug, created_at)')
      .eq('user_id', user.id);

    if (memberError) {
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch workspaces');
    }

    const workspaces = (memberships || []).map((m) => ({
      ...m.workspaces,
      role: m.role,
    }));

    return res.status(200).json({
      user: {
        id: profile.id,
        email: user.email,
        fullName: profile.full_name,
        avatarUrl: profile.avatar_url,
      },
      workspaces,
    });
  } catch {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
