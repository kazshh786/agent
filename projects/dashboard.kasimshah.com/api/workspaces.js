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
  const auth = await requireAuth(req);
  if (auth.error) {
    return errorResponse(res, auth.status, auth.error, 'Authentication required');
  }

  const { user, supabase } = auth;

  // Validate required fields
  const validation = validateBody(req.body, ['name', 'slug']);
  if (!validation.valid) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      `Missing required fields: ${validation.missing.join(', ')}`
    );
  }

  const { name, slug } = req.body;

  // Validate slug format
  if (!SLUG_REGEX.test(slug)) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      'Slug must be 3-63 characters, lowercase alphanumeric and hyphens, must start and end with alphanumeric'
    );
  }

  // Validate name length
  if (name.trim().length < 2 || name.trim().length > 100) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      'Workspace name must be between 2 and 100 characters'
    );
  }

  // Create workspace via RPC
  const { data: workspace, error } = await supabase.rpc('create_workspace_with_owner', {
    p_name: name.trim(),
    p_slug: slug,
  });

  if (error) {
    // Handle unique constraint violations
    if (error.code === '23505' || error.message?.toLowerCase().includes('unique')) {
      return errorResponse(res, 409, 'CONFLICT', 'A workspace with this slug already exists');
    }
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to create workspace');
  }

  return res.status(201).json({ workspace });
}
