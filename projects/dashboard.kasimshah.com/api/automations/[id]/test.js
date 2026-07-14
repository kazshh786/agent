const {requireAuth,errorResponse,handleCors,rejectUnknownFields}=require('../../_utils');
const {UUID_RE,validateDefinition,requireAutomationAccess,substitute}=require('../../_automations');

module.exports=async function(req,res){
  if(handleCors(req,res))return;if(req.method!=='POST')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only POST is allowed');
  const auth=await requireAuth(req);if(auth.error)return errorResponse(res,auth.status,auth.error,'Authentication required');
  if(!UUID_RE.test(req.query.id||'')||!rejectUnknownFields(req.body,['workspaceId','versionId']).valid||!UUID_RE.test(req.body?.workspaceId||'')||!UUID_RE.test(req.body?.versionId||''))return errorResponse(res,400,'VALIDATION_ERROR','Invalid test request');
  const access=await requireAutomationAccess(auth.supabase,auth.user.id,req.body.workspaceId,['owner','admin','editor']);if(access.error)return errorResponse(res,access.status||403,access.error.code||'FORBIDDEN',access.error.message||'Access denied');
  const {data:version,error}=await auth.supabase.from('automation_versions').select('trigger_type,definition').eq('id',req.body.versionId).eq('automation_id',req.query.id).eq('workspace_id',req.body.workspaceId).single();
  if(error||!version)return errorResponse(res,404,'VERSION_NOT_FOUND','Automation version not found');
  const validation=validateDefinition(version.trigger_type,version.definition);if(!validation.valid)return errorResponse(res,400,validation.code,validation.message);
  const sample={'contact.id':'test-contact','booking.reference':'TEST-BOOKING','booking.start_time':new Date(Date.now()+86400000).toISOString(),'booking.end_time':new Date(Date.now()+90000000).toISOString(),'booking.channel':'in_shop','workspace.name':'Test workspace','website.booking_url':'https://example.invalid/book'};
  return res.status(200).json({testMode:true,triggerType:version.trigger_type,steps:version.definition.steps.map((step,index)=>({index,type:step.type,status:step.type==='delay.until'?'would_schedule':'would_run',config:substitute(step.config,sample)}))});
};
