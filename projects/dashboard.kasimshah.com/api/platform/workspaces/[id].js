const {
  requireAuth,
  requirePlatformRole,
  validateBody,
  validateUUID,
  rejectUnknownFields,
  errorResponse,
  handleCors,
} = require('../../_utils');

const ALL_PLATFORM_ROLES = ['platform_owner', 'platform_admin', 'platform_support'];
const LIFECYCLE_ROLES = ['platform_owner', 'platform_admin'];

const ACTION_RPC_MAP = {
  activate: 'activate_workspace',
  suspend: 'suspend_workspace',
  archive: 'archive_workspace',
  retry: 'retry_workspace_provisioning',
};

module.exports = async function (req, res) {
  if (handleCors(req, res)) return;

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res);
    }
    if (req.method === 'PATCH') {
      return await handlePatch(req, res);
    }

    res.setHeader('Allow', 'GET, PATCH');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and PATCH are allowed');
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
  const id = req.query.id;

  if (!validateUUID(id)) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid workspace ID format');
  }

  const roleCheck = await requirePlatformRole(supabase, user.id, ALL_PLATFORM_ROLES);
  if (roleCheck.error) {
    return errorResponse(res, roleCheck.status, roleCheck.error, 'Platform access denied');
  }

  const { data: workspace, error } = await supabase
    .from('workspaces')
    .select('*, workspace_modules(*)')
    .eq('id', id)
    .single();

  if (error || !workspace) {
    return errorResponse(res, 404, 'NOT_FOUND', 'Workspace not found');
  }

  const isSupportOnly = roleCheck.platformRole === 'platform_support';

  if (isSupportOnly) {
    return res.status(200).json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        status: workspace.status,
        customer_name: workspace.customer_name,
        provisioned_at: workspace.provisioned_at,
        modules: (workspace.workspace_modules || []).map((m) => ({
          module: m.module,
          enabled: m.enabled,
        })),
      },
    });
  }

  const result = { ...workspace, modules: workspace.workspace_modules || [] };
  delete result.workspace_modules;

  return res.status(200).json({ workspace: result });
}

async function handlePatch(req, res) {
  const auth = await requireAuth(req);
  if (auth.error) {
    return errorResponse(res, auth.status, auth.error, 'Authentication required');
  }

  const { user, supabase } = auth;
  const id = req.query.id;

  if (!validateUUID(id)) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid workspace ID format');
  }

  const roleCheck = await requirePlatformRole(supabase, user.id, LIFECYCLE_ROLES);
  if (roleCheck.error) {
    return errorResponse(res, roleCheck.status, roleCheck.error, 'Platform access denied');
  }

  // Validate required fields
  const validation = validateBody(req.body, ['action']);
  if (!validation.valid) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      `Missing required fields: ${validation.missing.join(', ')}`
    );
  }

  // Reject unknown fields
  const fieldCheck = rejectUnknownFields(req.body, ['action']);
  if (!fieldCheck.valid) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      `Unknown fields: ${fieldCheck.unknown.join(', ')}`
    );
  }

  const { action } = req.body;
  const rpcName = ACTION_RPC_MAP[action];

  if (!rpcName) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      `Invalid action. Allowed: ${Object.keys(ACTION_RPC_MAP).join(', ')}`
    );
  }

  const { error } = await supabase.rpc(rpcName, { p_workspace_id: id });

  if (error) {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to perform workspace action');
  }

  return res.status(200).json({ success: true, action });
}
