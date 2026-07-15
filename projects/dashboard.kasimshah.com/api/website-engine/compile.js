const {
  requireAuth,
  createSupabaseServiceClient,
  requireEnabledModule,
  requireActiveWorkspace,
  validateBody,
  validateUUID,
  writeAuditLog,
  errorResponse,
  generateCorrelationId,
  handleCors,
} = require('../_utils');
const { requireWebsiteWrite } = require('../_website');

const PROJECT_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,98}[a-zA-Z0-9]$/;
const TEMPLATE_NAME_REGEX = /^[a-z0-9-]{2,50}$/;

const ALLOWED_COLORS = ['luxe-dark', 'minimal-light', 'vibrant', 'corporate'];
const ALLOWED_FONTS = ['inter', 'roboto', 'outfit', 'playfair'];

function isAllowedEngineUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

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
    const serviceClient = createSupabaseServiceClient();
    const workspaceId = req.headers['x-workspace-id'];

    if (!workspaceId) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'X-Workspace-Id header is required');
    }

    const roleCheck = await requireWebsiteWrite(supabase, user.id, workspaceId);
    if (roleCheck.error) {
      return errorResponse(res, roleCheck.status, roleCheck.error, 'Insufficient permissions');
    }
    const activeWorkspace = await requireActiveWorkspace(supabase, workspaceId);
    if (activeWorkspace.error) {
      return errorResponse(res, activeWorkspace.status, activeWorkspace.error.code, activeWorkspace.error.message);
    }

    const engineUrl = process.env.WEBSITE_ENGINE_API_URL;
    const engineToken = process.env.WEBSITE_ENGINE_API_TOKEN;
    const appUrl = process.env.APP_URL;

    if (!engineUrl || !engineToken || !appUrl || !isAllowedEngineUrl(engineUrl) || !/^https:\/\//i.test(appUrl)) {
      return errorResponse(res, 503, 'ENGINE_UNAVAILABLE', 'Website engine is not configured');
    }

    const validation = validateBody(req.body, ['siteId']);
    if (!validation.valid) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', `Missing required fields: ${validation.missing.join(', ')}`);
    }

    const { siteId, settings } = req.body;
    if (!validateUUID(siteId)) {
      return errorResponse(res, 400, 'VALIDATION_ERROR', 'Valid siteId is required');
    }
    const [websiteEntitlement, bookingEntitlement] = await Promise.all([
      requireEnabledModule(supabase, workspaceId, 'website'),
      requireEnabledModule(supabase, workspaceId, 'booking'),
    ]);
    if (websiteEntitlement.error || bookingEntitlement.error) {
      return errorResponse(res, 403, 'MODULE_DISABLED', 'Website and booking modules must both be enabled');
    }
    const { data: site, error: siteError } = await supabase.from('website_sites')
      .select('id,workspace_id,project_id,template_name,primary_domain,booking_path,payment_mode,analytics_key')
      .eq('id', siteId).eq('workspace_id', workspaceId).single();
    if (siteError || !site) return errorResponse(res, 404, 'SITE_NOT_FOUND', 'Website not found');
    const { data: project, error: projectError } = await supabase.from('projects').select('id,name').eq('id', site.project_id).eq('workspace_id', workspaceId).single();
    if (projectError || !project) return errorResponse(res, 404, 'PROJECT_NOT_FOUND', 'Website project not found');
    const projectName = site.primary_domain
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[.-]+|[.-]+$/g, '')
      .slice(0, 100);
    const templateName = site.template_name;

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
          ...(process.env.WEBSITE_ENGINE_VERCEL_BYPASS_TOKEN
            ? { 'x-vercel-protection-bypass': process.env.WEBSITE_ENGINE_VERCEL_BYPASS_TOKEN }
            : {}),
        },
        body: JSON.stringify({
          name: projectName,
          templateName,
          bookingLink: site.booking_path,
          bookingProvider: 'ks_os',
          paymentMode: site.payment_mode,
          analyticsKey: site.analytics_key,
          analyticsEndpoint: `${appUrl.replace(/\/$/, '')}/api/analytics/collect`,
          bookingApiEndpoint: `${appUrl.replace(/\/$/, '')}/api/booking`,
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

      await serviceClient.rpc('record_website_compile_result', {
        p_actor_id: user.id, p_website_id: site.id, p_correlation_id: correlationId, p_success: false,
        p_engine_project_id: null, p_url: null, p_error_code: 'ENGINE_UNAVAILABLE'
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

      await serviceClient.rpc('record_website_compile_result', {
        p_actor_id: user.id, p_website_id: site.id, p_correlation_id: correlationId, p_success: false,
        p_engine_project_id: null, p_url: null, p_error_code: publicCode
      });

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
      entityId: site.id,
      metadata: { projectName, templateName, correlationId },
    });

    const engineProjectId = engineBody?.projectId || projectName;
    const siteUrl = engineBody?.url || `https://${site.primary_domain}`;
    const { error: recordError } = await serviceClient.rpc('record_website_compile_result', {
      p_actor_id: user.id, p_website_id: site.id, p_correlation_id: correlationId, p_success: true,
      p_engine_project_id: engineProjectId, p_url: siteUrl, p_error_code: null
    });
    if (recordError) return errorResponse(res, 500, 'STATE_UPDATE_FAILED', 'Website compiled but state could not be recorded');

    // Only return explicit fields from the engine to prevent downstream leaking
    return res.status(200).json({
      success: true,
      websiteId: site.id,
      projectId: engineProjectId,
      url: siteUrl,
      bookingPath: site.booking_path,
      correlationId
    });
  } catch (err) {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
