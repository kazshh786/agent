const { requireAuth, requireActiveWorkspace, validateUUID, rejectUnknownFields, errorResponse, handleCors } = require('./_utils');
const { requireWebsiteRead, requireWebsiteWrite, bookingReadiness } = require('./_website');

const PAYMENT_MODES = ['no_payment','pay_later','deposit','full_payment','customer_choice'];
const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]{1,251}[a-z0-9]$/;
const TEMPLATE_RE = /^[a-z0-9-]{2,50}$/;

module.exports = async function(req,res) {
  if (handleCors(req,res)) return;
  if (!['GET','POST'].includes(req.method)) return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only GET and POST are allowed');
  const auth = await requireAuth(req);
  if (auth.error) return errorResponse(res,auth.status,auth.error,'Authentication required');
  const workspaceId = req.method === 'GET' ? req.query.workspaceId : req.body?.workspaceId;
  if (!validateUUID(workspaceId)) return errorResponse(res,400,'VALIDATION_ERROR','Valid workspaceId required');

  if (req.method === 'POST') {
    const access = await requireWebsiteWrite(auth.supabase,auth.user.id,workspaceId);
    if (access.error) return errorResponse(res,403,'FORBIDDEN','Website management access denied');
    const active = await requireActiveWorkspace(auth.supabase,workspaceId);
    if (active.error) return errorResponse(res,active.status,active.error.code,active.error.message);
    const allowed=['workspaceId','name','templateName','primaryDomain','paymentMode'];
    if (!rejectUnknownFields(req.body,allowed).valid) return errorResponse(res,400,'VALIDATION_ERROR','Unknown request fields');
    const {name,templateName,primaryDomain,paymentMode}=req.body;
    if (typeof name!=='string'||name.trim().length<2||name.length>200) return errorResponse(res,400,'VALIDATION_ERROR','Valid website name required');
    if (!TEMPLATE_RE.test(templateName||'')) return errorResponse(res,400,'VALIDATION_ERROR','Invalid template');
    if (!DOMAIN_RE.test((primaryDomain||'').toLowerCase())||(primaryDomain||'').includes('..')) return errorResponse(res,400,'VALIDATION_ERROR','Invalid primary domain');
    if (!PAYMENT_MODES.includes(paymentMode)) return errorResponse(res,400,'VALIDATION_ERROR','Invalid payment mode');
    const {data:id,error}=await auth.supabase.rpc('create_booking_first_website',{
      p_workspace_id:workspaceId,p_name:name.trim(),p_template_name:templateName,
      p_primary_domain:primaryDomain.toLowerCase(),p_payment_mode:paymentMode
    });
    if (error) {
      if (error.code==='23505'||/unique/i.test(error.message||'')) return errorResponse(res,409,'CONFLICT','Domain or website already exists');
      if (/modules must both be enabled/i.test(error.message||'')) return errorResponse(res,403,'MODULE_DISABLED','Website and booking modules must both be enabled');
      return errorResponse(res,500,'INTERNAL_ERROR','Unable to create website');
    }
    return res.status(201).json({website:{id,workspaceId,status:'draft',bookingPath:'/book',bookingProvider:'ks_os',paymentMode}});
  }

  const access=await requireWebsiteRead(auth.supabase,auth.user.id,workspaceId);
  if (access.error) return errorResponse(res,403,'FORBIDDEN','Website access denied');
  const [{data:sites,error:siteError},{data:modules,error:moduleError},{data:connections,error:connectionError}]=await Promise.all([
    auth.supabase.from('website_sites').select('id,workspace_id,project_id,template_name,status,primary_domain,booking_path,booking_provider,booking_external_tenant_id,payment_mode,engine_project_id,live_url,last_error_code,published_at,created_at,updated_at').eq('workspace_id',workspaceId),
    auth.supabase.from('workspace_modules').select('module,enabled').eq('workspace_id',workspaceId),
    auth.supabase.from('integration_connections').select('provider,status,external_account_id,last_error_code').eq('workspace_id',workspaceId)
  ]);
  if (siteError||moduleError||connectionError) return errorResponse(res,500,'INTERNAL_ERROR','Unable to load websites');
  return res.status(200).json({websites:(sites||[]).map(site=>({
    ...site, bookingReadiness:bookingReadiness(site,modules||[],connections||[]),
    publishReady:site.status==='ready'&&bookingReadiness(site,modules||[],connections||[]).ready
  }))});
};
