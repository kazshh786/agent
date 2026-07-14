const { handleCors } = require('./_utils');

module.exports = async function (req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET is allowed' } });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({ error: { code: 'CONFIG_MISSING', message: 'Dashboard configuration is unavailable' } });
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({
    supabaseUrl,
    supabaseAnonKey
  });
};
