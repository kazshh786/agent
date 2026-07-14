const { requireAuth, requireWorkspaceMembership, requireActiveWorkspace, requireEnabledModule, validateUUID, errorResponse, handleCors }=require('../_utils');
const {summarizeEvents}=require('../_analytics');

module.exports=async function(req,res){
  if(handleCors(req,res))return;
  if(req.method!=='GET')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only GET is allowed');
  const auth=await requireAuth(req);if(auth.error)return errorResponse(res,auth.status,auth.error,'Authentication required');
  const workspaceId=req.query.workspaceId;if(!validateUUID(workspaceId))return errorResponse(res,400,'VALIDATION_ERROR','Valid workspaceId required');
  const membership=await requireWorkspaceMembership(auth.supabase,auth.user.id,workspaceId);if(membership.error)return errorResponse(res,403,'FORBIDDEN','Analytics access denied');
  const active=await requireActiveWorkspace(auth.supabase,workspaceId);if(active.error)return errorResponse(res,active.status,active.error.code,active.error.message);
  const entitlement=await requireEnabledModule(auth.supabase,workspaceId,'analytics');if(entitlement.error)return errorResponse(res,403,'MODULE_DISABLED','Analytics module is disabled');
  const days=Math.max(1,Math.min(Number.parseInt(req.query.days,10)||30,90));
  const since=new Date(Date.now()-days*86400000).toISOString();
  let query=auth.supabase.from('website_conversion_events').select('website_id,session_id,event_name,value_minor,currency,occurred_at').eq('workspace_id',workspaceId).gte('occurred_at',since).order('occurred_at',{ascending:true}).limit(50000);
  if(req.query.websiteId){if(!validateUUID(req.query.websiteId))return errorResponse(res,400,'VALIDATION_ERROR','Invalid websiteId');query=query.eq('website_id',req.query.websiteId);}
  const {data:events,error}=await query;if(error)return errorResponse(res,500,'INTERNAL_ERROR','Unable to load analytics');
  return res.status(200).json(summarizeEvents(events||[],days));
};
