const crypto = require('crypto');
const { requireAuth, requirePlatformRole, requireWorkspaceRole, requireEnabledModule, validateUUID, rejectUnknownFields, errorResponse, handleCors } = require('./_utils');
const { encryptCredentials } = require('./_crypto');
const { getProvider, publicProviderCatalog, validateCredentials, validateConfiguration } = require('./_providers');

const MANAGER_ROLES = ['owner', 'admin'];
const PLATFORM_ROLES = ['platform_owner', 'platform_admin'];

async function canManage(supabase, userId, workspaceId) {
  const platform = await requirePlatformRole(supabase, userId, PLATFORM_ROLES);
  if (!platform.error) return true;
  const workspace = await requireWorkspaceRole(supabase, userId, workspaceId, MANAGER_ROLES);
  return !workspace.error;
}

module.exports = async function (req, res) {
  if (handleCors(req, res)) return;
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are allowed');
  }
  const auth = await requireAuth(req);
  if (auth.error) return errorResponse(res, auth.status, auth.error, 'Authentication required');
  const workspaceId = req.method === 'GET' ? req.query.workspaceId : req.body?.workspaceId;
  if (!validateUUID(workspaceId)) return errorResponse(res, 400, 'VALIDATION_ERROR', 'Valid workspaceId required');
  if (!(await canManage(auth.supabase, auth.user.id, workspaceId))) {
    return errorResponse(res, 403, 'FORBIDDEN', 'Integration management access denied');
  }

  if (req.method === 'GET') {
    const { data, error } = await auth.supabase.from('integration_connections')
      .select('id,workspace_id,provider,status,display_name,external_account_id,configuration,last_checked_at,last_error_code,created_at,updated_at')
      .eq('workspace_id', workspaceId);
    if (error) return errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to load integrations');
    return res.status(200).json({ providers: publicProviderCatalog(), connections: data || [] });
  }

  const allowed = ['workspaceId', 'provider', 'displayName', 'externalAccountId', 'configuration', 'credentials'];
  const fields = rejectUnknownFields(req.body, allowed);
  if (!fields.valid) return errorResponse(res, 400, 'VALIDATION_ERROR', 'Unknown request fields');
  const provider = getProvider(req.body.provider);
  if (!provider) return errorResponse(res, 400, 'UNKNOWN_PROVIDER', 'Provider is not supported');
  const entitlement = await requireEnabledModule(auth.supabase, workspaceId, provider.module);
  if (entitlement.error) return errorResponse(res, 403, 'MODULE_DISABLED', 'The required workspace module is disabled');
  if (!validateCredentials(provider, req.body.credentials)) {
    return errorResponse(res, 400, 'INVALID_CREDENTIALS', 'Required provider credentials are missing');
  }
  if (!validateConfiguration(provider, req.body.configuration || {})) {
    return errorResponse(res, 400, 'INVALID_CONFIGURATION', 'Provider configuration contains unsupported fields');
  }
  let encrypted;
  try { encrypted = encryptCredentials(req.body.credentials); }
  catch (error) {
    const code = error.code === 'ENCRYPTION_NOT_CONFIGURED' ? error.code : 'INVALID_CREDENTIALS';
    return errorResponse(res, 503, code, 'Secure credential storage is unavailable');
  }
  const { data: connectionId, error } = await auth.supabase.rpc('upsert_integration_connection', {
    p_workspace_id: workspaceId,
    p_provider: req.body.provider,
    p_display_name: req.body.displayName || provider.label,
    p_external_account_id: req.body.externalAccountId || null,
    p_configuration: req.body.configuration || {},
    p_ciphertext: encrypted.ciphertext,
    p_iv: encrypted.iv,
    p_auth_tag: encrypted.authTag,
    p_key_version: encrypted.keyVersion,
  });
  if (error) return errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to save integration');

  const idempotencyKey = `connection-test-${connectionId}-${crypto.randomUUID()}`;
  const { data: jobId, error: jobError } = await auth.supabase.rpc('enqueue_integration_job', {
    p_workspace_id: workspaceId, p_connection_id: connectionId, p_provider: req.body.provider,
    p_job_type: 'connection.test', p_payload: {}, p_idempotency_key: idempotencyKey, p_max_attempts: 1,
  });
  if (jobError) return errorResponse(res, 500, 'JOB_ENQUEUE_FAILED', 'Integration saved but test could not be queued');
  return res.status(202).json({ connection: { id: connectionId, provider: req.body.provider, status: 'pending' }, job: { id: jobId, status: 'queued' } });
};
