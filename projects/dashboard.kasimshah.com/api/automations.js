const {requireAuth,errorResponse,handleCors,rejectUnknownFields}=require('./_utils');
const {validateDefinition,requireAutomationAccess}=require('./_automations');

module.exports=async function(req,res){
  if(handleCors(req,res))return;const auth=await requireAuth(req);if(auth.error)return errorResponse(res,auth.status,auth.error,'Authentication required');
  const workspaceId=req.method==='GET'?req.query.workspaceId:req.body?.workspaceId;
  const access=await requireAutomationAccess(auth.supabase,auth.user.id,workspaceId,req.method==='GET'?['owner','admin','editor','viewer']:['owner','admin','editor']);if(access.error)return errorResponse(res,access.status||403,access.error.code||'FORBIDDEN',access.error.message||'Access denied');
  if(req.method==='GET'){
    const {data,error}=await auth.supabase.from('automation_definitions').select('id,workspace_id,name,description,status,latest_version_id,active_version_id,created_at,updated_at').eq('workspace_id',workspaceId).order('updated_at',{ascending:false});
    if(error)return errorResponse(res,500,'AUTOMATIONS_UNAVAILABLE','Automations could not be loaded');return res.status(200).json({automations:data||[]});
  }
  if(req.method==='POST'){
    if(!rejectUnknownFields(req.body,['workspaceId','name','description','triggerType','definition']).valid)return errorResponse(res,400,'VALIDATION_ERROR','Unknown automation fields');
    const validation=validateDefinition(req.body.triggerType,req.body.definition);if(!validation.valid)return errorResponse(res,400,validation.code,validation.message);
    const {data,error}=await auth.supabase.rpc('create_automation_draft',{p_workspace_id:workspaceId,p_name:req.body.name,p_description:req.body.description||null,p_trigger_type:req.body.triggerType,p_definition:req.body.definition});
    if(error)return errorResponse(res,/module is disabled/i.test(error.message||'')?403:400,/module is disabled/i.test(error.message||'')?'MODULE_DISABLED':'AUTOMATION_CREATE_FAILED','Automation could not be created');
    const {data:created}=await auth.supabase.from('automation_definitions').select('id,status,latest_version_id').eq('id',data).eq('workspace_id',workspaceId).single();
    return res.status(201).json({automation:{id:data,status:'draft',latestVersionId:created?.latest_version_id||null}});
  }
  return errorResponse(res,405,'METHOD_NOT_ALLOWED','Method not allowed');
};
