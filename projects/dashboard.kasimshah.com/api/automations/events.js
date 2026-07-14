const {createSupabaseServiceClient,errorResponse,handleCors}=require('../_utils');
const {verifyEventSignature,sanitizeEvent}=require('../_automations');

module.exports=async function(req,res){
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
  return res.status(202).json({accepted:true,eventId:data});
};
