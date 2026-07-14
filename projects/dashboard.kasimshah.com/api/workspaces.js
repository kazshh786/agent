const {
  requireAuth,
  validateBody,
  writeAuditLog,
  errorResponse,
  handleCors,
} = require('./_utils');

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

module.exports = async function (req, res) {
  if (handleCors(req, res)) return;

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res);
    }
    if (req.method === 'POST') {
      return await handlePost(req, res);
    }

    res.setHeader('Allow', 'GET, POST');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are allowed');
  } catch {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};

async function handleGet(req, res) {
  const auth = await requireAuth(req);
  if (auth.error) {
    return errorResponse(res, auth.status, auth.error, 'Authentication required');
  }

  const { user, supabase } = auth;

  const { data: memberships, error } = await supabase
    .from('workspace_members')
    .select('role, workspace_id, workspaces(id, name, slug, created_at)')
    .eq('user_id', user.id);

  if (error) {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch workspaces');
  }

  const workspaces = (memberships || []).map((m) => ({
    ...m.workspaces,
    role: m.role,
  }));

  return res.status(200).json({ workspaces });
}

async function handlePost(req, res) {
  return errorResponse(res, 403, 'FORBIDDEN', 'Workspace creation is managed by Kasim Shah Agency. Contact support for assistance.');
}
