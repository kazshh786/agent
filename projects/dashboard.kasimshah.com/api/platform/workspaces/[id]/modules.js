const {
  requireAuth,
  requirePlatformRole,
  validateBody,
  validateUUID,
  rejectUnknownFields,
  errorResponse,
  handleCors,
} = require('../../../_utils');

const ALL_PLATFORM_ROLES = ['platform_owner', 'platform_admin', 'platform_support'];
const MANAGE_ROLES = ['platform_owner', 'platform_admin'];

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

  const { data: modules, error } = await supabase
    .from('workspace_modules')
    .select('*')
    .eq('workspace_id', id);

  if (error) {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch modules');
  }

  const isSupportOnly = roleCheck.platformRole === 'platform_support';

  const sanitised = (modules || []).map((m) => {
    if (isSupportOnly) {
      return {
        module: m.module,
        enabled: m.enabled,
      };
    }
    return m;
  });

  return res.status(200).json({ modules: sanitised });
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

  const roleCheck = await requirePlatformRole(supabase, user.id, MANAGE_ROLES);
  if (roleCheck.error) {
    return errorResponse(res, roleCheck.status, roleCheck.error, 'Platform access denied');
  }

  // Validate required fields
  const validation = validateBody(req.body, ['modules']);
  if (!validation.valid) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      `Missing required fields: ${validation.missing.join(', ')}`
    );
  }

  // Reject unknown fields
  const fieldCheck = rejectUnknownFields(req.body, ['modules']);
  if (!fieldCheck.valid) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      `Unknown fields: ${fieldCheck.unknown.join(', ')}`
    );
  }

  const { modules } = req.body;

  if (!Array.isArray(modules)) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Modules must be an array');
  }

  const { error } = await supabase.rpc('update_workspace_modules', {
    p_workspace_id: id,
    p_modules: modules,
  });

  if (error) {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to update modules');
  }

  return res.status(200).json({ success: true });
}
