const {createSupabaseServiceClient,errorResponse,handleCors}=require('../_utils');
const {verifyEventSignature,sanitizeEvent}=require('../_automations');
const {correlationId,logEvent}=require('../_observability');

module.exports=async function(req,res){
  const cid=correlationId(req);res.setHeader('X-Correlation-ID',cid);
  if(handleCors(req,res))return;
  if(req.method!=='POST')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only POST is allowed');
  const verified=verifyEventSignature(req.body||{},req.headers||{});
  if(!verified.valid)return errorResponse(res,verified.status||401,verified.code||'INVALID_EVENT_SIGNATURE','Event authentication failed');
  const sanitized=sanitizeEvent(req.body||{});
  if(sanitized.error)return errorResponse(res,400,sanitized.error,'Event payload is invalid');
  const event=sanitized.value,db=createSupabaseServiceClient();
  const [{data:workspace},{data:module}]=await Promise.all([
    db.from('workspaces').select('status').eq('id',event.workspaceId).single(),
    db.from('workspace_modules').select('enabled').eq('workspace_id',event.workspaceId).eq('module','automations').single(),
  ]);
  if(workspace?.status!=='active')return errorResponse(res,403,'WORKSPACE_INACTIVE','Workspace is not active');
  if(!module?.enabled)return errorResponse(res,403,'MODULE_DISABLED','Automation module is disabled');
  const {data,error}=await db.rpc('ingest_automation_event',{p_workspace_id:event.workspaceId,p_event_type:event.eventType,p_source:event.source,p_source_event_id:event.sourceEventId,p_subject_type:event.subjectType,p_subject_id:event.subjectId,p_occurred_at:event.occurredAt,p_safe_payload:event.payload,p_causation_id:event.causationId,p_depth:event.depth});
  if(error)return errorResponse(res,500,'EVENT_INGEST_FAILED','Event could not be accepted');
  if(event.source==='ks_os'&&['booking.created','booking.cancelled','appointment.completed'].includes(event.eventType)){
    const [{data:link},{data:sites}]=await Promise.all([db.from('booking_attribution_links').select('website_id,session_id').eq('workspace_id',event.workspaceId).eq('booking_reference',event.payload.bookingReference||event.subjectId).maybeSingle(),db.from('website_sites').select('id').eq('workspace_id',event.workspaceId).limit(1)]);const status=String(event.payload.status||'').toUpperCase();
    const conversionType=event.eventType==='booking.created'?(status==='CONFIRMED'?'booking_confirmed':'booking_created'):event.eventType==='booking.cancelled'?'booking_cancelled':'appointment_completed';
    const bookingType=event.payload.bookingChannel==='mobile'?'mobile':event.payload.bookingChannel==='in_shop'?'shop':null;
    const {error:analyticsError}=await db.rpc('record_trusted_attribution_conversion',{p_workspace_id:event.workspaceId,p_website_id:link?.website_id||sites?.[0]?.id||null,p_session_id:link?.session_id||null,p_conversion_type:conversionType,p_booking_reference:event.payload.bookingReference||event.subjectId,p_booking_type:bookingType,p_occurred_at:event.occurredAt,p_revenue_minor:null,p_currency:null,p_source:'ks_os',p_source_event_id:event.sourceEventId,p_safe_metadata:{status:event.payload.status||null}});
    if(analyticsError){await db.from('analytics_runtime_health').upsert({workspace_id:event.workspaceId,component:'trusted_ingestion',status:'failed',last_failure_at:new Date().toISOString(),last_error_code:'SIGNED_BOOKING_REJECTED',checked_at:new Date().toISOString()},{onConflict:'workspace_id,component'});logEvent('error','analytics.ks_os_conversion_rejected',cid,{workspaceId:event.workspaceId,eventType:event.eventType});return errorResponse(res,500,'ANALYTICS_INGEST_FAILED','Signed booking event could not be recorded for analytics');}
  }
  logEvent('info','automation.event_accepted',cid,{workspaceId:event.workspaceId,eventType:event.eventType,source:event.source});
  return res.status(202).json({accepted:true,eventId:data});
};
