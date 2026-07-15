const {requireAuth,requirePlatformRole,createSupabaseServiceClient,validateUUID,errorResponse,handleCors}=require('../_utils');
const {correlationId,logEvent}=require('../_observability');
const REQUIRED_MODULES=['website','booking','analytics','automations'];
const nowIso=()=>new Date().toISOString();
function result(state,code,explanation,remediation,checkedAt=nowIso()){return{state,code,explanation,remediation,lastCheckedAt:checkedAt};}
const ready=(code,explanation)=>result('READY',code,explanation,null);
const blocked=(code,explanation,remediation)=>result('BLOCKED',code,explanation,remediation);
const degraded=(code,explanation,remediation)=>result('DEGRADED',code,explanation,remediation);
const fresh=(value,minutes=15)=>value&&Date.now()-Date.parse(value)<=minutes*60000;
function overallStatus(checks){const values=Object.values(checks);return values.some(x=>x.state==='BLOCKED')?'BLOCKED':values.some(x=>x.state==='DEGRADED')?'DEGRADED':'READY';}
function stripeCheck(paymentRequired,signal){return!paymentRequired?ready('STRIPE_NOT_REQUIRED','Online payments are not required by the selected launch configuration.'):signal?.status==='healthy'&&fresh(signal.last_success_at,60)?ready('STRIPE_WEBHOOK_HEALTHY','A recent verified Stripe webhook was processed.'):blocked('STRIPE_WEBHOOK_UNHEALTHY','Online payment is enabled without a recent healthy Stripe webhook.','Complete a Stripe test-mode payment and verify the signed webhook.');}

module.exports=async function(req,res){
  if(handleCors(req,res))return;const cid=correlationId(req);res.setHeader('X-Correlation-ID',cid);res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only GET is allowed');
  const auth=await requireAuth(req);if(auth.error)return errorResponse(res,auth.status,auth.error,'Authentication required');
  const role=await requirePlatformRole(auth.supabase,auth.user.id,['platform_owner','platform_admin']);if(role.error)return errorResponse(res,403,'FORBIDDEN','Launch readiness requires platform owner or admin access');
  const workspaceId=req.query.workspaceId;if(!validateUUID(workspaceId))return errorResponse(res,400,'VALIDATION_ERROR','Valid workspaceId required');
  const checks={};const db=createSupabaseServiceClient();
  const requiredEnv=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','APP_URL','WEBSITE_ENGINE_API_URL','WEBSITE_ENGINE_API_TOKEN','INTEGRATION_ENCRYPTION_KEY','JOB_RUNNER_SECRET','KS_OS_API_URL','KS_OS_SERVICE_TOKEN','BOOKING_RATE_LIMIT_SALT','AUTOMATION_EVENT_SECRET','ATTRIBUTION_IDENTITY_SECRET','AUTOMATION_WORKER_SECRET'];
  const missing=requiredEnv.filter(name=>!process.env[name]||(/SECRET|KEY|SALT/.test(name)&&String(process.env[name]).length<32));
  checks.environment=missing.length?blocked('ENVIRONMENT_INCOMPLETE','One or more required server settings are absent or too short.',`Configure: ${missing.join(', ')}.`):ready('ENVIRONMENT_READY','Required launch secrets and service URLs are configured.');
  checks.mockFallbacks=process.env.ALLOW_MOCK_FALLBACKS==='true'?blocked('SYNTHETIC_FALLBACKS_ENABLED','Synthetic provider fallback mode is enabled.','Remove ALLOW_MOCK_FALLBACKS or set it to false.'):ready('NO_SYNTHETIC_FALLBACKS','No synthetic provider fallback mode is enabled.');
  checks.securityHeaders=process.env.SECURITY_HEADERS_ACTIVE==='true'?ready('SECURITY_HEADERS_ACTIVE','Deployment security headers are marked active.'):blocked('SECURITY_HEADERS_UNVERIFIED','Security headers have not been verified for this environment.','Verify the deployed CSP, frame, content-type, referrer, and permissions headers, then set SECURITY_HEADERS_ACTIVE=true.');
  try{
    const [{data:workspace,error:workspaceError},{data:owners},{data:modules},{data:sites},{data:connections},{data:health},{data:criticalJobs},{data:failedRuns},{data:acceptedOwner},{data:testBookings},{data:automations},{error:migrationError}]=await Promise.all([
      db.from('workspaces').select('id,status,owner_id').eq('id',workspaceId).single(),
      db.from('platform_users').select('user_id').eq('role','platform_owner').eq('is_active',true).limit(1),
      db.from('workspace_modules').select('module,enabled').eq('workspace_id',workspaceId),
      db.from('website_sites').select('id,status,booking_path,booking_external_tenant_id,payment_mode,live_url').eq('workspace_id',workspaceId),
      db.from('integration_connections').select('provider,status,external_account_id,last_checked_at,last_error_code').eq('workspace_id',workspaceId),
      db.from('analytics_runtime_health').select('component,status,last_success_at,last_failure_at,last_error_code,checked_at').eq('workspace_id',workspaceId),
      db.from('integration_jobs').select('id').eq('workspace_id',workspaceId).eq('status','failed').limit(1),
      db.from('automation_runs').select('id').eq('workspace_id',workspaceId).eq('status','failed').gte('created_at',new Date(Date.now()-86400000).toISOString()).limit(1),
      db.from('workspace_members').select('user_id').eq('workspace_id',workspaceId).eq('role','owner').limit(1),
      db.from('attribution_conversions').select('id,occurred_at,safe_metadata').eq('workspace_id',workspaceId).eq('conversion_type','booking_confirmed').gte('occurred_at',new Date(Date.now()-86400000).toISOString()).limit(20),
      db.from('automation_definitions').select('id').eq('workspace_id',workspaceId).eq('status','active').limit(1),
      db.from('attribution_sessions').select('id',{head:true,count:'exact'}).eq('workspace_id',workspaceId)
    ]);
    checks.migrations=migrationError?blocked('MIGRATION_MISSING','Unified attribution schema is not available.','Apply migrations through 20260714080000_unified_attribution.sql.'):ready('MIGRATIONS_APPLIED','Unified attribution schema is queryable.');
    checks.platformOwner=owners?.length?ready('PLATFORM_OWNER_CONFIGURED','An active platform owner exists.'):blocked('PLATFORM_OWNER_MISSING','No active platform owner exists.','Bootstrap and verify the initial platform owner.');
    checks.workspace=workspaceError||!workspace?blocked('WORKSPACE_NOT_FOUND','The launch workspace was not found.','Select a valid launch workspace.'):workspace.status==='active'?ready('WORKSPACE_ACTIVE','The launch workspace is active.'):blocked('WORKSPACE_NOT_ACTIVE',`The launch workspace is ${workspace.status}.`,'Resolve provisioning and activate the workspace.');
    checks.customerOwner=workspace?.owner_id&&acceptedOwner?.some(x=>x.user_id===workspace.owner_id)?ready('CUSTOMER_OWNER_ACCEPTED','The customer owner has accepted workspace access.'):blocked('CUSTOMER_OWNER_NOT_ACCEPTED','The customer owner invitation has not been accepted.','Invite the customer owner and complete acceptance before launch.');
    const enabled=new Set((modules||[]).filter(x=>x.enabled).map(x=>x.module));const disabled=REQUIRED_MODULES.filter(x=>!enabled.has(x));checks.modules=disabled.length?blocked('REQUIRED_MODULES_DISABLED','Required initial-launch modules are disabled.',`Enable: ${disabled.join(', ')}.`):ready('REQUIRED_MODULES_ENABLED','Website, booking, analytics, and automations are enabled.');
    const ks=(connections||[]).find(x=>x.provider==='ks_os');checks.ksOs=ks?.status==='connected'&&fresh(ks.last_checked_at,30)?ready('KS_OS_HEALTHY','KS OS connection passed a recent health check.'):blocked('KS_OS_STALE_OR_UNHEALTHY','KS OS is disconnected, degraded, or stale.','Test the KS OS connection and confirm its tenant mapping.');
    const site=(sites||[])[0];checks.bookingTenant=ks?.external_account_id&&site?.booking_external_tenant_id&&String(ks.external_account_id)===String(site.booking_external_tenant_id)?ready('BOOKING_TENANT_MAPPED','The website and KS OS tenant mapping matches.'):blocked('BOOKING_TENANT_NOT_MAPPED','The launch website and KS OS connection do not share the same tenant mapping.','Connect KS OS and assign the exact external tenant ID to the website.');
    checks.bookingPage=site&&site.booking_path==='/book'&&['ready','published'].includes(site.status)&&site.live_url?ready('BOOK_PAGE_COMPILED','The booking-first website has a compiled /book route.'):blocked('BOOK_PAGE_NOT_COMPILED','The launch website does not have a ready /book route.','Compile and verify the booking-first website.');
    checks.testBooking=testBookings?.some(x=>x.safe_metadata?.test===true)?ready('TEST_BOOKING_COMPLETED','A signed test booking confirmation has been recorded.'):blocked('TEST_BOOKING_MISSING','No signed booking confirmation marked as a launch test has been recorded.','Complete a pay-later test booking and send the signed confirmation with metadata.test=true.');
    const paymentRequired=sites?.some(x=>['deposit','full_payment','customer_choice'].includes(x.payment_mode));const stripe=(health||[]).find(x=>x.component==='stripe_webhook');checks.stripeWebhook=stripeCheck(paymentRequired,stripe);
    const browser=(health||[]).find(x=>x.component==='browser_ingestion'),trusted=(health||[]).find(x=>x.component==='trusted_ingestion');checks.analytics=browser?.status==='healthy'&&trusted?.status==='healthy'&&fresh(browser.last_success_at,60)&&fresh(trusted.last_success_at,60)?ready('ANALYTICS_INGESTION_HEALTHY','Browser and trusted analytics ingestion are healthy.'):degraded('ANALYTICS_INGESTION_STALE','One analytics ingestion stream is missing or stale.','Generate a website event and a signed KS OS event, then recheck freshness.');
    const worker=(health||[]).find(x=>x.component==='automation_worker');checks.automation=worker?.status==='healthy'&&fresh(worker.last_success_at,10)&&automations?.length?ready('AUTOMATION_WORKER_HEALTHY','An active automation and recent worker heartbeat are present.'):degraded('AUTOMATION_WORKER_STALE','The automation worker heartbeat or active automation is missing.','Activate a launch automation and invoke the worker cron.');
    checks.criticalJobs=criticalJobs?.length||failedRuns?.length?blocked('CRITICAL_JOBS_FAILED','At least one critical integration job or recent automation run is failed.','Review and retry or resolve failed integration jobs and automation runs.'):ready('NO_FAILED_CRITICAL_JOBS','No failed critical integration jobs or recent automation runs were found.');
  }catch{checks.database=blocked('READINESS_QUERY_FAILED','Launch checks could not query required platform state.','Confirm the migration, database connectivity, and service-role configuration.');}
  const values=Object.values(checks),status=overallStatus(checks);logEvent(status==='READY'?'info':'warn','platform.launch_readiness',cid,{workspaceId,status,checkCodes:values.map(x=>x.code)});
  return res.status(200).json({status,workspaceId,checks,checkedAt:nowIso(),correlationId:cid,automaticDeployment:false});
};
module.exports.overallStatus=overallStatus;
module.exports.fresh=fresh;
module.exports.stripeCheck=stripeCheck;
