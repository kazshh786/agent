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

/**
 * Checks that the user's role within the workspace is in the allowedRoles array.
 * Returns { member } or { error, status }.
 */
async function requireWorkspaceRole(supabase, userId, workspaceId, allowedRoles) {
  const result = await requireWorkspaceMember(supabase, userId, workspaceId);

  if (result.error) {
    return result;
  }

  if (!allowedRoles.includes(result.member.role)) {
    return { error: 'FORBIDDEN', status: 403 };
  }

  return { member: result.member };
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
 * Inserts a row into the audit_logs table.
 * Silently logs errors — never throws.
 */
async function writeAuditLog(supabase, { workspaceId, actorId, action, entityType, entityId, metadata }) {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      workspace_id: workspaceId,
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: metadata || null,
    });

    if (error) {
      console.error('[audit_log] Failed to write audit log:', error.message);
    }
  } catch (err) {
    console.error('[audit_log] Unexpected error writing audit log:', err.message);
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
};
