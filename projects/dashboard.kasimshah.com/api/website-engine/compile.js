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
const TEMPLATE_NAME_REGEX = /^[a-z0-9-]{2,50}$/;

const ALLOWED_COLORS = ['luxe-dark', 'minimal-light', 'vibrant', 'corporate'];
const ALLOWED_FONTS = ['inter', 'roboto', 'outfit', 'playfair'];

function validateSettingsSchema(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return null;
  }

  // Prevent deep nesting (max depth 1 is implicitly enforced since we only pick primitive values)
  if (JSON.stringify(settings).length > 2000) {
    return null; // Size limit
  }

  const sanitized = {};
  
  if (settings.colorScheme) {
    if (ALLOWED_COLORS.includes(settings.colorScheme)) {
      sanitized.colorScheme = settings.colorScheme;
    } else {
      return { error: 'Invalid colorScheme' };
    }
  }

  if (settings.fontFamily) {
    if (ALLOWED_FONTS.includes(settings.fontFamily)) {
      sanitized.fontFamily = settings.fontFamily;
    } else {
      return { error: 'Invalid fontFamily' };
    }
  }

  if (settings.seoTitle) {
    if (typeof settings.seoTitle === 'string' && settings.seoTitle.length <= 100) {
      sanitized.seoTitle = settings.seoTitle;
    } else {
      return { error: 'Invalid seoTitle' };
    }
  }

  if (settings.seoDescription) {
    if (typeof settings.seoDescription === 'string' && settings.seoDescription.length <= 300) {
      sanitized.seoDescription = settings.seoDescription;
    } else {
      return { error: 'Invalid seoDescription' };
    }
  }

  return sanitized;
}

module.exports = async function (req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed');
  }

  try {
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

    const engineUrl = process.env.WEBSITE_ENGINE_API_URL;
    const engineToken = process.env.WEBSITE_ENGINE_API_TOKEN;

    if (!engineUrl || !engineToken) {
      return errorResponse(res, 503, 'ENGINE_UNAVAILABLE', 'Website engine is not configured');
    }

    const validation = validateBody(req.body, ['projectName', 'templateName']);
    if (!validation.valid) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', `Missing required fields: ${validation.missing.join(', ')}`);
    }

    const { projectName, templateName, settings } = req.body;

    if (!PROJECT_NAME_REGEX.test(projectName)) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'Project name must be 2-100 characters, alphanumeric with hyphens and dots, no path traversal');
    }

    if (!TEMPLATE_NAME_REGEX.test(templateName)) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'Template name is invalid');
    }

    let sanitizedSettings = undefined;
    if (settings !== undefined) {
      const parsedSettings = validateSettingsSchema(settings);
      if (parsedSettings && parsedSettings.error) {
        return errorResponse(res, 400, 'VALIDATION_ERROR', parsedSettings.error);
      }
      sanitizedSettings = parsedSettings;
    }

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
          ...(sanitizedSettings ? { settings: sanitizedSettings } : {}),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (fetchErr) {
      clearTimeout(timeout);
      
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

    if (!engineRes.ok) {
      await writeAuditLog(supabase, {
        workspaceId,
        actorId: user.id,
        action: 'website_engine.compile.failed',
        entityType: 'project',
        entityId: null,
        metadata: { projectName, templateName, correlationId, engineStatus: engineRes.status },
      });

      // Map to controlled public error code
      let publicCode = 'ENGINE_ERROR';
      if (engineRes.status === 400) publicCode = 'ENGINE_VALIDATION_ERROR';
      if (engineRes.status === 401 || engineRes.status === 403) publicCode = 'ENGINE_AUTH_ERROR';

      return errorResponse(res, engineRes.status, publicCode, `Website engine compilation failed (Correlation ID: ${correlationId})`);
    }

    let engineBody;
    try {
      engineBody = await engineRes.json();
    } catch {
      return errorResponse(res, 502, 'ENGINE_ERROR', `Website engine returned invalid response (Correlation ID: ${correlationId})`);
    }

    await writeAuditLog(supabase, {
      workspaceId,
      actorId: user.id,
      action: 'website_engine.compile.success',
      entityType: 'project',
      entityId: engineBody?.projectId || null,
      metadata: { projectName, templateName, correlationId },
    });

    // Only return explicit fields from the engine to prevent downstream leaking
    return res.status(200).json({
      success: true,
      projectId: engineBody.projectId,
      url: engineBody.url,
      correlationId
    });
  } catch (err) {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
