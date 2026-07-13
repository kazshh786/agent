const {
  requireAuth,
  requireWorkspaceRole,
  validateBody,
  writeAuditLog,
  errorResponse,
  generateCorrelationId,
  handleCors,
} = require('../_utils');

const PROJECT_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,98}[a-zA-Z0-9]$/;
const PATH_TRAVERSAL_REGEX = /\.\./;

module.exports = async function (req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed');
  }

  try {
    // --- Auth & RBAC ---
    const auth = await requireAuth(req);
    if (auth.error) {
      return errorResponse(res, auth.status, auth.error, 'Authentication required');
    }

    const { user, supabase } = auth;
    const workspaceId = req.headers['x-workspace-id'];

    if (!workspaceId) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'X-Workspace-Id header is required');
    }

    const roleCheck = await requireWorkspaceRole(supabase, user.id, workspaceId, [
      'owner',
      'admin',
      'editor',
    ]);
    if (roleCheck.error) {
      return errorResponse(res, roleCheck.status, roleCheck.error, 'Insufficient permissions');
    }

    // --- Engine configuration ---
    const engineUrl = process.env.WEBSITE_ENGINE_API_URL;
    const engineToken = process.env.WEBSITE_ENGINE_API_TOKEN;

    if (!engineUrl || !engineToken) {
      return errorResponse(res, 503, 'ENGINE_UNAVAILABLE', 'Website engine is not configured');
    }

    // --- Validate body ---
    const validation = validateBody(req.body, ['projectName', 'templateName']);
    if (!validation.valid) {
      return errorResponse(
        res,
        400,
        'VALIDATION_ERROR',
        `Missing required fields: ${validation.missing.join(', ')}`
      );
    }

    const { projectName, templateName } = req.body;

    // Validate projectName: alphanumeric, hyphens, dots only. No path traversal. Max 100 chars.
    if (!PROJECT_NAME_REGEX.test(projectName)) {
      return errorResponse(
        res,
        400,
        'VALIDATION_ERROR',
        'Project name must be 2-100 characters, alphanumeric with hyphens and dots, no path traversal'
      );
    }

    if (PATH_TRAVERSAL_REGEX.test(projectName)) {
      return errorResponse(
        res,
        400,
        'VALIDATION_ERROR',
        'Project name contains path traversal sequences'
      );
    }

    // --- Proxy to website engine ---
    const correlationId = generateCorrelationId();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let engineRes;
    try {
      engineRes = await fetch(`${engineUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${engineToken}`,
          'X-Correlation-Id': correlationId,
        },
        body: JSON.stringify({
          projectName,
          templateName,
          // Forward any additional safe fields from the body
          ...(req.body.settings && typeof req.body.settings === 'object'
            ? { settings: req.body.settings }
            : {}),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (fetchErr) {
      clearTimeout(timeout);

      // Audit the failed attempt
      await writeAuditLog(supabase, {
        workspaceId,
        actorId: user.id,
        action: 'website_engine.compile.failed',
        entityType: 'project',
        entityId: null,
        metadata: { projectName, templateName, correlationId, reason: 'engine_unreachable' },
      });

      return errorResponse(res, 503, 'ENGINE_UNAVAILABLE', 'Website engine is unreachable or timed out');
    }

    // --- Handle engine response ---
    let engineBody;
    try {
      engineBody = await engineRes.json();
    } catch {
      engineBody = null;
    }

    if (!engineRes.ok) {
      await writeAuditLog(supabase, {
        workspaceId,
        actorId: user.id,
        action: 'website_engine.compile.failed',
        entityType: 'project',
        entityId: null,
        metadata: { projectName, templateName, correlationId, engineStatus: engineRes.status },
      });

      const errorMessage =
        engineBody?.error?.message || engineBody?.message || 'Website engine returned an error';

      return errorResponse(res, engineRes.status, 'ENGINE_ERROR', errorMessage);
    }

    // Success audit
    await writeAuditLog(supabase, {
      workspaceId,
      actorId: user.id,
      action: 'website_engine.compile.success',
      entityType: 'project',
      entityId: engineBody?.projectId || null,
      metadata: { projectName, templateName, correlationId },
    });

    return res.status(engineRes.status).json(engineBody);
  } catch {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
