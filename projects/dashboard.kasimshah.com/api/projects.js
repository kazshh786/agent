const {
  requireAuth,
  requireWorkspaceMember,
  requireWorkspaceRole,
  validateBody,
  writeAuditLog,
  errorResponse,
  handleCors,
} = require('./_utils');

const ALLOWED_PROJECT_TYPES = ['website', 'landing_page', 'funnel', 'social_campaign'];
const PATH_TRAVERSAL_REGEX = /\.\.|[/\\]/;

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
  const workspaceId = req.headers['x-workspace-id'];

  if (!workspaceId) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'X-Workspace-Id header is required');
  }

  // Check membership
  const membership = await requireWorkspaceMember(supabase, user.id, workspaceId);
  if (membership.error) {
    return errorResponse(res, membership.status, membership.error, 'You are not a member of this workspace');
  }

  const { data: projects, error } = await supabase
    .from('projects')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (error) {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch projects');
  }

  return res.status(200).json({ projects: projects || [] });
}

async function handlePost(req, res) {
  const auth = await requireAuth(req);
  if (auth.error) {
    return errorResponse(res, auth.status, auth.error, 'Authentication required');
  }

  const { user, supabase } = auth;
  const workspaceId = req.headers['x-workspace-id'];

  if (!workspaceId) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'X-Workspace-Id header is required');
  }

  // Check role
  const roleCheck = await requireWorkspaceRole(supabase, user.id, workspaceId, [
    'owner',
    'admin',
    'editor',
  ]);
  if (roleCheck.error) {
    return errorResponse(res, roleCheck.status, roleCheck.error, 'Insufficient permissions');
  }

  // Validate required fields
  const validation = validateBody(req.body, ['name', 'type']);
  if (!validation.valid) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      `Missing required fields: ${validation.missing.join(', ')}`
    );
  }

  const { name, type } = req.body;

  // Validate project type
  if (!ALLOWED_PROJECT_TYPES.includes(type)) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      `Invalid project type. Must be one of: ${ALLOWED_PROJECT_TYPES.join(', ')}`
    );
  }

  // Validate name: 2-200 chars, no path traversal
  if (name.trim().length < 2 || name.trim().length > 200) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      'Project name must be between 2 and 200 characters'
    );
  }

  if (PATH_TRAVERSAL_REGEX.test(name)) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      'Project name contains invalid characters'
    );
  }

  // Insert project
  const { data: project, error } = await supabase
    .from('projects')
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      type,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to create project');
  }

  // Audit log
  await writeAuditLog(supabase, {
    workspaceId,
    actorId: user.id,
    action: 'project.created',
    entityType: 'project',
    entityId: project.id,
    metadata: { name: name.trim(), type },
  });

  return res.status(201).json({ project });
}
