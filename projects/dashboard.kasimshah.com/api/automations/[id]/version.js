const {requireAuth,errorResponse,handleCors,rejectUnknownFields}=require('../../_utils');
const {UUID_RE,validateDefinition,requireAutomationAccess}=require('../../_automations');
module.exports=async function(req,res){
  if(handleCors(req,res))return;if(req.method!=='POST')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only POST is allowed');const auth=await requireAuth(req);if(auth.error)return errorResponse(res,auth.status,auth.error,'Authentication required');
  if(!UUID_RE.test(req.query.id||'')||!rejectUnknownFields(req.body,['workspaceId','triggerType','definition']).valid)return errorResponse(res,400,'VALIDATION_ERROR','Invalid version request');
  const access=await requireAutomationAccess(auth.supabase,auth.user.id,req.body.workspaceId,['owner','admin','editor']);if(access.error)return errorResponse(res,access.status||403,access.error.code||'FORBIDDEN',access.error.message||'Access denied');const validation=validateDefinition(req.body.triggerType,req.body.definition);if(!validation.valid)return errorResponse(res,400,validation.code,validation.message);
  const {data,error}=await auth.supabase.rpc('create_automation_version',{p_automation_id:req.query.id,p_trigger_type:req.body.triggerType,p_definition:req.body.definition});if(error)return errorResponse(res,400,'VERSION_CREATE_FAILED','Automation version could not be created');return res.status(201).json({version:{id:data}});
};
