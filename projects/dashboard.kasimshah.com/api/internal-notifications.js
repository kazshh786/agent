const {requireAuth,errorResponse,handleCors}=require('./_utils');
const {UUID_RE,requireAutomationAccess}=require('./_automations');

module.exports=async function(req,res){
  if(handleCors(req,res))return;if(req.method!=='GET')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only GET is allowed');
  const auth=await requireAuth(req);if(auth.error)return errorResponse(res,auth.status,auth.error,'Authentication required');const workspaceId=req.query.workspaceId;
  if(!UUID_RE.test(workspaceId||''))return errorResponse(res,400,'VALIDATION_ERROR','Invalid workspace identifier');
  const access=await requireAutomationAccess(auth.supabase,auth.user.id,workspaceId,['owner','admin','editor','viewer']);if(access.error)return errorResponse(res,access.status||403,access.error.code||'FORBIDDEN',access.error.message||'Access denied');
  const {data,error}=await auth.supabase.from('internal_notifications').select('id,title,message,severity,read_at,created_at').eq('workspace_id',workspaceId).order('created_at',{ascending:false}).limit(50);
  if(error)return errorResponse(res,500,'NOTIFICATIONS_UNAVAILABLE','Notifications could not be loaded');return res.status(200).json({notifications:data||[]});
};
