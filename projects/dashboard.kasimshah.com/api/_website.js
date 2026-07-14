const { requirePlatformRole, requireWorkspaceMembership, requireWorkspaceRole } = require('./_utils');

async function requireWebsiteRead(supabase, userId, workspaceId) {
  const platform = await requirePlatformRole(supabase, userId, ['platform_owner','platform_admin']);
  if (!platform.error) return platform;
  return requireWorkspaceMembership(supabase, userId, workspaceId);
}

async function requireWebsiteWrite(supabase, userId, workspaceId) {
  const platform = await requirePlatformRole(supabase, userId, ['platform_owner','platform_admin']);
  if (!platform.error) return platform;
  return requireWorkspaceRole(supabase, userId, workspaceId, ['owner','admin','editor']);
}

function bookingReadiness(site, modules, connections) {
  const websiteEnabled = modules.some(item => item.module === 'website' && item.enabled);
  const bookingEnabled = modules.some(item => item.module === 'booking' && item.enabled);
  const bookingConnection = connections.find(item => item.provider === 'ks_os');
  const reasons = [];
  if (!websiteEnabled) reasons.push('WEBSITE_MODULE_DISABLED');
  if (!bookingEnabled) reasons.push('BOOKING_MODULE_DISABLED');
  if (!bookingConnection) reasons.push('KS_OS_NOT_CONNECTED');
  else if (bookingConnection.status !== 'connected') reasons.push(bookingConnection.last_error_code || 'KS_OS_NOT_READY');
  if (!site.booking_external_tenant_id && !bookingConnection?.external_account_id) reasons.push('KS_OS_TENANT_NOT_MAPPED');
  return { ready: reasons.length === 0, reasons, providerStatus: bookingConnection?.status || 'not_configured' };
}

module.exports = { requireWebsiteRead, requireWebsiteWrite, bookingReadiness };
