const PROVIDERS = Object.freeze({
  ks_os: { label: 'KS OS Booking', module: 'booking', credentialFields: ['serviceToken'], configurationFields: [], apiEnv: 'KS_OS_API_URL' },
  website_engine: { label: 'Website Engine', module: 'website', credentialFields: ['apiToken'], configurationFields: ['projectId'], apiEnv: 'WEBSITE_ENGINE_API_URL' },
  resend: { label: 'Resend Email', module: 'email', credentialFields: ['apiKey'], configurationFields: ['fromDomain'] },
  meta: { label: 'Meta Social', module: 'social', credentialFields: ['accessToken'], configurationFields: ['pageId'] },
});

function getProvider(key) {
  return PROVIDERS[key] || null;
}

function publicProviderCatalog() {
  return Object.entries(PROVIDERS).map(([key, provider]) => ({ key, label: provider.label, module: provider.module }));
}

function validateCredentials(provider, credentials) {
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) return false;
  return provider.credentialFields.every(field => typeof credentials[field] === 'string' && credentials[field].trim().length >= 8);
}

function validateConfiguration(provider, configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) return false;
  return Object.keys(configuration).every(key => provider.configurationFields.includes(key));
}

function allowedProviderUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname));
  } catch { return false; }
}

async function executeProviderJob(job, context = {}) {
  const provider = getProvider(job.provider);
  if (!provider) return { succeeded: false, retryable: false, errorCode: 'UNKNOWN_PROVIDER' };
  if (job.job_type !== 'connection.test') {
    return { succeeded: false, retryable: false, errorCode: 'UNSUPPORTED_JOB_TYPE' };
  }
  const apiUrl = provider.apiEnv ? process.env[provider.apiEnv] : null;
  if (provider.apiEnv && !allowedProviderUrl(apiUrl)) {
    return { succeeded: false, retryable: false, errorCode: 'PROVIDER_NOT_CONFIGURED' };
  }
  if (job.provider === 'ks_os') {
    const token=context.credentials?.serviceToken;
    const tenantId=context.connection?.external_account_id;
    if(!token||!tenantId)return {succeeded:false,retryable:false,errorCode:'KS_OS_CREDENTIALS_INCOMPLETE'};
    const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(`${apiUrl.replace(/\/$/,'')}/api/v1/service/tenants/${encodeURIComponent(tenantId)}/status`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal});
      clearTimeout(timeout);
      if(response.status===401||response.status===403)return {succeeded:false,retryable:false,errorCode:'KS_OS_AUTH_FAILED'};
      if(response.status===404)return {succeeded:false,retryable:false,errorCode:'KS_OS_TENANT_NOT_FOUND'};
      if(!response.ok)return {succeeded:false,retryable:response.status>=500,errorCode:'KS_OS_UNAVAILABLE'};
      const body=await response.json();
      if(!job.workspace_id)return {succeeded:false,retryable:false,errorCode:'KS_OS_WORKSPACE_LINK_MISSING'};
      const linkController=new AbortController();const linkTimeout=setTimeout(()=>linkController.abort(),10000);
      const linkResponse=await fetch(`${apiUrl.replace(/\/$/,'')}/api/v1/service/tenants/${encodeURIComponent(tenantId)}/automation-link`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({workspaceId:job.workspace_id}),signal:linkController.signal});
      clearTimeout(linkTimeout);
      if(!linkResponse.ok)return {succeeded:false,retryable:linkResponse.status>=500,errorCode:'KS_OS_AUTOMATION_LINK_FAILED'};
      return {succeeded:true,retryable:false,result:{tenantId:body.tenant?.id,readiness:body.readiness||{}}};
    }catch{clearTimeout(timeout);return {succeeded:false,retryable:true,errorCode:'KS_OS_UNAVAILABLE'};}
  }
  return { succeeded: false, retryable: false, errorCode: 'PROVIDER_CONTRACT_UNAVAILABLE' };
}

module.exports = { PROVIDERS, getProvider, publicProviderCatalog, validateCredentials, validateConfiguration, executeProviderJob };
