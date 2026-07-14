const {requireAuth,errorResponse,handleCors,rejectUnknownFields}=require('../_utils');
const {UUID_RE,requireAutomationAccess}=require('../_automations');
module.exports=async function(req,res){
  if(handleCors(req,res))return;const auth=await requireAuth(req);if(auth.error)return errorResponse(res,auth.status,auth.error,'Authentication required');const id=req.query.id,workspaceId=req.query.workspaceId||req.body?.workspaceId;
  if(!UUID_RE.test(id||''))return errorResponse(res,400,'VALIDATION_ERROR','Invalid automation identifier');
  const roles=req.method==='GET'?['owner','admin','editor','viewer']:['owner','admin'];const access=await requireAutomationAccess(auth.supabase,auth.user.id,workspaceId,roles);if(access.error)return errorResponse(res,access.status||403,access.error.code||'FORBIDDEN',access.error.message||'Access denied');
  if(req.method==='GET'){
    const {data,error}=await auth.supabase.from('automation_definitions').select('id,workspace_id,name,description,status,latest_version_id,active_version_id,created_at,updated_at,automation_versions(id,version_number,trigger_type,definition,created_at)').eq('id',id).eq('workspace_id',workspaceId).single();
    if(error||!data)return errorResponse(res,404,'AUTOMATION_NOT_FOUND','Automation not found');return res.status(200).json({automation:data});
  }
  if(req.method==='PATCH'){
    if(!rejectUnknownFields(req.body,['workspaceId','status']).valid||!['paused','archived'].includes(req.body.status))return errorResponse(res,400,'VALIDATION_ERROR','Only pause or archive is allowed');
    const {error}=await auth.supabase.rpc('set_automation_state',{p_automation_id:id,p_version_id:null,p_status:req.body.status});if(error)return errorResponse(res,403,'AUTOMATION_UPDATE_DENIED','Automation state could not be changed');return res.status(200).json({automation:{id,status:req.body.status}});
  }
  return errorResponse(res,405,'METHOD_NOT_ALLOWED','Method not allowed');
};
