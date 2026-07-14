const { requireAuth, requirePlatformRole, requireWorkspaceRole, validateUUID, errorResponse, handleCors } = require('./_utils');

module.exports = async function (req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed');
  const auth = await requireAuth(req);
  if (auth.error) return errorResponse(res, auth.status, auth.error, 'Authentication required');
  const workspaceId = req.query.workspaceId;
  if (!validateUUID(workspaceId)) return errorResponse(res, 400, 'VALIDATION_ERROR', 'Valid workspaceId required');
  const platform = await requirePlatformRole(auth.supabase, auth.user.id, ['platform_owner', 'platform_admin']);
  if (platform.error) {
    const member = await requireWorkspaceRole(auth.supabase, auth.user.id, workspaceId, ['owner', 'admin']);
    if (member.error) return errorResponse(res, 403, 'FORBIDDEN', 'Job visibility denied');
  }
  const { data, error } = await auth.supabase.from('integration_jobs')
    .select('id,workspace_id,connection_id,provider,job_type,status,attempts,max_attempts,run_after,last_error_code,created_at,updated_at,completed_at')
    .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(100);
  if (error) return errorResponse(res, 500, 'INTERNAL_ERROR', 'Unable to load jobs');
  return res.status(200).json({ jobs: data || [] });
};
