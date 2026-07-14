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

async function executeProviderJob(job) {
  const provider = getProvider(job.provider);
  if (!provider) return { succeeded: false, retryable: false, errorCode: 'UNKNOWN_PROVIDER' };
  if (job.job_type !== 'connection.test') {
    return { succeeded: false, retryable: false, errorCode: 'UNSUPPORTED_JOB_TYPE' };
  }
  if (provider.apiEnv && !process.env[provider.apiEnv]) {
    return { succeeded: false, retryable: false, errorCode: 'PROVIDER_NOT_CONFIGURED' };
  }
  // Providers need an explicit service contract before network calls are enabled.
  // In particular, KS OS currently has no service-token integration endpoint.
  return { succeeded: false, retryable: false, errorCode: 'PROVIDER_CONTRACT_UNAVAILABLE' };
}

module.exports = { PROVIDERS, getProvider, publicProviderCatalog, validateCredentials, validateConfiguration, executeProviderJob };
