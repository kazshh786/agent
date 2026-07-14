const crypto = require('crypto');
const { createSupabaseServiceClient, errorResponse } = require('../_utils');
const { executeProviderJob } = require('../_providers');

module.exports = async function (req, res) {
  if (req.method !== 'POST') return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed');
  const supplied = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(process.env.JOB_RUNNER_SECRET || '');
  if (!expected.length || supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'Invalid worker credential');
  }
  const supabase = createSupabaseServiceClient();
  const workerId = `vercel-${crypto.randomUUID()}`;
  const { data: jobs, error } = await supabase.rpc('claim_integration_jobs', { p_limit: 10, p_worker_id: workerId });
  if (error) return errorResponse(res, 500, 'CLAIM_FAILED', 'Unable to claim jobs');
  const outcomes = [];
  for (const job of jobs || []) {
    let outcome;
    try { outcome = await executeProviderJob(job); }
    catch { outcome = { succeeded: false, retryable: true, errorCode: 'PROVIDER_REQUEST_FAILED' }; }
    const retrySeconds = Math.min(3600, 30 * (2 ** Math.max(0, job.attempts - 1)));
    const { error: finishError } = await supabase.rpc('finish_integration_job', {
      p_job_id: job.id, p_succeeded: outcome.succeeded, p_result: {},
      p_error_code: outcome.errorCode || null, p_retry_seconds: outcome.retryable ? retrySeconds : 0,
    });
    if (!finishError && job.connection_id && job.job_type === 'connection.test') {
      await supabase.from('integration_connections').update({
        status: outcome.succeeded ? 'connected' : 'error',
        last_checked_at: new Date().toISOString(),
        last_error_code: outcome.errorCode || null,
      }).eq('id', job.connection_id);
    }
    outcomes.push({ id: job.id, accepted: !finishError, succeeded: outcome.succeeded, errorCode: outcome.errorCode || null });
  }
  return res.status(200).json({ claimed: (jobs || []).length, outcomes });
};
