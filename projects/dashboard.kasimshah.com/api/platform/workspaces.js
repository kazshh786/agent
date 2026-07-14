const {
  requireAuth,
  requirePlatformRole,
  validateBody,
  rejectUnknownFields,
  errorResponse,
  handleCors,
} = require('../_utils');

const ALL_PLATFORM_ROLES = ['platform_owner', 'platform_admin', 'platform_support'];
const PROVISION_ROLES = ['platform_owner', 'platform_admin'];

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_MODULES = ['website', 'analytics', 'contacts', 'email', 'social', 'booking', 'crm'];

const PROVISION_FIELDS = ['name', 'slug', 'customer_name', 'customer_email', 'modules'];

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

  const roleCheck = await requirePlatformRole(supabase, user.id, ALL_PLATFORM_ROLES);
  if (roleCheck.error) {
    return errorResponse(res, roleCheck.status, roleCheck.error, 'Platform access denied');
  }

  // Fetch all workspaces with their modules
  const { data: workspaces, error } = await supabase
    .from('workspaces')
    .select('*, workspace_modules(*)');

  if (error) {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to fetch workspaces');
  }

  // Filter fields based on role
  const isSupportOnly = roleCheck.platformRole === 'platform_support';

  const sanitised = (workspaces || []).map((ws) => {
    if (isSupportOnly) {
      return {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        status: ws.status,
        customer_name: ws.customer_name,
        provisioned_at: ws.provisioned_at,
        modules: (ws.workspace_modules || []).map((m) => ({
          module: m.module,
          enabled: m.enabled,
        })),
      };
    }

    return {
      ...ws,
      modules: ws.workspace_modules || [],
    };
  });

  // Remove the nested join key from full responses
  if (!isSupportOnly) {
    sanitised.forEach((ws) => {
      delete ws.workspace_modules;
    });
  }

  return res.status(200).json({ workspaces: sanitised });
}

async function handlePost(req, res) {
  const auth = await requireAuth(req);
  if (auth.error) {
    return errorResponse(res, auth.status, auth.error, 'Authentication required');
  }

  const { user, supabase } = auth;

  const roleCheck = await requirePlatformRole(supabase, user.id, PROVISION_ROLES);
  if (roleCheck.error) {
    return errorResponse(res, roleCheck.status, roleCheck.error, 'Platform access denied');
  }

  // Validate required fields
  const validation = validateBody(req.body, PROVISION_FIELDS);
  if (!validation.valid) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      `Missing required fields: ${validation.missing.join(', ')}`
    );
  }

  // Reject unknown fields
  const fieldCheck = rejectUnknownFields(req.body, PROVISION_FIELDS);
  if (!fieldCheck.valid) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      `Unknown fields: ${fieldCheck.unknown.join(', ')}`
    );
  }

  const { name, slug, customer_name, customer_email, modules } = req.body;

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

  // Validate email format
  if (!EMAIL_REGEX.test(customer_email)) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'Invalid email format');
  }

  // Validate modules
  if (!Array.isArray(modules) || modules.length === 0) {
    return errorResponse(res, 400, 'VALIDATION_ERROR', 'At least one module is required');
  }

  const invalidModules = modules.filter((m) => !VALID_MODULES.includes(m));
  if (invalidModules.length > 0) {
    return errorResponse(
      res,
      400,
      'VALIDATION_ERROR',
      `Invalid modules: ${invalidModules.join(', ')}. Valid modules: ${VALID_MODULES.join(', ')}`
    );
  }

  // Provision via RPC
  const { data: result, error } = await supabase.rpc('provision_customer_workspace', {
    p_name: name.trim(),
    p_slug: slug,
    p_customer_name: customer_name.trim(),
    p_customer_email: customer_email.trim(),
    p_modules: modules,
  });

  if (error) {
    if (error.code === '23505' || error.message?.toLowerCase().includes('unique')) {
      return errorResponse(res, 409, 'CONFLICT', 'A workspace with this slug already exists');
    }
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'Failed to provision workspace');
  }

  return res.status(201).json({ workspace: result });
}
