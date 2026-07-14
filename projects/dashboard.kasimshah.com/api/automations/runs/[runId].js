const {requireAuth,errorResponse,handleCors,rejectUnknownFields}=require('../../_utils');
const {UUID_RE,requireAutomationAccess}=require('../../_automations');

module.exports=async function(req,res){
  if(handleCors(req,res))return;const auth=await requireAuth(req);if(auth.error)return errorResponse(res,auth.status,auth.error,'Authentication required');
  const runId=req.query.runId,workspaceId=req.query.workspaceId||req.body?.workspaceId;if(!UUID_RE.test(runId||'')||!UUID_RE.test(workspaceId||''))return errorResponse(res,400,'VALIDATION_ERROR','Invalid run request');
  const roles=req.method==='PATCH'?['owner','admin','editor']:['owner','admin','editor','viewer'];const access=await requireAutomationAccess(auth.supabase,auth.user.id,workspaceId,roles);if(access.error)return errorResponse(res,access.status||403,access.error.code||'FORBIDDEN',access.error.message||'Access denied');
  if(req.method==='GET'){
    const {data,error}=await auth.supabase.from('automation_runs').select('id,status,current_step,attempt_count,started_at,completed_at,failure_code,created_at,automation_run_steps(step_index,action_type,status,attempt_count,started_at,completed_at,next_retry_at,controlled_error_code,safe_output)').eq('id',runId).eq('workspace_id',workspaceId).single();
    if(error||!data)return errorResponse(res,404,'RUN_NOT_FOUND','Automation run not found');return res.status(200).json({run:data});
  }
  if(req.method==='PATCH'){
    if(!rejectUnknownFields(req.body,['workspaceId','action']).valid||req.body.action!=='cancel')return errorResponse(res,400,'VALIDATION_ERROR','Only cancellation is allowed');
    const {data,error}=await auth.supabase.rpc('cancel_automation_run',{p_run_id:runId});if(error||!data)return errorResponse(res,409,'RUN_NOT_CANCELLABLE','Automation run cannot be cancelled');return res.status(200).json({run:{id:runId,status:'cancelled'}});
  }
  return errorResponse(res,405,'METHOD_NOT_ALLOWED','Method not allowed');
};
