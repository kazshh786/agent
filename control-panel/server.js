const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true); // server-to-server and same-origin non-CORS requests
    const allowedOrigin = process.env.WEBSITE_ENGINE_ALLOWED_ORIGIN;
    if (allowedOrigin && origin === allowedOrigin) return callback(null, true);
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
}));
app.use(express.json({ limit: '50mb' }));

// Env credentials for serverless cloud integration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'kazshh786/agent';
const WORKSPACE_DIR = path.resolve(__dirname, '..');
const PROJECTS_DIR = path.join(WORKSPACE_DIR, 'projects');
const TEMPLATES_DIR = path.join(WORKSPACE_DIR, 'templates');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function buildAnalyticsSnippet({ analyticsKey, analyticsEndpoint, bookingLink }) {
  if (!analyticsKey || !analyticsEndpoint) return '';
  const config = JSON.stringify({ key: analyticsKey, endpoint: analyticsEndpoint, bookingPath: bookingLink || '/book' }).replace(/</g, '\\u003c');
  return `<script data-ks-conversion-tracker>(function(){'use strict';var c=${config};var sid=sessionStorage.getItem('ks_sid');if(!sid){sid=crypto.randomUUID();sessionStorage.setItem('ks_sid',sid);}function track(name,extra){var q=new URLSearchParams(location.search);var body=Object.assign({siteKey:c.key,eventId:crypto.randomUUID(),sessionId:sid,eventName:name,occurredAt:new Date().toISOString(),path:location.pathname,utm:{source:q.get('utm_source'),medium:q.get('utm_medium'),campaign:q.get('utm_campaign'),content:q.get('utm_content'),term:q.get('utm_term')},consent:sessionStorage.getItem('ks_analytics_consent')||'unknown'},extra||{});fetch(c.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),keepalive:true}).catch(function(){});}window.KSAnalytics={track:track,sessionId:sid};track(location.pathname.replace(/\\/$/,'')===c.bookingPath.replace(/\\/$/,'')?'booking_page_viewed':'page_view');document.addEventListener('click',function(e){var a=e.target.closest('a');if(!a)return;try{var u=new URL(a.href,location.href);if(u.origin===location.origin&&u.pathname.replace(/\\/$/,'')===c.bookingPath.replace(/\\/$/,''))track('booking_cta_clicked');}catch(_){}});})();</script>`;
}

function buildBookingWidgetSnippet({ analyticsKey, bookingApiEndpoint, paymentMode }) {
  if (!analyticsKey || !bookingApiEndpoint) return '';
  const config = JSON.stringify({ key: analyticsKey, endpoint: bookingApiEndpoint, paymentMode }).replace(/</g, '\\u003c');
  return `<script data-ks-booking-widget>(function(){'use strict';var c=${config},root=document.querySelector('[data-ks-booking-root]'),state={catalog:null,service:null,slot:null,booking:null,channel:null};if(!root)return;
function el(tag,text,attrs){var node=document.createElement(tag);if(text!==null&&text!==undefined)node.textContent=String(text);Object.keys(attrs||{}).forEach(function(k){if(k==='class')node.className=attrs[k];else node.setAttribute(k,attrs[k]);});return node;}
function track(name,payload,consent){if(window.KSAnalytics&&window.KSAnalytics.track)window.KSAnalytics.track(name,{metadata:payload||{},consent:consent||sessionStorage.getItem('ks_analytics_consent')||'unknown'});}
function api(action,options,query){var url=new URL(c.endpoint);url.searchParams.set('action',action);url.searchParams.set('siteKey',c.key);Object.keys(query||{}).forEach(function(k){url.searchParams.set(k,query[k]);});return fetch(url.toString(),options||{}).then(async function(response){var body=await response.json().catch(function(){return{};});if(!response.ok)throw new Error(body.error&&body.error.message||'Booking service unavailable');return body;});}
function field(label,type,name){var wrap=el('label');wrap.style.cssText='display:grid;gap:6px;font-weight:600';wrap.appendChild(el('span',label));var input=el('input',null,{type:type,name:name,required:'required'});input.style.cssText='padding:12px;border:1px solid #cbd5e1;border-radius:8px;font:inherit';wrap.appendChild(input);return wrap;}
function status(message,error){var box=root.querySelector('[data-status]');if(box){box.textContent=message||'';box.style.color=error?'#b91c1c':'inherit';}}
function confirmView(booking){root.replaceChildren();var box=el('div');box.style.cssText='text-align:center;padding:40px 16px';box.appendChild(el('h2','Booking confirmed'));box.appendChild(el('p','Your reference is '+booking.reference+'. A confirmation will be sent by the business.'));root.appendChild(box);}
function loadStripe(key){return new Promise(function(resolve,reject){if(window.Stripe)return resolve(window.Stripe(key));var script=el('script',null,{src:'https://js.stripe.com/v3/'});script.onload=function(){resolve(window.Stripe(key));};script.onerror=function(){reject(new Error('Secure payment form failed to load'));};document.head.appendChild(script);});}
async function paymentView(result){root.replaceChildren();var box=el('div');box.style.cssText='display:grid;gap:16px';box.appendChild(el('h2','Secure payment'));box.appendChild(el('p','Amount due: '+result.payment.currency+' '+(result.payment.amount/100).toFixed(2)));var card=el('div');card.style.cssText='padding:14px;border:1px solid #cbd5e1;border-radius:8px';box.appendChild(card);var button=el('button','Pay and confirm',{type:'button'});button.style.cssText='padding:13px 18px;border:0;border-radius:8px;background:#111827;color:white;font-weight:700;cursor:pointer';box.appendChild(button);box.appendChild(el('p','',{ 'data-status':''}));root.appendChild(box);var stripe=await loadStripe(result.payment.publishableKey),elements=stripe.elements(),cardElement=elements.create('card');cardElement.mount(card);button.addEventListener('click',async function(){button.disabled=true;status('Processing secure payment…');var outcome=await stripe.confirmCardPayment(result.payment.clientSecret,{payment_method:{card:cardElement}});if(outcome.error){status(outcome.error.message||'Payment failed',true);button.disabled=false;return;}for(var i=0;i<8;i++){await new Promise(function(r){setTimeout(r,750);});var check=await api('status',{}, {reference:result.booking.reference});if(check.booking.status==='CONFIRMED')return confirmView(check.booking);}status('Payment received. Confirmation is still processing; keep this reference: '+result.booking.reference);});}
function bookingForm(){var selectedService=state.catalog.services.find(function(item){return item.id===state.service;});root.replaceChildren();var form=el('form');form.style.cssText='display:grid;gap:14px';form.appendChild(el('h2','Your details'));form.appendChild(el('p',selectedService.name+' · '+new Date(state.slot.start).toLocaleString()));form.appendChild(field('Full name','text','name'));form.appendChild(field('Email','email','email'));form.appendChild(field('Phone','tel','phone'));if(state.channel==='mobile')form.appendChild(field('Mobile service address','text','mobileAddress'));var analyticsChoice=el('label');var analyticsCheck=el('input',null,{type:'checkbox',name:'analyticsConsent'});analyticsChoice.appendChild(analyticsCheck);analyticsChoice.appendChild(document.createTextNode(' Allow first-party journey analytics to link this booking'));form.appendChild(analyticsChoice);if(c.paymentMode==='customer_choice'){var choice=el('label');var check=el('input',null,{type:'checkbox',name:'payNow'});choice.appendChild(check);choice.appendChild(document.createTextNode(' Pay securely online now'));form.appendChild(choice);}else if(c.paymentMode==='deposit'||c.paymentMode==='full_payment'){form.appendChild(el('p',c.paymentMode==='deposit'?'A deposit is required to confirm this booking.':'Full payment is required to confirm this booking.'));}else form.appendChild(el('p','No online payment is required.'));var submit=el('button','Confirm booking',{type:'submit'});submit.style.cssText='padding:13px 18px;border:0;border-radius:8px;background:#111827;color:white;font-weight:700;cursor:pointer';form.appendChild(submit);form.appendChild(el('p','',{ 'data-status':''}));form.addEventListener('submit',async function(event){event.preventDefault();submit.disabled=true;status('Reserving your appointment…');var data=new FormData(form),consent=data.get('analyticsConsent')?'analytics':'unknown';if(consent==='analytics')sessionStorage.setItem('ks_analytics_consent','analytics');track('booking_started',{serviceId:state.service,bookingType:state.channel==='mobile'?'mobile':'shop',paymentMode:c.paymentMode},consent);try{var result=await api('create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({serviceId:state.service,staffId:state.slot.staffId,startTime:state.slot.start,client:{name:data.get('name'),email:data.get('email'),phone:data.get('phone')},payNow:c.paymentMode==='customer_choice'?Boolean(data.get('payNow')):c.paymentMode==='deposit'||c.paymentMode==='full_payment',idempotencyKey:crypto.randomUUID(),bookingChannel:state.channel,mobileAddress:state.channel==='mobile'?data.get('mobileAddress'):null,sessionId:window.KSAnalytics&&window.KSAnalytics.sessionId,consentBasis:consent==='analytics'?'analytics':null})});state.booking=result.booking;if(result.payment.required)return paymentView(result);confirmView(result.booking);}catch(error){status(error.message,true);submit.disabled=false;}});root.appendChild(form);}
function renderSlots(data){var host=root.querySelector('[data-slots]');host.replaceChildren();if(!data.slots.length){host.appendChild(el('p','No available times for this date.'));return;}data.slots.forEach(function(slot){var button=el('button',new Date(slot.start).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+' · '+slot.staffName,{type:'button'});button.style.cssText='padding:11px;border:1px solid #cbd5e1;border-radius:8px;background:transparent;cursor:pointer';button.addEventListener('click',function(){state.slot=slot;track('slot_selected');bookingForm();});host.appendChild(button);});}
function catalogView(data){state.catalog=data;root.replaceChildren();var form=el('div');form.style.cssText='display:grid;gap:14px';var channel=el('select');channel.style.cssText='padding:12px;border:1px solid #cbd5e1;border-radius:8px;font:inherit';(data.bookingChannels||[]).forEach(function(item){channel.appendChild(el('option',item.label,{value:item.id}));});state.channel=channel.value||null;channel.addEventListener('change',function(){state.channel=channel.value;track('booking_type_selected',{bookingType:state.channel==='mobile'?'mobile':'shop'});});var service=el('select');service.style.cssText=channel.style.cssText;service.appendChild(el('option','Choose a service',{value:''}));data.services.forEach(function(item){service.appendChild(el('option',item.name+' · '+item.duration+' min · '+data.tenant.currency+' '+((item.price-item.discount)/100).toFixed(2),{value:item.id}));});var staff=el('select');staff.style.cssText=service.style.cssText;staff.appendChild(el('option','Any available team member',{value:'any'}));data.staff.forEach(function(item){staff.appendChild(el('option',item.name,{value:item.id}));});var date=el('input',null,{type:'date',min:new Date().toISOString().slice(0,10)});date.style.cssText=service.style.cssText;date.value=new Date().toISOString().slice(0,10);var load=el('button','Show available times',{type:'button'});load.style.cssText='padding:13px 18px;border:0;border-radius:8px;background:#111827;color:white;font-weight:700;cursor:pointer';var slots=el('div',null,{'data-slots':''});slots.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px';service.addEventListener('change',function(){state.service=service.value;if(service.value)track('service_selected',{serviceId:service.value});});load.addEventListener('click',async function(){if(!service.value||!state.channel)return status('Choose a booking type and service first',true);status('Loading live availability…');try{var result=await api('availability',{}, {serviceId:service.value,staffId:staff.value,date:date.value,bookingChannel:state.channel});status('');renderSlots(result);}catch(error){status(error.message,true);}});form.appendChild(channel);form.appendChild(service);form.appendChild(staff);form.appendChild(date);form.appendChild(load);form.appendChild(el('p','',{'data-status':''}));form.appendChild(slots);root.appendChild(form);}
status('Loading live booking options…');api('catalog').then(catalogView).catch(function(error){root.replaceChildren(el('p',error.message));});})();</script>`;
}

function buildBookingPage(shellHtml, { name, paymentMode, analyticsKey, analyticsEndpoint, bookingApiEndpoint, bookingLink }) {
  const safeName = escapeHtml(name);
  const safeMode = escapeHtml(paymentMode || 'pay_later');
  const main = `<main id="main-content"><section class="ks-booking-page" aria-labelledby="booking-title" style="max-width:1100px;margin:0 auto;padding:clamp(48px,8vw,96px) 24px;"><div style="max-width:720px;margin:0 auto;text-align:center;"><p style="text-transform:uppercase;letter-spacing:.14em;font-size:.75rem;opacity:.7;">Online booking</p><h1 id="booking-title" data-editable="true">Schedule with ${safeName}</h1><p data-editable="true">Choose your service, preferred time and payment option.</p></div><ol aria-label="Booking steps" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;list-style:none;padding:32px 0;margin:0;"><li>1. Service</li><li>2. Time</li><li>3. Details</li><li>4. Confirm</li></ol><div data-ks-booking-root data-provider="ks_os" data-payment-mode="${safeMode}" aria-live="polite" style="min-height:360px;padding:32px;border:1px solid currentColor;border-radius:12px;"><h2>Booking is being connected</h2><p>The secure booking calendar will appear here when KS OS is connected for this workspace.</p></div></section></main>`;
  let page = shellHtml || '<!doctype html><html><head><meta charset="utf-8"><title>Book online</title></head><body></body></html>';
  if (/<main\b[^>]*>[\s\S]*?<\/main>/i.test(page)) page = page.replace(/<main\b[^>]*>[\s\S]*?<\/main>/i, main);
  else page = page.replace(/<\/body>/i, `${main}</body>`);
  page = instrumentWebsiteHtml(page, { analyticsKey, analyticsEndpoint, bookingLink });
  return page.replace(/<\/body>/i, `${buildBookingWidgetSnippet({analyticsKey,bookingApiEndpoint,paymentMode})}</body>`);
}

function instrumentWebsiteHtml(html, config) {
  if (!html || html.includes('data-ks-conversion-tracker')) return html;
  return html.replace(/<\/body>/i, `${buildAnalyticsSnippet(config)}</body>`);
}

// Native HTTPS Helper for API calls (Zero-Dependencies)
function makeHttpsRequest(url, method, headers, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'User-Agent': 'Antigravity-Engine-Dashboard'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null,
            rawBody: data
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: null,
            rawBody: data
          });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper: Run shell/git command locally
function runGitCommand(cmd, cwd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Git command failed: ${cmd}`, error);
        resolve({ success: false, error: stderr || error.message });
      } else {
        resolve({ success: true, output: stdout.trim() });
      }
    });
  });
}

// Helper: Recursively copy a directory (Local only)
function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  if (fs.lstatSync(source).isDirectory()) {
    const files = fs.readdirSync(source);
    files.forEach((file) => {
      const curSource = path.join(source, file);
      const curTarget = path.join(target, file);

      if (fs.lstatSync(curSource).isDirectory()) {
        if (file !== '.wrangler' && file !== 'node_modules' && file !== '.git') {
          copyFolderRecursiveSync(curSource, curTarget);
        }
      } else {
        fs.copyFileSync(curSource, curTarget);
      }
    });
  }
}

// Heuristic Detector: Intelligently analyze folder structures of uploaded themes
function detectTemplateMappings(templateSourceDir) {
  const mappings = {
    index: "index.html",
    services: "services.html",
    service_detail: "service-single.html",
    about: "about.html",
    contact: "contact.html",
    portfolio: "portfolio.html",
    portfolio_detail: "portfolio-details.html"
  };

  if (!fs.existsSync(templateSourceDir)) {
    return mappings;
  }

  // Recursive search for all html files relative to templateSourceDir
  function findHtmlFiles(dir, baseDir = '') {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const relPath = baseDir ? `${baseDir}/${file}` : file;
      const stat = fs.statSync(fullPath);

      if (stat && stat.isDirectory()) {
        if (file.toLowerCase() !== 'admin' && !file.startsWith('.') && file !== 'node_modules') {
          results = results.concat(findHtmlFiles(fullPath, relPath));
        }
      } else if (file.endsWith('.html')) {
        results.push(relPath);
      }
    });
    return results;
  }

  const htmlFiles = findHtmlFiles(templateSourceDir);
  if (htmlFiles.length === 0) return mappings;

  // Helper matching arrays
  const indexMatches = htmlFiles.filter(f => /^index(?:-v\d+)?\.html$/i.test(path.basename(f)));
  const aboutMatches = htmlFiles.filter(f => /about|space|mission/i.test(path.basename(f)));
  const contactMatches = htmlFiles.filter(f => /contact|qualification|rfp|booking/i.test(path.basename(f)));

  // Services:
  // Detail page: matches keywords single, detail, details, item, OR custom names like service-d- or website-development
  const svcDetailMatches = htmlFiles.filter(f => {
    const base = path.basename(f);
    return /service/i.test(base) && (/(?:single|detail|details|item|single-service|service-d-)/i.test(base) || base.startsWith('service-d-'));
  });
  // Listing page: matches "service" or "services" but NOT detail keywords
  const svcListingMatches = htmlFiles.filter(f => {
    const base = path.basename(f);
    return /services?\.html$/i.test(base) && !svcDetailMatches.includes(f) && !/details?/i.test(base) && !/single/i.test(base) && !/item/i.test(base);
  });

  // Portfolio:
  // Detail page: matches keywords work-single, portfolio-details, case-study-details, work-details
  const portDetailMatches = htmlFiles.filter(f => {
    const base = path.basename(f);
    return (/(?:portfolio|work|case-study|project)/i.test(base) && /(?:single|detail|details|item)/i.test(base));
  });
  // Listing page: matches portfolio, work, projects, case-study, case-studies but NOT detail keywords
  const portListingMatches = htmlFiles.filter(f => {
    const base = path.basename(f);
    return /(?:portfolio|work|projects?|case-stud)/i.test(base) && !portDetailMatches.includes(f) && !/(?:single|detail|details|item)/i.test(base);
  });

  // Set assignments with sensible fallbacks
  if (indexMatches.length > 0) mappings.index = indexMatches[0];
  if (aboutMatches.length > 0) mappings.about = aboutMatches[0];
  if (contactMatches.length > 0) mappings.contact = contactMatches[0];

  if (svcListingMatches.length > 0) {
    mappings.services = svcListingMatches[0];
  } else {
    // If no explicit services.html, fallback to index
    const servicesFallback = htmlFiles.find(f => /services?\.html$/i.test(path.basename(f)));
    mappings.services = servicesFallback || "services.html";
  }

  if (svcDetailMatches.length > 0) {
    mappings.service_detail = svcDetailMatches[0];
  } else {
    // If no explicit service-single.html layout, look for website-development.html or similar details layout
    const serviceSingleFallback = htmlFiles.find(f => /service-single\.html$/i.test(path.basename(f)) || /service-details?\.html$/i.test(path.basename(f)) || /website-development\.html$/i.test(path.basename(f)));
    mappings.service_detail = serviceSingleFallback || "service-single.html";
  }

  if (portListingMatches.length > 0) {
    mappings.portfolio = portListingMatches[0];
  } else {
    const portfolioFallback = htmlFiles.find(f => /portfolio\.html$/i.test(path.basename(f)) || /work\.html$/i.test(path.basename(f)) || /case-studies\.html$/i.test(path.basename(f)));
    mappings.portfolio = portfolioFallback || "portfolio.html";
  }

  if (portDetailMatches.length > 0) {
    mappings.portfolio_detail = portDetailMatches[0];
  } else {
    const portSingleFallback = htmlFiles.find(f => /work-single\.html$/i.test(path.basename(f)) || /portfolio-details?\.html$/i.test(path.basename(f)) || /case-study-details?\.html$/i.test(path.basename(f)));
    mappings.portfolio_detail = portSingleFallback || "portfolio-details.html";
  }

  return mappings;
}

// Persistent cache reader/writer helper
function getThemeMappings(templateName) {
  const mappingsPath = path.join(__dirname, 'theme_mappings.json');
  let mappingsRegistry = {};
  
  if (fs.existsSync(mappingsPath)) {
    try {
      mappingsRegistry = JSON.parse(fs.readFileSync(mappingsPath, 'utf8'));
    } catch (err) {
      console.error('Failed to parse theme_mappings.json', err);
    }
  }

  if (mappingsRegistry[templateName]) {
    return mappingsRegistry[templateName];
  }

  // Fallback: Run heuristic detection
  const templateDir = path.join(TEMPLATES_DIR, templateName);
  const detected = detectTemplateMappings(templateDir);
  
  // Cache the detected mappings
  mappingsRegistry[templateName] = detected;
  try {
    fs.writeFileSync(mappingsPath, JSON.stringify(mappingsRegistry, null, 2), 'utf8');
    console.log(`[Auto-Integrator] Cached new layouts map for theme: ${templateName}`);
  } catch (err) {
    console.error('Failed to write theme_mappings.json', err);
  }

  return detected;
}

// Helper: Update CSS variables inside a style.css file (Local only)
function updateCssVariablesInFile(cssPath, colors, shapes) {
  if (!fs.existsSync(cssPath)) return;
  let content = fs.readFileSync(cssPath, 'utf8');

  if (colors) {
    if (colors['--color-primary']) {
      content = content.replace(/(--color-primary\s*:\s*)[^;\n]+/g, `$1${colors['--color-primary']}`);
    }
    if (colors['--color-secondary']) {
      content = content.replace(/(--color-secondary\s*:\s*)[^;\n]+/g, `$1${colors['--color-secondary']}`);
    }
    if (colors['--color-accent']) {
      content = content.replace(/(--color-accent\s*:\s*)[^;\n]+/g, `$1${colors['--color-accent']}`);
    }

    for (const [key, val] of Object.entries(colors)) {
      if (key.startsWith('--md-sys-')) {
        const regex = new RegExp(`(${key}\\s*:\\s*)[^;\\n]+`, 'g');
        content = content.replace(regex, `$1${val}`);
      }
    }
  }

  if (shapes) {
    for (const [key, val] of Object.entries(shapes)) {
      const regex = new RegExp(`(${key}\\s*:\\s*)[^;\\n]+`, 'g');
      content = content.replace(regex, `$1${val}`);
    }
  }

  fs.writeFileSync(cssPath, content, 'utf8');
}

// Helper: Save Base64 Image to disk (Local only)
function saveBase64Image(projectDir, base64Data, defaultName) {
  if (!base64Data) return null;
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;

  const ext = matches[1].split('/')[1] || 'png';
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `${defaultName}.${ext}`;
  const imagesDir = path.join(projectDir, 'images');
  
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(imagesDir, filename), buffer);
  return `images/${filename}`;
}

// Helper: Save File to Git or Local disk (Dual-Mode)
async function saveFileToGitOrLocal(projectName, relativeFilePath, content) {
  const repoFilePath = `projects/${projectName}/${relativeFilePath}`.replace(/\\/g, '/');
  
  if (GITHUB_TOKEN) {
    // Write via GitHub Contents API
    const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
    
    // Get file current SHA to overwrite
    let sha = null;
    const getRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'GET', headers);
    if (getRes.status === 200 && getRes.body) {
      sha = getRes.body.sha;
      
      // Auto-backup file
      if (relativeFilePath.endsWith('.html') || relativeFilePath.endsWith('.json')) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `projects/${projectName}/_backups/${path.basename(relativeFilePath)}.${timestamp}.bak`;
        await makeHttpsRequest(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${backupPath}`,
          'PUT',
          headers,
          {
            message: `Visual Editor: backup ${relativeFilePath} in ${projectName}`,
            content: getRes.body.content // Re-commit the same base64
          }
        );
      }
    }

    const base64Content = Buffer.from(content).toString('base64');
    const body = {
      message: `Visual Editor: update ${relativeFilePath} in ${projectName}`,
      content: base64Content
    };
    if (sha) body.sha = sha;

    const putRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'PUT', headers, body);
    if (putRes.status !== 200 && putRes.status !== 201) {
      throw new Error(`GitHub API write failed for ${repoFilePath}. Status: ${putRes.status}`);
    }
  } else {
    // Write locally
    const fullPath = path.join(PROJECTS_DIR, projectName, relativeFilePath);
    const projectDir = path.join(PROJECTS_DIR, projectName);
    
    if (fs.existsSync(fullPath)) {
      const backupDir = path.join(projectDir, '_backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `${path.basename(relativeFilePath)}.${timestamp}.bak`);
      fs.copyFileSync(fullPath, backupPath);
    }

    fs.writeFileSync(fullPath, content, 'utf8');

    // Local git commit
    const relativeFilePathNormalized = path.join('projects', projectName, relativeFilePath).replace(/\\/g, '/');
    runGitCommand(`git add "${relativeFilePathNormalized}"`, WORKSPACE_DIR)
      .then((addRes) => {
        if (addRes.success) {
          runGitCommand(`git commit -m "Visual Editor: update ${relativeFilePath} in ${projectName}"`, WORKSPACE_DIR);
        }
      });
  }
}

// Helper: Deploy Site to Cloudflare Pages & Provision custom domain DNS record
async function deployToCloudflarePagesAndDns(projectName, domainSlug) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;

  if (!apiToken || !accountId) {
    console.log('[Cloudflare] Credentials not configured. Skipping Pages deployment.');
    return { success: false, reason: 'Credentials not configured' };
  }

  const headers = { 'Authorization': `Bearer ${apiToken}` };
  const pagesProjectName = `ks-${domainSlug}`;
  const subdomain = `${domainSlug}.kasimshah.com`;

  console.log(`[Cloudflare] Spawning Pages project '${pagesProjectName}'...`);

  // Step 1: Create Pages Project connected to GitHub repo subdirectory
  const createPayload = {
    name: pagesProjectName,
    production_branch: 'main',
    source: {
      type: 'github',
      config: {
        owner: 'kazshh786',
        repo_name: 'agent',
        production_branch: 'main',
        root_dir: `projects/${projectName}`,
        deployments_enabled: true
      }
    }
  };

  const projectRes = await makeHttpsRequest(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`,
    'POST',
    headers,
    createPayload
  );

  console.log(`[Cloudflare] Pages project status: ${projectRes.status}`);

  // Step 2: Add CNAME Record to DNS Zone (if Zone ID is set)
  if (zoneId) {
    console.log(`[Cloudflare] Creating CNAME record for ${subdomain} -> ${pagesProjectName}.pages.dev`);
    const dnsPayload = {
      type: 'CNAME',
      name: subdomain,
      content: `${pagesProjectName}.pages.dev`,
      ttl: 1,
      proxied: true
    };

    const dnsRes = await makeHttpsRequest(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      'POST',
      headers,
      dnsPayload
    );
    console.log(`[Cloudflare] DNS CNAME status: ${dnsRes.status}`);
  }

  // Step 3: Add Custom Domain mapping on the Pages Project
  console.log(`[Cloudflare] Binding custom domain ${subdomain} on Pages project`);
  const domainRes = await makeHttpsRequest(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${pagesProjectName}/domains`,
    'POST',
    headers,
    { name: subdomain }
  );
  console.log(`[Cloudflare] Custom domain mapping status: ${domainRes.status}`);

  return { success: true };
}

// ------------------------------------------------------------
// API ROUTING
// ------------------------------------------------------------

// Serve client site preview dynamically in cloud from GitHub (Overriding static serve on Vercel)
app.get('/projects/:name/:file*', async (req, res, next) => {
  if (!GITHUB_TOKEN) {
    return next(); // Fallback to local static serve
  }

  const { name, file } = req.params;
  const pathParts = req.params[0] ? file + req.params[0] : file;
  const repoFilePath = `projects/${name}/${pathParts}`.replace(/\\/g, '/');
  
  const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };

  try {
    const result = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'GET', headers);
    if (result.status === 200 && result.body) {
      const ext = path.extname(repoFilePath).toLowerCase();
      let mimeType = 'text/plain';
      if (ext === '.html') mimeType = 'text/html';
      else if (ext === '.css') mimeType = 'text/css';
      else if (ext === '.js') mimeType = 'application/javascript';
      else if (ext === '.json') mimeType = 'application/json';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.svg') mimeType = 'image/svg+xml';

      res.setHeader('Content-Type', mimeType);
      const buffer = Buffer.from(result.body.content, 'base64');
      res.send(buffer);
    } else {
      res.status(404).send('Preview file not found in GitHub repository');
    }
  } catch (err) {
    res.status(500).send(`GitHub connection error: ${err.message}`);
  }
});

// Serve static admin files (local only)
app.use('/admin', express.static(path.join(PROJECTS_DIR, 'kasimshah.com', 'admin')));

// Serve project files for visual preview & asset loading (local fallback)
app.use('/projects', express.static(PROJECTS_DIR));

// API: Get List of Available Website Templates
app.get('/api/templates', async (req, res) => {
  if (GITHUB_TOKEN) {
    try {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const apiRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/templates`, 'GET', headers);
      if (apiRes.status === 200 && Array.isArray(apiRes.body)) {
        const folders = apiRes.body.filter(i => i.type === 'dir').map(i => i.name);
        return res.json(folders);
      }
      return res.json(['editorial-luxe']);
    } catch (e) {
      return res.json(['editorial-luxe']);
    }
  }

  try {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      return res.json(['editorial-luxe']);
    }
    const folders = fs.readdirSync(TEMPLATES_DIR).filter((file) => {
      return fs.lstatSync(path.join(TEMPLATES_DIR, file)).isDirectory();
    });
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read templates directory', details: err.message });
  }
});

// API: Get List of Active Projects
app.get('/api/projects', async (req, res) => {
  if (GITHUB_TOKEN) {
    try {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const listRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/projects`, 'GET', headers);
      if (listRes.status !== 200) {
        return res.json([]);
      }

      const projectsList = [];
      const folders = listRes.body.filter(item => item.type === 'dir' && item.name !== 'client-template' && item.name !== 'intake-form');

      await Promise.all(folders.map(async (folder) => {
        const name = folder.name;
        const projectData = {
          name,
          hasSitemap: false,
          hasTheme: false,
          hasClientData: false,
          pages: [],
          theme: {},
          clientData: {}
        };

        try {
          const [sitemapRes, themeRes, dataRes] = await Promise.all([
            makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/projects/${name}/sitemap.json`, 'GET', headers),
            makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/projects/${name}/theme.json`, 'GET', headers),
            makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/projects/${name}/client_data.json`, 'GET', headers)
          ]);

          if (sitemapRes.status === 200 && sitemapRes.body && sitemapRes.body.content) {
            projectData.hasSitemap = true;
            const raw = Buffer.from(sitemapRes.body.content, 'base64').toString('utf8');
            const parsed = JSON.parse(raw);
            projectData.pages = parsed.pages || (parsed.categories ? Object.values(parsed.categories).flat() : []);
          }

          if (themeRes.status === 200 && themeRes.body && themeRes.body.content) {
            projectData.hasTheme = true;
            const raw = Buffer.from(themeRes.body.content, 'base64').toString('utf8');
            projectData.theme = JSON.parse(raw).theme || {};
          }

          if (dataRes.status === 200 && dataRes.body && dataRes.body.content) {
            projectData.hasClientData = true;
            const raw = Buffer.from(dataRes.body.content, 'base64').toString('utf8');
            projectData.clientData = JSON.parse(raw);
          }

          projectsList.push(projectData);
        } catch (e) {
          console.error(`Error loading configs from github for ${name}`, e);
        }
      }));

      return res.json(projectsList);
    } catch (err) {
      return res.status(500).json({ error: 'GitHub projects fetch failed', details: err.message });
    }
  }

  // Local filesystem scan
  try {
    if (!fs.existsSync(PROJECTS_DIR)) {
      return res.json([]);
    }

    const folders = fs.readdirSync(PROJECTS_DIR);
    const projectsList = [];

    folders.forEach((folder) => {
      const folderPath = path.join(PROJECTS_DIR, folder);
      if (!fs.lstatSync(folderPath).isDirectory()) return;
      if (folder === 'client-template' || folder === 'intake-form') return;

      const sitemapPath = path.join(folderPath, 'sitemap.json');
      const themePath = path.join(folderPath, 'theme.json');
      const clientDataPath = path.join(folderPath, 'client_data.json');

      const projectData = {
        name: folder,
        hasSitemap: fs.existsSync(sitemapPath),
        hasTheme: fs.existsSync(themePath),
        hasClientData: fs.existsSync(clientDataPath),
        pages: [],
        theme: {},
        clientData: {}
      };

      if (projectData.hasSitemap) {
        try {
          const sitemapRaw = fs.readFileSync(sitemapPath, 'utf8');
          const parsed = JSON.parse(sitemapRaw);
          projectData.pages = parsed.pages || (parsed.categories ? Object.values(parsed.categories).flat() : []);
        } catch (e) {
          console.error(`Error reading sitemap for ${folder}`, e);
        }
      }

      if (projectData.hasTheme) {
        try {
          const themeRaw = fs.readFileSync(themePath, 'utf8');
          projectData.theme = JSON.parse(themeRaw).theme || {};
        } catch (e) {
          console.error(`Error reading theme for ${folder}`, e);
        }
      }

      if (projectData.hasClientData) {
        try {
          const dataRaw = fs.readFileSync(clientDataPath, 'utf8');
          projectData.clientData = JSON.parse(dataRaw);
        } catch (e) {
          console.error(`Error reading client data for ${folder}`, e);
        }
      }

      projectsList.push(projectData);
    });

    res.json(projectsList);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read projects catalog', details: err.message });
  }
});

// API: Create a New Project (Website Instance from Template)
app.post('/api/projects', async (req, res) => {
  const expectedToken = Buffer.from(process.env.WEBSITE_ENGINE_API_TOKEN || '');
  const suppliedToken = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  if (!expectedToken.length) return res.status(503).json({ error: 'Website Engine authentication is not configured.' });
  if (suppliedToken.length !== expectedToken.length || !crypto.timingSafeEqual(suppliedToken, expectedToken)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  const { 
    name, 
    templateName, 
    industry, 
    bottleneck, 
    salesProcess, 
    brandColor, 
    vibe, 
    tone, 
    logoText, 
    logoImg, 
    heroImg, 
    services,
    bookingLink,
    bookingProvider,
    paymentMode,
    analyticsKey,
    analyticsEndpoint,
    bookingApiEndpoint,
    pageSize
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }
  const paymentModes = ['no_payment', 'pay_later', 'deposit', 'full_payment', 'customer_choice'];
  if (bookingLink !== '/book' || bookingProvider !== 'ks_os') {
    return res.status(400).json({ error: 'Every website requires the same-domain KS OS /book route.' });
  }
  if (!paymentModes.includes(paymentMode) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(analyticsKey || '')) {
    return res.status(400).json({ error: 'Booking payment mode or analytics key is invalid.' });
  }
  try {
    if (new URL(analyticsEndpoint).protocol !== 'https:' || new URL(bookingApiEndpoint).protocol !== 'https:') throw new Error('HTTPS required');
  } catch {
    return res.status(400).json({ error: 'A valid HTTPS analytics endpoint is required.' });
  }

  // Slugified domain name e.g. "boutique-dental"
  const domainSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

  if (GITHUB_TOKEN) {
    // CLOUD MODE (GitHub Contents API generation)
    try {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const selectedTemplate = templateName || 'editorial-luxe';
      
      // 1. Fetch all template files from GitHub recursively
      const tempRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/templates/${selectedTemplate}`, 'GET', headers);
      if (tempRes.status !== 200) {
        return res.status(404).json({ error: `Template '${selectedTemplate}' not found on GitHub` });
      }

      const filesToCopy = [];
      async function findFiles(dirPath) {
        const res = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${dirPath}`, 'GET', headers);
        if (res.status === 200 && Array.isArray(res.body)) {
          for (const item of res.body) {
            if (item.type === 'dir') {
              await findFiles(item.path);
            } else {
              filesToCopy.push(item);
            }
          }
        }
      }
      
      await findFiles(`templates/${selectedTemplate}`);

      // 2. Clone/Commit files to projects/projectName on GitHub
      const pagesList = [];
      let serviceSingleHtml = '';
      let bookingShellHtml = '';

      for (const file of filesToCopy) {
        const fileContentRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file.path}`, 'GET', headers);
        if (fileContentRes.status === 200 && fileContentRes.body) {
          let content = Buffer.from(fileContentRes.body.content, 'base64').toString('utf8');
          const relativeFilePath = file.path.replace(`templates/${selectedTemplate}/`, '');

          if (relativeFilePath === 'service-single.html') {
            serviceSingleHtml = instrumentWebsiteHtml(content, { analyticsKey, analyticsEndpoint, bookingLink });
            continue;
          }

          const targetFilePath = `projects/${name}/${relativeFilePath}`.replace(/\\/g, '/');

          // Customize logos and booking links
          if (relativeFilePath.endsWith('.html')) {
            if (logoText) {
              content = content.replace(/KS <span(?:\s+[^>]*?)?>STUDIO<\/span>/g, logoText);
              content = content.replace(/KS <span(?:\s+[^>]*?)?>STUDIO<\/span>/gi, logoText);
              content = content.replace(/KS STUDIO/g, logoText.replace(/<\/?span>/g, ''));
              content = content.replace(/\[Logo Text\]/g, logoText);
            }

            if (bookingLink) {
              content = content.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
              content = content.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
              content = content.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
            }
            content = instrumentWebsiteHtml(content, { analyticsKey, analyticsEndpoint, bookingLink });
            if (relativeFilePath === 'index.html' || (!bookingShellHtml && /qualification|contact/i.test(relativeFilePath))) {
              bookingShellHtml = content;
            }
          }

          if (relativeFilePath === 'sitemap.json') {
            pagesList.push(...JSON.parse(content).pages || []);
          }

          const base64Content = Buffer.from(content).toString('base64');
          await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${targetFilePath}`, 'PUT', headers, {
            message: `Visual Editor: copy ${relativeFilePath} from template`,
            content: base64Content
          });
        }
      }

      if (bookingLink === '/book') {
        const bookingPage = buildBookingPage(bookingShellHtml, { name, paymentMode, analyticsKey, analyticsEndpoint, bookingApiEndpoint, bookingLink });
        await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/projects/${name}/book/index.html`, 'PUT', headers, {
          message: 'Website Engine: add branded KS OS booking route',
          content: Buffer.from(bookingPage).toString('base64')
        });
        pagesList.push({ file: 'book/index.html', name: 'Book Online', type: 'booking' });
      }

      // 3. Process dynamic services subpages & localized SEO pages
      if (serviceSingleHtml && Array.isArray(services) && services.length > 0) {
        // Standard service pages
        for (const serviceName of services) {
          const slug = 'service-' + serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
          const filename = `${slug}.html`;
          const targetPath = `projects/${name}/${filename}`;

          let pageHtml = serviceSingleHtml
            .replace(/\[Service Name\]/g, serviceName)
            .replace(/\[Logo Text\]/g, logoText || name);

          if (bookingLink) {
            pageHtml = pageHtml.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
            pageHtml = pageHtml.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
            pageHtml = pageHtml.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
          }

          await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${targetPath}`, 'PUT', headers, {
            message: `Visual Editor: generate service subpage '${serviceName}'`,
            content: Buffer.from(pageHtml).toString('base64')
          });

          pagesList.push({ file: filename, name: serviceName, type: 'service_single' });
        }

        // Localized SEO pages if size budget is 20 or 30
        const targetSize = parseInt(pageSize, 10) || 10;
        if (targetSize > 10) {
          const additionalPagesNeeded = targetSize - 10;
          const cities = [
            "London", "Manchester", "Birmingham", "Leeds", "Glasgow",
            "Bristol", "Liverpool", "Newcastle", "Sheffield", "Edinburgh",
            "Belfast", "Leicester", "Coventry", "Nottingham", "Cardiff"
          ];
          
          let count = 0;
          let cityIndex = 0;
          
          while (count < additionalPagesNeeded && cityIndex < cities.length) {
            for (let i = 0; i < services.length; i++) {
              if (count >= additionalPagesNeeded || cityIndex >= cities.length) break;
              
              const serviceName = services[i];
              const city = cities[cityIndex];
              const slug = 'service-' + serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + city.toLowerCase();
              const filename = `${slug}.html`;
              const targetPath = `projects/${name}/${filename}`;

              let pageHtml = serviceSingleHtml
                .replace(/\[Service Name\]/g, `${serviceName} in ${city}`)
                .replace(/\[Logo Text\]/g, logoText || name);

              if (bookingLink) {
                pageHtml = pageHtml.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
                pageHtml = pageHtml.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
                pageHtml = pageHtml.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
              }

              await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${targetPath}`, 'PUT', headers, {
                message: `Visual Editor: generate localized service subpage '${serviceName} (${city})'`,
                content: Buffer.from(pageHtml).toString('base64')
              });

              pagesList.push({ file: filename, name: `${serviceName} (${city})`, type: 'service_local_seo' });
              count++;
            }
            cityIndex++;
          }
        }
      }

      // Update sitemap.json on GitHub
      const sitemapPath = `projects/${name}/sitemap.json`;
      const sitemapBody = { pages: pagesList };
      let sitemapSha = null;
      const getSitemap = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${sitemapPath}`, 'GET', headers);
      if (getSitemap.status === 200 && getSitemap.body) sitemapSha = getSitemap.body.sha;

      await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${sitemapPath}`, 'PUT', headers, {
        message: 'Visual Editor: update sitemap with dynamic services',
        content: Buffer.from(JSON.stringify(sitemapBody, null, 2)).toString('base64'),
        sha: sitemapSha
      });

      // Update theme config on GitHub
      const themePath = `projects/${name}/theme.json`;
      let themeSha = null;
      const getTheme = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${themePath}`, 'GET', headers);
      if (getTheme.status === 200 && getTheme.body) {
        themeSha = getTheme.body.sha;
        const themeConfig = JSON.parse(Buffer.from(getTheme.body.content, 'base64').toString('utf8'));
        if (themeConfig.theme) {
          themeConfig.theme.vibe = vibe || 'Luxury/Editorial';
          if (themeConfig.theme.colors) {
            themeConfig.theme.colors['--md-sys-color-primary'] = brandColor || '#D4AF37';
          }
          await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${themePath}`, 'PUT', headers, {
            message: 'Visual Editor: update theme variables',
            content: Buffer.from(JSON.stringify(themeConfig, null, 2)).toString('base64'),
            sha: themeSha
          });
        }
      }

      // Create client_data.json on GitHub
      const clientData = {
        client_name: name,
        brand_color: brandColor || '#D4AF37',
        industry: industry || 'Professional Services',
        revenue_bottleneck: bottleneck || 'conversion',
        sales_process: salesProcess || 'sales_call',
        tone_of_voice: tone || 'Sophisticated/Editorial',
        services: services || [],
        booking_link: bookingLink || '',
        booking_provider: bookingProvider || 'ks_os',
        payment_mode: paymentMode || 'pay_later',
        analytics_enabled: Boolean(analyticsKey && analyticsEndpoint),
        page_size: pageSize || '10'
      };
      await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/projects/${name}/client_data.json`, 'PUT', headers, {
        message: 'Visual Editor: write client data configurations',
        content: Buffer.from(JSON.stringify(clientData, null, 2)).toString('base64')
      });

      // Trigger Cloudflare Pages deployment and DNS provisioning asynchronously
      deployToCloudflarePagesAndDns(name, domainSlug);

      return res.json({ success: true, message: `Project '${name}' successfully generated in GitHub and queued for Cloudflare Pages auto-deploys.` });
    } catch (err) {
      return res.status(500).json({ error: 'GitHub site compiler failed', details: err.message });
    }
  }

  // LOCAL DEVELOPMENT MODE (Filesystem site generation)
  const targetFolder = path.join(PROJECTS_DIR, name);
  if (fs.existsSync(targetFolder)) {
    return res.status(400).json({ error: `Project '${name}' already exists` });
  }

  try {
    const selectedTemplate = templateName || 'editorial-luxe';
    const templateSource = path.join(TEMPLATES_DIR, selectedTemplate);
    
    if (!fs.existsSync(templateSource)) {
      return res.status(404).json({ error: `Template '${selectedTemplate}' not found on local disk` });
    }
    
    copyFolderRecursiveSync(templateSource, targetFolder);

    const logoImgPath = saveBase64Image(targetFolder, logoImg, 'logo_uploaded');
    const heroImgPath = saveBase64Image(targetFolder, heroImg, 'hero_uploaded');

    const clientData = {
      client_name: name,
      brand_color: brandColor || '#D4AF37',
      industry: industry || 'Professional Services',
      revenue_bottleneck: bottleneck || 'conversion',
      sales_process: salesProcess || 'sales_call',
      tone_of_voice: tone || 'Sophisticated/Editorial',
      services: services || [],
      booking_link: bookingLink || '',
      page_size: pageSize || '10',
      conversion_goals: [
        `Frictionless booking flow targeting the ${bottleneck} bottleneck.`,
        `High-conversion ${vibe} framework optimized for ${industry} services.`,
        `Value-stack architecture written in a ${tone} copywriting tone.`
      ]
    };
    fs.writeFileSync(path.join(targetFolder, 'client_data.json'), JSON.stringify(clientData, null, 2), 'utf8');

    const sitemapPath = path.join(targetFolder, 'sitemap.json');
    let pagesList = [];
    if (fs.existsSync(sitemapPath)) {
      try {
        const raw = fs.readFileSync(sitemapPath, 'utf8');
        pagesList = JSON.parse(raw).pages || [];
} catch (e) {
        console.error(e);
      }
    }

    // Read theme page layout mappings
    const mapping = getThemeMappings(selectedTemplate);
    console.log(`[Auto-Integrator] Loaded mappings for template '${selectedTemplate}':`, mapping);

    // Track generated subpages to inject links
    const serviceListHtmlFiles = [];
    const portfolioListHtmlFiles = [];

    // Helper to inject directory block
    function injectLinksToListingFile(filePath, linksList, title) {
      if (!fs.existsSync(filePath)) return;
      let html = fs.readFileSync(filePath, 'utf8');

      const linksHtml = linksList.map(lnk => {
        const relFile = path.basename(lnk.file);
        return `<a href="${relFile}" class="tf-btn-2" data-editable="true" style="padding: 8px 16px; font-size: 0.85rem; border-radius: var(--radius-sm, 8px); border: 1px solid var(--color-dark-border, #292C2E); color: #FFF; text-decoration: none; display: inline-block; transition: all 0.2s; margin: 4px;">${lnk.name}</a>`;
      }).join('\n          ');

      const injectedBlock = `
      <!-- Injected by KS Auto-Integrator: Dynamic Directory -->
      <div class="dynamic-services-directory" style="margin-top: 48px; padding: 32px; background-color: var(--color-dark-surface, #121212); border: 1px solid var(--color-dark-border, #292C2E); border-radius: var(--radius-lg, 16px); text-align: center; clear: both;">
        <h3 style="margin-bottom: 24px; color: var(--color-accent, #D4AF37); font-family: var(--font-display, inherit);" data-editable="true">${title}</h3>
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          ${linksHtml}
        </div>
      </div>
      `;

      if (html.includes('</main>')) {
        html = html.replace('</main>', `${injectedBlock}\n</main>`);
      } else if (html.includes('<footer')) {
        html = html.replace('<footer', `${injectedBlock}\n<footer`);
      } else if (html.includes('</body>')) {
        html = html.replace('</body>', `${injectedBlock}\n</body>`);
      }

      fs.writeFileSync(filePath, html, 'utf8');
      console.log(`[Auto-Integrator] Injected dynamic links into listing: ${path.basename(filePath)}`);
    }

    // 1. Generate standard and SEO service detail subpages
    const serviceTemplatePath = path.join(targetFolder, mapping.service_detail);
    if (fs.existsSync(serviceTemplatePath) && Array.isArray(services) && services.length > 0) {
      const templateHtml = fs.readFileSync(serviceTemplatePath, 'utf8');

      // Generate standard service pages
      services.forEach((serviceName) => {
        const slug = 'service-' + serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        const filename = `${slug}.html`;

        const relativeDir = path.dirname(mapping.service_detail);
        const fileDir = path.join(targetFolder, relativeDir);
        const serviceFileSavePath = path.join(fileDir, filename);
        const relFilename = relativeDir && relativeDir !== '.' ? `${relativeDir}/${filename}` : filename;

        let pageHtml = templateHtml
          .replace(/\[Service Name\]/g, serviceName)
          .replace(/KS <span(?:\s+[^>]*?)?>STUDIO<\/span>/g, logoText || name)
          .replace(/KS <span(?:\s+[^>]*?)?>STUDIO<\/span>/gi, logoText || name)
          .replace(/KS STUDIO/g, (logoText || name).replace(/<\/?span>/g, ''))
          .replace(/\[Logo Text\]/g, logoText || name);

        if (bookingLink) {
          pageHtml = pageHtml.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
          pageHtml = pageHtml.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
          pageHtml = pageHtml.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
        }
        
        fs.writeFileSync(serviceFileSavePath, pageHtml, 'utf8');
        pagesList.push({ file: relFilename, name: serviceName, type: 'service_single' });
        serviceListHtmlFiles.push({ file: relFilename, name: serviceName });
      });

      // Generate localized SEO pages if size budget is 20 or 30
      const targetSize = parseInt(pageSize, 10) || 10;
      if (targetSize > 10) {
        const additionalPagesNeeded = targetSize - 10;
        const cities = [
          "London", "Manchester", "Birmingham", "Leeds", "Glasgow",
          "Bristol", "Liverpool", "Newcastle", "Sheffield", "Edinburgh",
          "Belfast", "Leicester", "Coventry", "Nottingham", "Cardiff"
        ];
        
        let count = 0;
        let cityIndex = 0;
        
        while (count < additionalPagesNeeded && cityIndex < cities.length) {
          for (let i = 0; i < services.length; i++) {
            if (count >= additionalPagesNeeded || cityIndex >= cities.length) break;
            
            const serviceName = services[i];
            const city = cities[cityIndex];
            const slug = 'service-' + serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + city.toLowerCase();
            const filename = `${slug}.html`;

            const relativeDir = path.dirname(mapping.service_detail);
            const fileDir = path.join(targetFolder, relativeDir);
            const serviceFileSavePath = path.join(fileDir, filename);
            const relFilename = relativeDir && relativeDir !== '.' ? `${relativeDir}/${filename}` : filename;

            let pageHtml = templateHtml
              .replace(/\[Service Name\]/g, `${serviceName} in ${city}`)
              .replace(/KS <span(?:\s+[^>]*?)?>STUDIO<\/span>/g, logoText || name)
              .replace(/KS <span(?:\s+[^>]*?)?>STUDIO<\/span>/gi, logoText || name)
              .replace(/KS STUDIO/g, (logoText || name).replace(/<\/?span>/g, ''))
              .replace(/\[Logo Text\]/g, logoText || name);

            if (bookingLink) {
              pageHtml = pageHtml.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
              pageHtml = pageHtml.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
              pageHtml = pageHtml.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
            }
            
            fs.writeFileSync(serviceFileSavePath, pageHtml, 'utf8');
            pagesList.push({ file: relFilename, name: `${serviceName} (${city})`, type: 'service_local_seo' });
            serviceListHtmlFiles.push({ file: relFilename, name: `${serviceName} (${city})` });
            count++;
          }
          cityIndex++;
        }
      }

      // Delete layout template file from project so it is not exposed
      fs.rmSync(serviceTemplatePath, { force: true });
      pagesList = pagesList.filter(p => p.file !== mapping.service_detail);
    }

    // 2. Generate portfolio/case-study detail subpages if portfolio_detail is mapped
    let portfolioTemplateSrc = path.join(TEMPLATES_DIR, selectedTemplate, mapping.portfolio_detail);
    const useServiceDetailAsFallback = (mapping.portfolio_detail === mapping.portfolio);

    if (useServiceDetailAsFallback) {
      portfolioTemplateSrc = path.join(TEMPLATES_DIR, selectedTemplate, mapping.service_detail);
    }

    if (fs.existsSync(portfolioTemplateSrc) && Array.isArray(services) && services.length > 0) {
      const templateHtml = fs.readFileSync(portfolioTemplateSrc, 'utf8');

      services.forEach((serviceName) => {
        const slug = 'project-' + serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        const filename = `${slug}.html`;

        const relativeDir = useServiceDetailAsFallback ? path.dirname(mapping.portfolio) : path.dirname(mapping.portfolio_detail);
        const fileDir = path.join(targetFolder, relativeDir);
        const portfolioFileSavePath = path.join(fileDir, filename);
        const relFilename = relativeDir && relativeDir !== '.' ? `${relativeDir}/${filename}` : filename;

        let pageHtml = templateHtml
          .replace(/\[Service Name\]/g, useServiceDetailAsFallback ? `${serviceName} Case Study` : serviceName)
          .replace(/\[Project Name\]/g, `${serviceName} Case Study`)
          .replace(/KS <span(?:\s+[^>]*?)?>STUDIO<\/span>/g, logoText || name)
          .replace(/KS <span(?:\s+[^>]*?)?>STUDIO<\/span>/gi, logoText || name)
          .replace(/KS STUDIO/g, (logoText || name).replace(/<\/?span>/g, ''))
          .replace(/\[Logo Text\]/g, logoText || name);

        if (bookingLink) {
          pageHtml = pageHtml.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
          pageHtml = pageHtml.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
          pageHtml = pageHtml.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
        }

        fs.writeFileSync(portfolioFileSavePath, pageHtml, 'utf8');
        pagesList.push({ file: relFilename, name: `${serviceName} Project`, type: 'portfolio_single' });
        portfolioListHtmlFiles.push({ file: relFilename, name: `${serviceName} Case Study` });
      });

      // Clean up layout template file if it is a separate file
      if (!useServiceDetailAsFallback) {
        const portfolioTemplatePath = path.join(targetFolder, mapping.portfolio_detail);
        fs.rmSync(portfolioTemplatePath, { force: true });
        pagesList = pagesList.filter(p => p.file !== mapping.portfolio_detail);
      }
    }

    // 3. Inject dynamic directory links into services and portfolio list pages
    const servicesPagePath = path.join(targetFolder, mapping.services);
    if (serviceListHtmlFiles.length > 0) {
      injectLinksToListingFile(servicesPagePath, serviceListHtmlFiles, 'Specialized Client Offerings');
    }

    const portfolioPagePath = path.join(targetFolder, mapping.portfolio);
    if (portfolioListHtmlFiles.length > 0) {
      injectLinksToListingFile(portfolioPagePath, portfolioListHtmlFiles, 'Specialized Case Studies');
    }

    fs.writeFileSync(sitemapPath, JSON.stringify({ pages: pagesList }, null, 2), 'utf8');

    // Scan all files in target folder recursively to apply global logo/link replacements
    function processHtmlFilesRecursively(dir) {
      if (!fs.existsSync(dir)) return;
      const list = fs.readdirSync(dir);
      list.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat && stat.isDirectory()) {
          if (file.toLowerCase() !== 'admin' && !file.startsWith('.')) {
            processHtmlFilesRecursively(filePath);
          }
        } else if (file.endsWith('.html')) {
          let htmlContent = fs.readFileSync(filePath, 'utf8');
          
          if (logoText) {
            htmlContent = htmlContent.replace(/KS <span(?:\s+[^>]*?)?>STUDIO<\/span>/g, logoText);
            htmlContent = htmlContent.replace(/KS <span(?:\s+[^>]*?)?>STUDIO<\/span>/gi, logoText);
            htmlContent = htmlContent.replace(/KS STUDIO/g, logoText.replace(/<\/?span>/g, ''));
            htmlContent = htmlContent.replace(/\[Logo Text\]/g, logoText);
          }

          if (bookingLink) {
            htmlContent = htmlContent.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
            htmlContent = htmlContent.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
            htmlContent = htmlContent.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
          }

          htmlContent = instrumentWebsiteHtml(htmlContent, { analyticsKey, analyticsEndpoint, bookingLink });

          if (logoImgPath) {
            const logoImgTag = `<img src="${logoImgPath}" alt="${name} Logo" style="max-height: 40px; width: auto; vertical-align: middle;">`;
            htmlContent = htmlContent.replace(/(id="header-logo"[^>]*>)[^<]*(<\/a>)/g, `$1${logoImgTag}$2`);
          }

          // Replace hero image (for index.html at top-level or nested)
          if (file === 'index.html' && heroImgPath) {
            htmlContent = htmlContent.replace(/(class="hero-img"[^>]*src=")[^"]*(")/g, `$1${heroImgPath}$2`);
            htmlContent = htmlContent.replace(/(class="split-side-panel"[^>]*background:\s*url\()[^)]*(\))/g, `$1../../${heroImgPath}$2`);
          }

          fs.writeFileSync(filePath, htmlContent, 'utf8');
        }
      });
    }

    processHtmlFilesRecursively(targetFolder);

    if (bookingLink === '/book') {
      const indexPath = path.join(targetFolder, 'index.html');
      const shell = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : '';
      const bookingDir = path.join(targetFolder, 'book');
      fs.mkdirSync(bookingDir, { recursive: true });
      fs.writeFileSync(path.join(bookingDir, 'index.html'), buildBookingPage(shell, { name, paymentMode, analyticsKey, analyticsEndpoint, bookingApiEndpoint, bookingLink }), 'utf8');
    }

    const themePath = path.join(targetFolder, 'theme.json');
    if (fs.existsSync(themePath)) {
      const themeRaw = fs.readFileSync(themePath, 'utf8');
      const themeConfig = JSON.parse(themeRaw);
      
      if (themeConfig.theme) {
        themeConfig.theme.vibe = vibe || 'Luxury/Editorial';
        if (themeConfig.theme.colors) {
          themeConfig.theme.colors['--md-sys-color-primary'] = brandColor || '#D4AF37';
        }
        fs.writeFileSync(themePath, JSON.stringify(themeConfig, null, 2), 'utf8');
      }
    }

    const cssPath = path.join(targetFolder, 'css', 'style.css');
    if (cssPath) {
      const radius = vibe === 'Luxury/Editorial' ? '0px' : vibe === 'Tech Sleek' ? '8px' : '16px';
      updateCssVariablesInFile(cssPath, {
        '--color-accent': brandColor || '#D4AF37',
        '--md-sys-color-primary': brandColor || '#D4AF37'
      }, {
        '--md-sys-shape-corner-extra-small': radius,
        '--md-sys-shape-corner-small': radius,
        '--md-sys-shape-corner-medium': radius,
        '--md-sys-shape-corner-large': radius,
        '--md-sys-shape-corner-extra-large': radius,
        '--radius-sm': radius === '0px' ? '0px' : '4px',
        '--radius-md': radius,
        '--radius-lg': radius === '0px' ? '0px' : '16px'
      });
    }

    // Git commit creation
    const relativeProjectPath = path.join('projects', name).replace(/\\/g, '/');
    runGitCommand(`git add "${relativeProjectPath}"`, WORKSPACE_DIR)
      .then(() => {
        runGitCommand(`git commit -m "Visual Editor: spin up new website instance '${name}'"`, WORKSPACE_DIR);
      });

    // Trigger Cloudflare Pages deployment and DNS provisioning asynchronously (local credentials helper)
    deployToCloudflarePagesAndDns(name, domainSlug);

    res.json({ success: true, message: `Project '${name}' created successfully on local disk and queued for Cloudflare Pages.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create new website project', details: err.message });
  }
});

// API: Delete a Website Project (Start Again)
app.delete('/api/project/:name', async (req, res) => {
  const projectName = req.params.name;

  if (!projectName) {
    return res.status(400).json({ success: false, error: 'Project name parameter is required.' });
  }

  // Protection Guard: Never delete the core agency website
  if (projectName.toLowerCase() === 'kasimshah.com') {
    return res.status(403).json({ success: false, error: 'Accidental deletion protection: The primary agency website cannot be deleted.' });
  }

  const projectPath = path.join(PROJECTS_DIR, projectName);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ success: false, error: `Project '${projectName}' does not exist on disk.` });
  }

  try {
    // 1. Delete local folder recursively
    fs.rmSync(projectPath, { recursive: true, force: true });
    console.log(`[Delete] Deleted folder on disk: ${projectPath}`);

    // 2. Commit deletion changes to Git to update Vercel/Cloudflare Pages pipeline
    if (fs.existsSync(path.join(WORKSPACE_DIR, '.git'))) {
      try {
        await runGitCommand(`git add -A`, WORKSPACE_DIR);
        await runGitCommand(`git commit -m "Visual Editor: delete website instance '${projectName}'"`, WORKSPACE_DIR);
        console.log(`[Delete] Git commit successfully registered for '${projectName}' deletion.`);
      } catch (gitErr) {
        console.error('[Delete] Git commit during delete failed (non-blocking):', gitErr);
      }
    }

    res.json({ success: true, message: `Website '${projectName}' deleted successfully.` });
  } catch (err) {
    console.error(`[Delete] Failed to delete website project '${projectName}':`, err);
    res.status(500).json({ success: false, error: `Failed to delete website folder: ${err.message}` });
  }
});

// API: Get Specific Page (HTML) or Asset Config
app.get('/api/project/:name/file', async (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path;

  if (!filePath) {
    return res.status(400).json({ error: 'File path query parameter is required' });
  }

  const repoFilePath = `projects/${name}/${filePath}`.replace(/\\/g, '/');

  if (GITHUB_TOKEN) {
    // Read from GitHub Contents API
    const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
    try {
      const apiRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'GET', headers);
      if (apiRes.status === 200 && apiRes.body) {
        const raw = Buffer.from(apiRes.body.content, 'base64').toString('utf8');
        return res.send(raw);
      }
      return res.status(apiRes.status).json({ error: 'GitHub file read error' });
    } catch (e) {
      return res.status(500).json({ error: 'GitHub connection error', details: e.message });
    }
  }

  // Local read
  const fullPath = path.join(PROJECTS_DIR, name, filePath);
  if (!fullPath.startsWith(PROJECTS_DIR)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const data = fs.readFileSync(fullPath, 'utf8');
    res.send(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file', details: err.message });
  }
});

app.post('/api/project/:name/file', async (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path;
  const { content } = req.body;

  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'File path and text content are required' });
  }

  try {
    let finalContent = content;

    // Synchronize Page Title and Meta Description with H1 tag if saving an HTML file
    if (filePath.endsWith('.html')) {
      try {
        const h1Match = finalContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (h1Match && h1Match[1]) {
          const h1Text = h1Match[1].replace(/<[^>]*>/g, '').trim();
          // Keep title tags aligned
          finalContent = finalContent.replace(/<title>(.*?)<\/title>/i, `<title>${h1Text} | ${name}</title>`);
          
          // Keep meta descriptions aligned
          const newDesc = `Discover expert ${h1Text} services by ${name}. Syncing local strategy coordinates for professional protection.`;
          finalContent = finalContent.replace(/<meta\s+name="description"\s+content="[^"]*"/i, `<meta name="description" content="${newDesc}"`);
          finalContent = finalContent.replace(/<meta\s+content="[^"]*"\s+name="description"/i, `<meta content="${newDesc}" name="description"`);
        }
      } catch (err) {
        console.error('Failed to sync page title/meta description on save:', err);
      }
    }

    await saveFileToGitOrLocal(name, filePath, finalContent);

    // Automatically compile schema and llms.txt when copy_brief.json is written
    if (filePath === 'copy_brief.json') {
      try {
        const briefData = JSON.parse(finalContent);
        const targetDir = path.join(PROJECTS_DIR, name);
        
        // Compile Schema & Inject
        generateLocalBusinessSchema(targetDir, briefData);
        patchInlineScriptIntoAllProjectHtmlFiles(targetDir);
        
        // Build sitemap router links dictionary
        const linkRouterDictionary = {};
        const sitemapDataPath = path.join(targetDir, 'sitemap.json');
        if (fs.existsSync(sitemapDataPath)) {
          try {
            const sitemapStructure = JSON.parse(fs.readFileSync(sitemapDataPath, 'utf8'));
            const categories = sitemapStructure.categories || {};
            Object.keys(categories).forEach(cat => {
              const pages = categories[cat] || [];
              pages.forEach(pg => {
                if (pg.file && pg.name) {
                  const keyword = pg.name.toLowerCase().replace(/\(.*?\)/g, '').trim();
                  linkRouterDictionary[keyword] = pg.file;
                }
              });
            });
          } catch (e) {
            console.error('Failed to parse sitemap in sync trigger:', e);
          }
        }
        
        // Compile llms.txt
        generateLlmsTxtDocument(targetDir, briefData, linkRouterDictionary);
      } catch (e) {
        console.error('Failed to auto-compile brief schema/llms.txt:', e);
      }
    }

    // Sync theme variables to style.css if theme.json is updated (local only)
    if (filePath === 'theme.json' && !GITHUB_TOKEN) {
      try {
        const themeData = JSON.parse(finalContent).theme || {};
        const cssPath = path.join(PROJECTS_DIR, name, 'css', 'style.css');
        if (fs.existsSync(cssPath)) {
          const colors = themeData.colors || {};
          if (colors['--md-sys-color-primary']) {
            colors['--color-accent'] = colors['--md-sys-color-primary'];
          }
          updateCssVariablesInFile(cssPath, colors, themeData.shape_tokens);
        }
      } catch (e) {
        console.error('Failed to sync CSS theme', e);
      }
    }

    res.json({ success: true, message: `File '${filePath}' saved (with automatic backup and Git commits).` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write file', details: err.message });
  }
});

// API: Binary File Upload (Saves image base64 directly to target project folder)
app.post('/api/project/:name/upload', async (req, res) => {
  const { name } = req.params;
  const { filePath, content } = req.body;

  if (!filePath || !content) {
    return res.status(400).json({ error: 'File path and content are required' });
  }

  try {
    const cleanBase64 = content.replace(/^data:image\/\w+;base64,/, "");
    
    if (GITHUB_TOKEN) {
      const repoFilePath = `projects/${name}/${filePath}`.replace(/\\/g, '/');
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      
      let sha = null;
      const getRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'GET', headers);
      if (getRes.status === 200 && getRes.body) {
        sha = getRes.body.sha;
      }
      
      const body = {
        message: `Visual Editor: upload asset ${filePath} in ${name}`,
        content: cleanBase64
      };
      if (sha) body.sha = sha;

      const putRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'PUT', headers, body);
      if (putRes.status !== 200 && putRes.status !== 201) {
        throw new Error(`GitHub API write failed for ${repoFilePath}. Status: ${putRes.status}`);
      }
    } else {
      const fullPath = path.join(PROJECTS_DIR, name, filePath);
      const fileDir = path.dirname(fullPath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, Buffer.from(cleanBase64, 'base64'));

      const relativeFilePathNormalized = path.join('projects', name, filePath).replace(/\\/g, '/');
      runGitCommand(`git add "${relativeFilePathNormalized}"`, WORKSPACE_DIR)
        .then((addRes) => {
          if (addRes.success) {
            runGitCommand(`git commit -m "Visual Editor: upload asset ${filePath} in ${name}"`, WORKSPACE_DIR);
          }
        });
    }

    res.json({ success: true, url: filePath });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// API: AI Text Generator (Simulates high-converting copy variants based on strategy frameworks)
// API: AI Text Generator (Dynamic Copywriting Engine enforcing spatial & strategy constraints)
app.post('/api/ai/generate', async (req, res) => {
  const { projectName, styleAction, currentText, elementContext, spatialGuardrails } = req.body;
  
  if (!projectName) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const absoluteProjectDir = path.join(PROJECTS_DIR, projectName);
  const briefDataPath = path.join(absoluteProjectDir, 'copy_brief.json');
  const sitemapDataPath = path.join(absoluteProjectDir, 'sitemap.json');
  
  let briefDossier = {};
  let linkRouterDictionary = {};

  try {
    // 1. Load copy brief details
    if (fs.existsSync(briefDataPath)) {
      briefDossier = JSON.parse(fs.readFileSync(briefDataPath, 'utf8'));
    } else {
      // In case brief doesn't exist yet, construct a fallback mock brief from client_data.json
      const clientDataPath = path.join(absoluteProjectDir, 'client_data.json');
      let clientData = {};
      if (fs.existsSync(clientDataPath)) {
        clientData = JSON.parse(fs.readFileSync(clientDataPath, 'utf8'));
      }
      briefDossier = {
        businessName: clientData.client_name || projectName,
        services: Array.isArray(clientData.services) ? clientData.services.join(', ') : 'Specialized Services',
        painPoints: 'outdated presence, slow web performance',
        address: 'Local service area',
        geoCoordinates: { latitude: 53.4808, longitude: -2.2426 },
        serviceRadius: '25 miles',
        authorMeta: 'Certified Specialist',
        provenTrackRecord: 'hundreds of successful projects completed'
      };
    }

    // 2. Build the sitemap link router map
    if (fs.existsSync(sitemapDataPath)) {
      try {
        const sitemapStructure = JSON.parse(fs.readFileSync(sitemapDataPath, 'utf8'));
        const categories = sitemapStructure.categories || {};
        Object.keys(categories).forEach(cat => {
          const pages = categories[cat] || [];
          pages.forEach(pg => {
            if (pg.file && pg.name) {
              const keyword = pg.name.toLowerCase().replace(/\(.*?\)/g, '').trim();
              linkRouterDictionary[keyword] = pg.file;
            }
          });
        });
      } catch (e) {
        console.error('Failed to parse sitemap in generate endpoint:', e);
      }
    }
  } catch (err) {
    console.error("Brief data resolution failed:", err);
  }

  try {
    // 3. Compile elite direct-response text
    const compiledEliteText = await callInternalLlmServiceRouter(
      briefDossier, 
      styleAction, 
      currentText, 
      elementContext, 
      spatialGuardrails || { maxCharsAllowed: 400, targetWordCount: 20 }, 
      linkRouterDictionary
    );

    // 4. Update Schema & llms.txt concurrently
    generateLocalBusinessSchema(absoluteProjectDir, briefDossier);
    generateLlmsTxtDocument(absoluteProjectDir, briefDossier, linkRouterDictionary);

    // 5. Inject schema into all HTML page headers
    patchInlineScriptIntoAllProjectHtmlFiles(absoluteProjectDir);

    // Return format matching both compiledEliteText and legacy res.text fallback
    res.json({ 
      success: true, 
      compiledEliteText: compiledEliteText,
      text: compiledEliteText 
    });
  } catch (genErr) {
    console.error("AI Copywriting generation pipeline failed:", genErr);
    res.status(500).json({ error: "AI Generation dropped context internally", details: genErr.message });
  }
});

// Offline Dynamic Copywriting Compiler Router
async function callInternalLlmServiceRouter(briefDossier, styleAction, currentText, elementContext, spatialGuardrails, routingLinks) {
  const bizName = briefDossier.businessName || "Our Brand";
  const servicesList = briefDossier.services ? briefDossier.services.split(',').map(s => s.trim()) : ["Premium Services"];
  const mainService = servicesList[0] || "Premium Services";
  const painPoint = briefDossier.painPoints || "leaks and structural deterioration";
  const address = briefDossier.address ? briefDossier.address.split(',')[0].trim() : "Manchester";
  const author = briefDossier.authorMeta || "Lead Expert";
  const proof = briefDossier.provenTrackRecord || "exceptional local reputation";

  let text = "";
  const isHeading = elementContext && elementContext.match(/^H[1-3]$/);
  const isButton = elementContext === "A" || elementContext === "BUTTON" || (currentText && currentText.length < 20);

  if (isHeading) {
    // Headline Strategies (Sugarman Hook + 4 U's)
    const options = {
      'Shorter': `Elite ${mainService} in ${address}`,
      'Longer': `Proven ${mainService} Specialists Serving ${address} with ${proof}`,
      'More Luxury': `The Art of Bespoke ${mainService} | ${bizName}`,
      'More Professional': `Certified ${mainService} & Structural Care | ${author}`,
      'More Friendly': `Welcome to ${bizName} - Local ${mainService} Experts`,
      'Improve SEO Headline': `Top-Rated ${mainService} in ${address} | ${bizName}`,
      'PAS Rewrite': `Stop ${painPoint}: Professional ${mainService} Today`
    };
    text = options[styleAction] || options['Improve SEO Headline'];
  } else if (isButton) {
    // Call to action button formats
    const options = {
      'Shorter': "Book Now",
      'Longer': `Schedule ${mainService} Assessment`,
      'More Luxury': "Request Private Invite",
      'More Professional': "Book Assessment",
      'More Friendly': "Let's Get Started",
      'Improve SEO Headline': "Secure Booking Online",
      'PAS Rewrite': "Solve Issue Today"
    };
    text = options[styleAction] || options['Shorter'];
  } else {
    // Paragraph / Body Strategies (PAS / 3-Sentence rule / E-E-A-T / scannability)
    if (styleAction === "PAS Rewrite") {
      text = `Are you struggling with ${painPoint}? Leaving this issue unresolved leads to progressive property damage and heavy financial bleeding. ${bizName} provides certified ${mainService} in ${address} to permanently resolve the friction and secure your peace of mind.`;
    } else if (styleAction === "More Luxury") {
      text = `Experience the absolute pinnacle of luxury ${mainService} tailored for you in ${address}. Under the meticulous guidance of ${author}, ${bizName} delivers bespoke craftsmanship and verified protection, validated by ${proof}.`;
    } else if (styleAction === "More Professional") {
      text = `We provide certified, evidence-based ${mainService} solutions throughout the ${address} area. Led by ${author}, our engineering-grade diagnostics systematically eliminate ${painPoint}. All operations comply with master credentials, delivering ${proof}.`;
    } else if (styleAction === "More Friendly") {
      text = `Dealing with ${painPoint} can be incredibly stressful, but you don't have to handle it alone. Our friendly, local team at ${bizName} has helped neighbors in ${address} with ${proof}, ensuring a warm, hassle-free service every time.`;
    } else if (styleAction === "Improve SEO Headline") {
      text = `If you are looking for the leading ${mainService} specialist in ${address}, ${bizName} is your trusted choice. Led by ${author}, we specialize in resolving ${painPoint} and have finalized ${proof} with outstanding local ratings.`;
    } else if (styleAction === "Shorter") {
      text = `${bizName} provides expert ${mainService} in ${address}. We resolve ${painPoint} quickly. Led by ${author}, we guarantee premium quality.`;
    } else {
      // Default / Longer / 3-Sentence Capsule
      text = `${bizName} is the premier local specialist for ${mainService} in the ${address} region, dedicated to resolving complex ${painPoint} challenges. Directed by ${author}, our operations are supported by a proven record of ${proof}. Read our service pages to discover how we can help you today.`;
    }

    // Interweave link router dictionary keywords safely (no double-replacements or tag nesting)
    const keywords = Object.keys(routingLinks)
      .filter(keyword => keyword.length > 3 && !['home', 'contact', 'faq'].includes(keyword))
      .sort((a, b) => b.length - a.length);

    if (keywords.length > 0) {
      const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const parts = text.split(/(<[^>]+>)/g);
      for (let i = 0; i < parts.length; i += 2) {
        let partText = parts[i];
        if (!partText) continue;
        const placeholders = [];
        keywords.forEach(keyword => {
          const escapedKeyword = escapeRegExp(keyword);
          const regex = new RegExp(`\\b(${escapedKeyword})\\b`, 'gi');
          partText = partText.replace(regex, (match) => {
            const placeholder = `%%LINK_TOKEN_${placeholders.length}%%`;
            placeholders.push({
              token: placeholder,
              html: `<a href="${routingLinks[keyword]}" data-editable="true">${match}</a>`
            });
            return placeholder;
          });
        });
        placeholders.forEach(item => {
          partText = partText.replace(item.token, item.html);
        });
        parts[i] = partText;
      }
      text = parts.join('');
    }
  }

  // Enforce rigid max characters spatial guardrail limit
  const maxChars = spatialGuardrails.maxCharsAllowed || 400;
  if (text.length > maxChars) {
    let truncated = text.substring(0, maxChars);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      truncated = truncated.substring(0, lastSpace);
    }
    // Close any trailing split anchor tags to avoid broken DOM
    if (truncated.includes('<a') && !truncated.includes('</a>')) {
      truncated += '</a>';
    }
    text = truncated;
  }

  return text;
}

// Structured schema configuration graph writer
function generateLocalBusinessSchema(dirTarget, dossier) {
  const outputSchemaPath = path.join(dirTarget, 'structured_schema.jsonld');
  const localBusinessPayload = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `https://placeholder-brand-url.com/#local-entity`,
    "name": dossier.businessName,
    "address": {
      "@type": "PostalAddress",
      "streetAddress": dossier.address
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": dossier.geoCoordinates?.latitude || 0,
      "longitude": dossier.geoCoordinates?.longitude || 0
    },
    "areaServed": {
      "@type": "GeoCircle",
      "geoRadius": dossier.serviceRadius
    },
    "knowsAbout": dossier.services ? dossier.services.split(',').map(s => s.trim()) : [],
    "author": {
      "@type": "Person",
      "name": dossier.authorMeta,
      "jobTitle": "Expert Operator"
    }
  };
  fs.writeFileSync(outputSchemaPath, JSON.stringify(localBusinessPayload, null, 4), 'utf8');
}

// Machine Discovery llms.txt Compiler
function generateLlmsTxtDocument(dirTarget, dossier, routingLinks) {
  const textRootDocPath = path.join(dirTarget, 'llms.txt');
  let markdownPayload = `# ${dossier.businessName}\n\n> Verified professional service entity specialized in ${dossier.services || 'local solutions'}.\n\n## Core Topic Channels & Service Links\n`;
  
  Object.keys(routingLinks).forEach(keyword => {
    markdownPayload += `- [${keyword.toUpperCase()} Expert Details Matrix - Local Options](/${routingLinks[keyword]})\n`;
  });
  
  fs.writeFileSync(textRootDocPath, markdownPayload, 'utf8');
}

// Injects the structured schema block across project pages natively
function patchInlineScriptIntoAllProjectHtmlFiles(dirTarget) {
  const schemaBlockPath = path.join(dirTarget, 'structured_schema.jsonld');
  if (!fs.existsSync(schemaBlockPath)) return;
  
  const activeSchemaRawDataString = fs.readFileSync(schemaBlockPath, 'utf8');
  const htmlFiles = fs.readdirSync(dirTarget).filter(f => f.endsWith('.html'));

  htmlFiles.forEach(file => {
    const fullPath = path.join(dirTarget, file);
    let contents = fs.readFileSync(fullPath, 'utf8');
    
    // Schema script tag element
    const scriptElementPayload = `<script id="ks-brief-schema" type="application/ld+json">\n${activeSchemaRawDataString}\n</script>`;
    
    if (contents.includes('id="ks-brief-schema"')) {
      contents = contents.replace(/<script id="ks-brief-schema"[\s\S]*?<\/script>/, scriptElementPayload);
    } else if (contents.includes('</head>')) {
      contents = contents.replace('</head>', `  ${scriptElementPayload}\n</head>`);
    }
    
    fs.writeFileSync(fullPath, contents, 'utf8');
  });
}

// API: AI Image search (Loads matching high-end clinical and salon stock photographs based on prompt tags)
app.post('/api/ai/image', (req, res) => {
  const { prompt } = req.body;
  
  const images = [
    'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1579684389782-64d84b5e905d?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=800&q=80'
  ];

  let selected = images[0];
  const query = (prompt || '').toLowerCase();
  if (query.includes('doctor') || query.includes('dentist') || query.includes('practitioner')) {
    selected = images[1];
  } else if (query.includes('hair') || query.includes('styling') || query.includes('cut')) {
    selected = images[2];
  } else if (query.includes('office') || query.includes('studio') || query.includes('room')) {
    selected = images[3];
  } else if (query.includes('face') || query.includes('treatment') || query.includes('skincare')) {
    selected = images[4];
  } else if (query.includes('smile') || query.includes('dental') || query.includes('teeth')) {
    selected = images[5];
  } else {
    selected = images[Math.floor(Math.random() * images.length)];
  }

  res.json({ success: true, url: selected });
});

// API: Get Page History (Both local file backups & Git commits log)
app.get('/api/project/:name/history', async (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path;

  if (!filePath) {
    return res.status(400).json({ error: 'File path query parameter is required' });
  }

  const projectDir = path.join(PROJECTS_DIR, name);
  const backupsDir = path.join(projectDir, '_backups');
  const relativeFilePath = path.join('projects', name, filePath).replace(/\\/g, '/');

  const history = {
    backups: [],
    gitCommits: []
  };

  // 1. Gather backup files
  if (GITHUB_TOKEN) {
    const backupsPath = `projects/${name}/_backups`;
    try {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const apiRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${backupsPath}`, 'GET', headers);
      if (apiRes.status === 200 && Array.isArray(apiRes.body)) {
        apiRes.body.forEach((file) => {
          if (file.name.startsWith(path.basename(filePath)) && file.name.endsWith('.bak')) {
            const parts = file.name.split('.');
            const rawTime = parts[parts.length - 2] || '';
            const label = rawTime ? rawTime.replace(/-/g, ':') : file.name;
            history.backups.push({
              filename: file.name,
              size: file.size,
              timestampLabel: label
            });
          }
        });
        history.backups.reverse();
      }
    } catch (e) {
      console.log('No backups folder on GitHub yet.');
    }
  } else {
    if (fs.existsSync(backupsDir)) {
      try {
        const files = fs.readdirSync(backupsDir);
        files.forEach((file) => {
          if (file.startsWith(path.basename(filePath)) && file.endsWith('.bak')) {
            const stats = fs.statSync(path.join(backupsDir, file));
            const parts = file.split('.');
            const rawTime = parts[parts.length - 2] || '';
            const label = rawTime ? rawTime.replace(/-/g, ':') : stats.mtime.toLocaleString();

            history.backups.push({
              filename: file,
              size: stats.size,
              time: stats.mtime,
              timestampLabel: label
            });
          }
        });
        history.backups.sort((a, b) => b.time - a.time);
      } catch (err) {
        console.error('Error listing backups', err);
      }
    }
  }

  // 2. Gather git commits
  if (GITHUB_TOKEN) {
    try {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const commitsRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/commits?path=${relativeFilePath}`, 'GET', headers);
      if (commitsRes.status === 200 && Array.isArray(commitsRes.body)) {
        history.gitCommits = commitsRes.body.map(item => {
          return {
            hash: item.sha.substring(0, 7),
            author: item.commit.author.name,
            date: new Date(item.commit.author.date).toLocaleString(),
            message: item.commit.message
          };
        });
      }
    } catch (e) {
      console.error('GitHub commits log query failed', e);
    }
  } else {
    try {
      const gitRes = await runGitCommand(`git log -n 15 --pretty=format:"%h|%an|%ar|%s" -- "${relativeFilePath}"`, WORKSPACE_DIR);
      if (gitRes.success && gitRes.output) {
        history.gitCommits = gitRes.output.split('\n').map((line) => {
          const [hash, author, date, message] = line.split('|');
          return { hash, author, date, message };
        });
      }
    } catch (err) {
      console.error('Git log command failed', err);
    }
  }

  res.json(history);
});

// API: Restore a Page from Backup
app.post('/api/project/:name/restore', async (req, res) => {
  const { name } = req.params;
  const { file, backupFile } = req.body;

  if (!file || !backupFile) {
    return res.status(400).json({ error: 'File path and backup filename are required' });
  }

  try {
    if (GITHUB_TOKEN) {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const backupPath = `projects/${name}/_backups/${backupFile}`;
      
      const backupRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${backupPath}`, 'GET', headers);
      if (backupRes.status !== 200 || !backupRes.body) {
        return res.status(404).json({ error: `Backup file '${backupFile}' not found on GitHub` });
      }

      const content = Buffer.from(backupRes.body.content, 'base64').toString('utf8');
      await saveFileToGitOrLocal(name, file, content);
    } else {
      const projectDir = path.join(PROJECTS_DIR, name);
      const backupPath = path.join(projectDir, '_backups', backupFile);
      const activePath = path.join(projectDir, file);

      if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ error: `Backup file '${backupFile}' not found` });
      }

      fs.copyFileSync(backupPath, activePath);

      const relativeFilePath = path.join('projects', name, file).replace(/\\/g, '/');
      runGitCommand(`git add "${relativeFilePath}"`, WORKSPACE_DIR)
        .then((addRes) => {
          if (addRes.success) {
            runGitCommand(`git commit -m "Visual Editor: restored '${file}' from backup '${backupFile}'"`, WORKSPACE_DIR);
          }
        });
    }

    res.json({ success: true, message: `Successfully restored '${file}' to previous version.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore backup version', details: err.message });
  }
});

// API: Push Committed Git Changes (Local only)
app.post('/api/project/:name/git-push', async (req, res) => {
  if (GITHUB_TOKEN) {
    return res.json({ success: true, message: 'All changes are already saved live on GitHub!' });
  }

  try {
    const pushRes = await runGitCommand('git push', WORKSPACE_DIR);
    if (pushRes.success) {
      res.json({ success: true, message: 'Successfully pushed all changes to remote Git repository!' });
    } else {
      res.status(500).json({ 
        error: 'Git push failed. Ensure remote repository tracking is configured.', 
        details: pushRes.error 
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to run git push', details: err.message });
  }
});

// Export app or listen (Dual-Mode start)
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(` Kasim Shah Website Engine Control Panel Active!`);
    console.log(` Dashboard URL: http://localhost:${PORT}/admin/index.html`);
    console.log(`======================================================\n`);
  });
}
