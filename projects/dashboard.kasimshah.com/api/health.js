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

    // --- Website Engine health ---
    const engineUrl = process.env.WEBSITE_ENGINE_API_URL;
    if (engineUrl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const engineRes = await fetch(`${engineUrl}/api/templates`, {
          method: 'GET',
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
    } else if (components.websiteEngine === 'unavailable') {
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
