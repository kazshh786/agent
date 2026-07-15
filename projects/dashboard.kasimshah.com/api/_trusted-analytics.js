const crypto=require('crypto');
function stableBody(req){return req.rawBody?Buffer.isBuffer(req.rawBody)?req.rawBody:Buffer.from(req.rawBody):Buffer.from(JSON.stringify(req.body||{}));}
function verifySignedRequest(req){
  const secret=process.env.AUTOMATION_EVENT_SECRET||'',timestamp=String(req.headers['x-ks-timestamp']||''),signature=String(req.headers['x-ks-signature']||'');
  if(secret.length<32||!/^\d{10}$/.test(timestamp)||!(/^[0-9a-f]{64}$/i.test(signature)))return{valid:false,code:'INVALID_SIGNATURE'};
  if(Math.abs(Math.floor(Date.now()/1000)-Number(timestamp))>300)return{valid:false,code:'STALE_SIGNATURE'};
  const expected=crypto.createHmac('sha256',secret).update(`${timestamp}.`).update(stableBody(req)).digest('hex');
  const a=Buffer.from(expected),b=Buffer.from(signature.toLowerCase());return{valid:a.length===b.length&&crypto.timingSafeEqual(a,b),code:'INVALID_SIGNATURE'};
}
function identityHmac(workspaceId,identifier){const secret=process.env.ATTRIBUTION_IDENTITY_SECRET||'';if(secret.length<32)throw new Error('IDENTITY_SECRET_NOT_CONFIGURED');return crypto.createHmac('sha256',secret).update(`${workspaceId}:${String(identifier).trim().toLowerCase()}`).digest('hex');}
module.exports={verifySignedRequest,identityHmac};
