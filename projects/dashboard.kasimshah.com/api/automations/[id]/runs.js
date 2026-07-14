const {requireAuth,errorResponse,handleCors}=require('../../_utils');
const {UUID_RE,requireAutomationAccess}=require('../../_automations');

module.exports=async function(req,res){
  if(handleCors(req,res))return;if(req.method!=='GET')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only GET is allowed');
  const auth=await requireAuth(req);if(auth.error)return errorResponse(res,auth.status,auth.error,'Authentication required');
  const {id,workspaceId}=req.query;if(!UUID_RE.test(id||'')||!UUID_RE.test(workspaceId||''))return errorResponse(res,400,'VALIDATION_ERROR','Invalid run history request');
  const access=await requireAutomationAccess(auth.supabase,auth.user.id,workspaceId,['owner','admin','editor','viewer']);if(access.error)return errorResponse(res,access.status||403,access.error.code||'FORBIDDEN',access.error.message||'Access denied');
  const {data,error}=await auth.supabase.from('automation_runs').select('id,status,current_step,attempt_count,started_at,completed_at,failure_code,created_at,automation_events(event_type,occurred_at)').eq('workspace_id',workspaceId).eq('automation_id',id).order('created_at',{ascending:false}).limit(50);
  if(error)return errorResponse(res,500,'RUN_HISTORY_UNAVAILABLE','Run history could not be loaded');return res.status(200).json({runs:data||[]});
};
