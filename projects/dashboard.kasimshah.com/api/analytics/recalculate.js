const {errorResponse,handleCors,rejectUnknownFields}=require('../_utils');
const {authorize}=require('../_unified-analytics');
module.exports=async function(req,res){
  if(handleCors(req,res))return;if(req.method!=='POST')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only POST is allowed');
  req.query={...(req.query||{}),...(req.body||{})};if(!rejectUnknownFields(req.body,['workspaceId','websiteId','from','to','channel','source','campaign','bookingType']).valid)return errorResponse(res,400,'VALIDATION_ERROR','Unknown request fields');
  const auth=await authorize(req,['owner','admin']);if(auth.error)return errorResponse(res,auth.status,auth.error,auth.message||'Recalculation denied');
  const {data,error}=await auth.supabase.rpc('recalculate_workspace_attribution',{p_workspace_id:auth.filters.workspaceId,p_from:auth.filters.from,p_to:auth.filters.to});if(error)return errorResponse(res,500,'RECALCULATION_FAILED','Attribution could not be recalculated');return res.status(202).json({accepted:true,result:data});
};
