const {
  handleCors,
  requireAuth,
  requireWorkspaceMembership,
  validateUUID,
  errorResponse
} = require('../../_utils');

module.exports = async function (req, res) {
  if (handleCors(req, res)) return;

  try {
    if (req.method !== 'GET') {
      return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    }

    const { id } = req.query;
    if (!id || !validateUUID(id)) {
      return errorResponse(res, 400, 'INVALID_ID', 'A valid workspace ID is required');
    }

    const auth = await requireAuth(req);
    if (auth.error) {
      return errorResponse(res, auth.status, auth.error, 'Unauthorized');
    }
    const { user, supabase } = auth;

    const mem = await requireWorkspaceMembership(supabase, user.id, id);
    if (mem.error) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Workspace not found');
    }

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, name, slug, status')
      .eq('id', id)
      .single();

    if (workspaceError || !workspace) {
      return errorResponse(res, 404, 'NOT_FOUND', 'Workspace not found');
    }

    const { data: modulesData, error: modulesError } = await supabase
      .from('workspace_modules')
      .select('module_name, enabled')
      .eq('workspace_id', id);

    if (modulesError) {
      return errorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
    }

    return res.status(200).json({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      status: workspace.status,
      role: mem.role,
      modules: (modulesData || []).map(module => ({
        module_name: module.module_name,
        enabled: module.enabled
      }))
    });

  } catch (err) {
    console.error('Error in customer workspace GET:', err);
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'Internal server error');
  }
};
