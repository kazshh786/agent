const crypto = require('crypto');
const { createSupabaseServiceClient, errorResponse } = require('../_utils');
const { executeProviderJob } = require('../_providers');
const { decryptCredentials } = require('../_crypto');

function authorized(req) {
  const supplied = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  return [process.env.JOB_RUNNER_SECRET, process.env.CRON_SECRET].filter(Boolean).some(value => {
    const expected = Buffer.from(value);
    return expected.length >= 32 && supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  });
}

module.exports = async function (req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return errorResponse(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET or POST is allowed');
  }
  if (!authorized(req)) {
    return errorResponse(res, 401, 'UNAUTHORIZED', 'Invalid worker credential');
  }
  const supabase = createSupabaseServiceClient();
  const workerId = `vercel-${crypto.randomUUID()}`;
  const { data: jobs, error } = await supabase.rpc('claim_integration_jobs', { p_limit: 10, p_worker_id: workerId });
  if (error) return errorResponse(res, 500, 'CLAIM_FAILED', 'Unable to claim jobs');
  const outcomes = [];
  for (const job of jobs || []) {
    let outcome;
    try {
      let context={};
      if(job.connection_id){
        const [{data:connection,error:connectionError},{data:credential,error:credentialError}]=await Promise.all([
          supabase.from('integration_connections').select('id,workspace_id,provider,external_account_id,configuration').eq('id',job.connection_id).single(),
          supabase.from('integration_credentials').select('ciphertext,iv,auth_tag,key_version').eq('connection_id',job.connection_id).single(),
        ]);
        if(connectionError||credentialError||!connection||!credential)throw new Error('Connection material unavailable');
        context={connection,credentials:decryptCredentials(credential)};
      }
      outcome = await executeProviderJob(job,context);
    }
    catch { outcome = { succeeded: false, retryable: true, errorCode: 'PROVIDER_REQUEST_FAILED' }; }
    const retrySeconds = Math.min(3600, 30 * (2 ** Math.max(0, job.attempts - 1)));
    const { error: finishError } = await supabase.rpc('finish_integration_job', {
      p_job_id: job.id, p_succeeded: outcome.succeeded, p_result: outcome.result||{},
      p_error_code: outcome.errorCode || null, p_retry_seconds: outcome.retryable ? retrySeconds : 0,
    });
    if (!finishError && job.connection_id && job.job_type === 'connection.test') {
      await supabase.from('integration_connections').update({
        status: outcome.succeeded ? 'connected' : 'error',
        last_checked_at: new Date().toISOString(),
        last_error_code: outcome.errorCode || null,
      }).eq('id', job.connection_id);
      if(outcome.succeeded&&job.provider==='ks_os'&&outcome.result?.tenantId){
        await supabase.from('website_sites').update({booking_external_tenant_id:outcome.result.tenantId,booking_health_checked_at:new Date().toISOString()}).eq('workspace_id',job.workspace_id);
      }
    }
    outcomes.push({ id: job.id, accepted: !finishError, succeeded: outcome.succeeded, errorCode: outcome.errorCode || null });
  }
  return res.status(200).json({ claimed: (jobs || []).length, outcomes });
};

module.exports.authorized = authorized;
