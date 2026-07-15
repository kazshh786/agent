const {errorResponse,handleCors,createSupabaseServiceClient}=require('../_utils');
const {authorize,loadCanonical,toCsv}=require('../_unified-analytics');
module.exports=async function(req,res){
  if(handleCors(req,res))return;if(req.method!=='GET')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only GET is allowed');
  const auth=await authorize(req);if(auth.error)return errorResponse(res,auth.status,auth.error,auth.message||'Analytics access denied');
  try{
    const data=await loadCanonical(auth.supabase,auth.filters,5001);if(data.conversions.length>5000)return errorResponse(res,413,'EXPORT_LIMIT_EXCEEDED','Export is limited to 5,000 rows');
    const columns=['conversion_type','booking_reference','booking_type','occurred_at','revenue_minor','currency','source','source_event_id'];const csv=toCsv(data.conversions,columns);
    const service=createSupabaseServiceClient();const {error:auditError}=await service.from('analytics_export_audit').insert({workspace_id:auth.filters.workspaceId,actor_id:auth.user.id,row_count:data.conversions.length,filters:{from:auth.filters.from,to:auth.filters.to,websiteId:auth.filters.websiteId,channel:auth.filters.channel,bookingType:auth.filters.bookingType}});if(auditError)return errorResponse(res,500,'EXPORT_AUDIT_FAILED','Analytics export could not be audited');
    res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="analytics-${auth.filters.from}-${auth.filters.to}.csv"`);res.setHeader('Cache-Control','no-store');return res.status(200).send(csv);
  }catch{return errorResponse(res,500,'EXPORT_FAILED','Analytics export could not be generated');}
};
