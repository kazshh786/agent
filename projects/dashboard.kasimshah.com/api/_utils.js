const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

/**
 * Creates a Supabase client that passes the caller's JWT so RLS is active.
 * Use this for all normal user-facing queries.
 */
function createSupabaseServerClient(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
}

/**
 * Creates a Supabase client with the service-role key.
 * ONLY for narrowly defined privileged operations — never for general queries.
 */
function createSupabaseServiceClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Extracts the Bearer token, validates it via supabase.auth.getUser(),
 * and returns { user, supabase } or { error, status }.
 */
async function requireAuth(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { error: 'UNAUTHORIZED', status: 401 };
  }

  const supabase = createSupabaseServerClient(req);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return { error: 'UNAUTHORIZED', status: 401 };
  }

  return { user: data.user, supabase };
}

/**
 * Checks that the user is a member of the given workspace.
 * Returns { member } with role info, or { error, status }.
 */
async function requireWorkspaceMember(supabase, userId, workspaceId) {
  if (!workspaceId) {
    return { error: 'FORBIDDEN', status: 403 };
  }

  const { data: member, error } = await supabase
    .from('workspace_members')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single();

  if (error || !member) {
    return { error: 'FORBIDDEN', status: 403 };
  }

  return { member };
}

function createSafeApiError(code, message, status = 400) {
  return { error: { code, message }, status };
}

async function requireWorkspaceMembership(supabase, userId, workspaceId) {
  if (!validateUUID(workspaceId)) return createSafeApiError('INVALID_UUID', 'Invalid workspace ID');
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .single();
  if (error || !data) return createSafeApiError('FORBIDDEN', 'Workspace membership required', 403);
  return { role: data.role };
}

async function requireActiveWorkspace(supabase, workspaceId) {
  const { data, error } = await supabase
    .from('workspaces')
    .select('status')
    .eq('id', workspaceId)
    .single();
  if (error || !data) return createSafeApiError('NOT_FOUND', 'Workspace not found', 404);
  if (data.status === 'suspended') return createSafeApiError('WORKSPACE_SUSPENDED', 'Workspace is suspended', 403);
  if (data.status === 'archived') return createSafeApiError('WORKSPACE_ARCHIVED', 'Workspace is archived', 403);
  if (data.status === 'provisioning') return createSafeApiError('WORKSPACE_PROVISIONING', 'Workspace is provisioning', 409);
  if (data.status === 'failed') return createSafeApiError('WORKSPACE_FAILED', 'Workspace provisioning failed', 409);
  if (data.status !== 'active') return createSafeApiError('WORKSPACE_INACTIVE', 'Workspace is not active', 403);
  return { status: data.status };
}

async function requireWorkspaceRole(supabase, userId, workspaceId, allowedRoles) {
  const mem = await requireWorkspaceMembership(supabase, userId, workspaceId);
  if (mem.error) return mem;
  if (!allowedRoles.includes(mem.role)) return createSafeApiError('FORBIDDEN', 'Insufficient workspace role', 403);
  return { role: mem.role };
}

async function requireEnabledModule(supabase, workspaceId, moduleName) {
  const { data, error } = await supabase
    .from('workspace_modules')
    .select('enabled')
    .eq('workspace_id', workspaceId)
    .eq('module', moduleName)
    .single();
  if (error || !data || !data.enabled) return createSafeApiError('MODULE_DISABLED', 'Module is disabled', 403);
  return { enabled: true };
}

/**
 * Validates that body is an object and all requiredFields are present and non-empty.
 * Returns { valid: true } or { valid: false, missing: [...] }.
 */
function validateBody(body, requiredFields) {
  if (!body || typeof body !== 'object') {
    return { valid: false, missing: requiredFields };
  }

  const missing = requiredFields.filter((field) => {
    const value = body[field];
    if (value === undefined || value === null) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    return false;
  });

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  return { valid: true };
}

/**
 * Writes API-generated audit events through the server-only service client.
 * The generic database RPC is not exposed to browser users because it would
 * allow callers to fabricate event names and metadata.
 */
async function writeAuditLog(_callerClient, { workspaceId, actorId, action, entityType, entityId, metadata }) {
  if (!workspaceId || !actorId || !action || !entityType) {
    throw new Error('Audit log requires workspace, actor, action, and entity type');
  }

  const serviceClient = createSupabaseServiceClient();
  const { error } = await serviceClient.from('audit_logs').insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    metadata: metadata || {}
  });

  if (error) {
    console.error('[audit_log] Server audit write failed:', error.message);
    throw new Error('Audit log write failed');
  }
}

/**
 * Sends a structured JSON error response.
 */
function errorResponse(res, statusCode, code, message) {
  return res.status(statusCode).json({ error: { code, message } });
}

/**
 * Generates a random hex string for request tracing / correlation.
 */
function generateCorrelationId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Sets CORS headers. Returns true if the request was an OPTIONS preflight
 * (and the response has already been sent), false otherwise.
 */
function handleCors(req, res) {
  const origin = process.env.APP_URL || '*';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Workspace-Id, X-Correlation-Id');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}

/**
 * Validates that a string is a valid UUID v4 format.
 */
function validateUUID(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Checks that the user holds an active platform-level role.
 * Returns { platformRole } or { error, status }.
 */
async function requirePlatformRole(supabase, userId, allowedRoles) {
  const { data, error } = await supabase
    .from('platform_users')
    .select('role, is_active')
    .eq('user_id', userId)
    .single();
  if (error || !data || !data.is_active) {
    return { error: 'FORBIDDEN', status: 403 };
  }
  if (!allowedRoles.includes(data.role)) {
    return { error: 'FORBIDDEN', status: 403 };
  }
  return { platformRole: data.role };
}

/**
 * Rejects request bodies that contain fields not in the allowedFields list.
 * Returns { valid: true } or { valid: false, unknown: [...] }.
 */
function rejectUnknownFields(body, allowedFields) {
  if (!body || typeof body !== 'object') return { valid: true };
  const unknown = Object.keys(body).filter(k => !allowedFields.includes(k));
  if (unknown.length > 0) {
    return { valid: false, unknown };
  }
  return { valid: true };
}

module.exports = {
  createSupabaseServerClient,
  createSupabaseServiceClient,
  requireAuth,
  requireWorkspaceMember,
  requireWorkspaceRole,
  validateBody,
  writeAuditLog,
  errorResponse,
  generateCorrelationId,
  handleCors,
  validateUUID,
  requirePlatformRole,
  rejectUnknownFields,
  createSafeApiError,
  requireWorkspaceMembership,
  requireActiveWorkspace,
  requireEnabledModule,
};
