const {
  createSupabaseServiceClient,
  errorResponse,
  handleCors,
} = require('./_utils');

module.exports = async function (req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed');
  }

  try {
    const components = {
      api: 'healthy',
      database: 'unhealthy',
      ksOS: 'unavailable',
      websiteEngine: 'unavailable',
    };

    // --- Database health ---
    try {
      const supabase = createSupabaseServiceClient();
      const { error } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);

      components.database = error ? 'unhealthy' : 'healthy';
    } catch {
      components.database = 'unhealthy';
    }

    // --- KS OS service health ---
    const ksOsUrl = process.env.KS_OS_API_URL;
    const ksOsToken = process.env.KS_OS_SERVICE_TOKEN;
    if (ksOsUrl && ksOsToken) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const headers = { Authorization: `Bearer ${ksOsToken}` };
        if (process.env.KS_OS_VERCEL_BYPASS_TOKEN) {
          headers['x-vercel-protection-bypass'] = process.env.KS_OS_VERCEL_BYPASS_TOKEN;
        }
        const ksOsRes = await fetch(`${ksOsUrl.replace(/\/$/, '')}/api/v1/service/health`, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        components.ksOS = ksOsRes.ok ? 'healthy' : 'unavailable';
      } catch {
        components.ksOS = 'unavailable';
      }
    }

    // --- Website Engine health ---
    const engineUrl = process.env.WEBSITE_ENGINE_API_URL;
    if (engineUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const headers = {};
        if (process.env.WEBSITE_ENGINE_API_TOKEN) {
          headers.Authorization = `Bearer ${process.env.WEBSITE_ENGINE_API_TOKEN}`;
        }
        if (process.env.WEBSITE_ENGINE_VERCEL_BYPASS_TOKEN) {
          headers['x-vercel-protection-bypass'] = process.env.WEBSITE_ENGINE_VERCEL_BYPASS_TOKEN;
        }

        const engineRes = await fetch(`${engineUrl}/api/templates`, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        components.websiteEngine = engineRes.ok ? 'healthy' : 'unavailable';
      } catch {
        components.websiteEngine = 'unavailable';
      }
    }

    // --- Aggregate status ---
    let status = 'healthy';
    if (components.database === 'unhealthy') {
      status = 'unhealthy';
    } else if (components.ksOS === 'unavailable' || components.websiteEngine === 'unavailable') {
      status = 'degraded';
    }

    const httpStatus = status === 'unhealthy' ? 503 : 200;

    return res.status(httpStatus).json({
      status,
      components,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return errorResponse(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
};
