const {createSupabaseServiceClient,errorResponse,rejectUnknownFields}=require('../_utils');
const {verifySignedRequest,identityHmac}=require('../_trusted-analytics');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only POST is allowed');if(!verifySignedRequest(req).valid)return errorResponse(res,401,'INVALID_SIGNATURE','Signed identity request verification failed');
  if(!rejectUnknownFields(req.body,['workspaceId','websiteId','sessionId','customerReference','identifier','consentBasis','triggerType','sourceEventId']).valid)return errorResponse(res,400,'INVALID_LINKAGE','Unknown fields');const b=req.body||{};
  if(!UUID.test(b.workspaceId||'')||!UUID.test(b.websiteId||'')||!UUID.test(b.sessionId||'')||!['analytics','marketing'].includes(b.consentBasis)||!['form_submitted','booking_created'].includes(b.triggerType)||!/^[-A-Za-z0-9_:/.]{8,200}$/.test(b.sourceEventId||'')||typeof b.identifier!=='string'||b.identifier.trim().length<3||b.identifier.length>320)return errorResponse(res,400,'INVALID_LINKAGE','Identity linkage requires a valid form or booking submission');
  let hmac;try{hmac=identityHmac(b.workspaceId,b.identifier);}catch{return errorResponse(res,503,'IDENTITY_SECURITY_NOT_CONFIGURED','Identity security is not configured');}
  const db=createSupabaseServiceClient();const {data,error}=await db.rpc('link_attribution_identity',{p_workspace_id:b.workspaceId,p_website_id:b.websiteId,p_session_id:b.sessionId,p_customer_reference:typeof b.customerReference==='string'?b.customerReference.slice(0,200):null,p_identity_hmac:hmac,p_consent_basis:b.consentBasis});if(error)return errorResponse(res,409,'LINKAGE_REJECTED','Identity linkage was rejected');return res.status(200).json({linked:true,identityId:data});
};
