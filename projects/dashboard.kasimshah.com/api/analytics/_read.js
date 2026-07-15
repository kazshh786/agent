const {errorResponse,handleCors}=require('../_utils');
const {authorize,loadCanonical,summarizeCanonical}=require('../_unified-analytics');
async function read(req,res,project){
  if(handleCors(req,res))return;if(req.method!=='GET')return errorResponse(res,405,'METHOD_NOT_ALLOWED','Only GET is allowed');
  const auth=await authorize(req);if(auth.error)return errorResponse(res,auth.status,auth.error,auth.message||'Analytics access denied');
  try{const data=await loadCanonical(auth.supabase,auth.filters);return res.status(200).json(project(summarizeCanonical(data,auth.filters),data,auth));}
  catch{return errorResponse(res,500,'ANALYTICS_UNAVAILABLE','Analytics data is temporarily unavailable');}
}
module.exports={read};
