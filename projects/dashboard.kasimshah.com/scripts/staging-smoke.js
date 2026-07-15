const crypto=require('crypto');

function required(name){const value=process.env[name];if(!value)throw new Error(`${name} is required`);return value;}
async function json(url,options={}){const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});let body={};try{body=await response.json();}catch{}return{response,body};}

async function main(){
  if(process.env.APP_ENV!=='staging')throw new Error('Staging smoke refuses to run unless APP_ENV=staging');
  const dashboard=required('STAGING_DASHBOARD_URL').replace(/\/$/,''),ksOs=required('STAGING_KS_OS_URL').replace(/\/$/,'');
  const platformToken=required('STAGING_PLATFORM_ACCESS_TOKEN'),ksToken=required('KS_OS_SERVICE_TOKEN'),workspaceId=required('STAGING_WORKSPACE_ID'),cid=`release-${crypto.randomUUID()}`;
  const ksHeaders={Authorization:`Bearer ${ksToken}`,...(process.env.KS_OS_VERCEL_BYPASS_TOKEN?{'x-vercel-protection-bypass':process.env.KS_OS_VERCEL_BYPASS_TOKEN}:{})};
  const [health,readiness,bookingReadiness]=await Promise.all([
    json(`${dashboard}/api/health`,{headers:{'X-Correlation-ID':cid}}),
    json(`${dashboard}/api/platform/launch-readiness?workspaceId=${encodeURIComponent(workspaceId)}`,{headers:{Authorization:`Bearer ${platformToken}`,'X-Correlation-ID':cid}}),
    json(`${ksOs}/api/v1/service/health`,{headers:{...ksHeaders,'X-Correlation-ID':cid}}),
  ]);
  const requiredHeaders=['content-security-policy','x-content-type-options','referrer-policy','permissions-policy'];const missingHeaders=requiredHeaders.filter(name=>!health.response.headers.get(name));
  const evidence={correlationId:cid,dashboardHealth:health.body.status,dashboardReadiness:readiness.body.status,ksOsReadiness:bookingReadiness.body.status,securityHeaders:missingHeaders.length?'MISSING':'VERIFIED',timestamp:new Date().toISOString()};
  console.log(JSON.stringify(evidence,null,2));
  if(!health.response.ok||!readiness.response.ok||readiness.body.status!=='READY'||!bookingReadiness.response.ok||missingHeaders.length)throw new Error(`Staging readiness failed; inspect the controlled check codes above${missingHeaders.length?`; missing headers: ${missingHeaders.join(', ')}`:''}`);
}
main().catch(error=>{console.error(`Smoke failed: ${error.message}`);process.exit(1);});
