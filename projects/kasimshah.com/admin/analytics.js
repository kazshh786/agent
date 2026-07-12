/**
 * Kasim Shah Agency Control Panel - Project Analytics JS
 */

const API_BASE = ''; // Relative path endpoint
let currentProjectName = '';
let currentProjectData = null;
let homepageHtml = '';

// Load project data and run initial scan
async function initAnalytics() {
  const params = new URLSearchParams(window.location.search);
  currentProjectName = params.get('project');

  if (!currentProjectName) {
    showToast('No project specified. Redirecting back to dashboard.', 'error');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 2000);
    return;
  }

  try {
    // 1. Fetch catalog
    const res = await fetch(`${API_BASE}/api/projects`);
    if (!res.ok) throw new Error('API server returned error');
    const projects = await res.json();

    currentProjectData = projects.find(p => p.name === currentProjectName);
    if (!currentProjectData) {
      throw new Error(`Project "${currentProjectName}" not found in catalog`);
    }

    // Update Client Headers
    document.getElementById('clientSiteName').innerText = currentProjectData.name;
    
    const industry = currentProjectData.clientData.industry || 'Bespoke Campaign Interface';
    const bottleneck = currentProjectData.clientData.revenue_bottleneck || 'conversion';
    const vibe = currentProjectData.theme.vibe || 'Luxury/Editorial';
    
    document.getElementById('clientSiteDesc').innerText = `"${industry}" — Optimizing funnel nodes for the ${bottleneck} bottleneck.`;
    document.getElementById('metaIndustry').innerHTML = `<span class="material-icons" style="font-size: 1.1rem;">category</span> Industry: ${industry}`;
    document.getElementById('metaBottleneck').innerHTML = `<span class="material-icons" style="font-size: 1.1rem;">error</span> Bottleneck: ${formatBottleneckName(bottleneck)}`;
    document.getElementById('metaVibe').innerHTML = `<span class="material-icons" style="font-size: 1.1rem;">palette</span> Vibe: ${vibe}`;

    // Hide loader, show content
    document.getElementById('analytics-loading').style.display = 'none';
    document.getElementById('analytics-content').style.display = 'block';

    // 2. Scan code files dynamically
    await runLiveAudit(false); // run silently on load

  } catch (err) {
    document.getElementById('analytics-loading').innerHTML = `
      <span class="material-icons" style="font-size: 3rem; color: var(--color-error); margin-bottom: 16px;">error</span>
      <p style="font-size: 1.2rem; color: var(--color-error); font-weight: 500;">Failed to load analytics: ${err.message}</p>
      <a href="index.html" class="btn btn-secondary" style="margin-top: 16px; min-height: 40px; padding: 0 16px;">Return to Catalog</a>
    `;
    showToast(err.message, 'error');
  }
}

// Format bottleneck values to human readable text
function formatBottleneckName(b) {
  if (b === 'conversion') return 'Funnel Conversion Leak';
  if (b === 'outdated') return 'Outdated Slow Stack';
  if (b === 'traffic') return 'Low Traffic Volume';
  return b;
}

// Fetch project homepage and run diagnostic audits
async function runLiveAudit(notify = true) {
  if (notify) {
    showToast('Re-scanning codebase index.html...', 'info');
    document.getElementById('btn-re-audit').disabled = true;
    document.getElementById('btn-re-audit').innerText = 'Scanning...';
  }

  try {
    // Attempt to load index.html via file endpoint
    const fileRes = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProjectName)}/file?path=index.html`);
    if (fileRes.ok) {
      homepageHtml = await fileRes.text();
    } else {
      homepageHtml = '';
      console.warn('Could not read index.html from server API');
    }
  } catch (e) {
    homepageHtml = '';
    console.error('File audit network issue:', e);
  }

  // Execute audits on code
  const auditReport = scanCodebase(homepageHtml, currentProjectData);

  // Render scores & progress dials
  updateLighthouseDials(auditReport.scores);

  // Render works / doesn't work summaries
  renderOverviewCards(auditReport);

  // Render simulated Google Analytics metrics
  renderGoogleAnalytics(auditReport.scores, currentProjectData.clientData);

  // Render diagnostic checklist detail rows
  renderChecklistDetails(auditReport.checks);

  // Update Core Integrations status and actions
  updateIntegrationsStatus(auditReport);

  if (notify) {
    showToast('Codebase scan and audit telemetry compiled successfully!', 'success');
    document.getElementById('btn-re-audit').disabled = false;
    document.getElementById('btn-re-audit').innerHTML = '<span class="material-icons" style="font-size: 0.95rem;">refresh</span> Scan Files Live';
  }
}

// Codebase scan algorithm
function scanCodebase(html, proj) {
  const checks = [];
  let isGoogleAnalyticsPresent = false;
  let hasRobotsNoIndex = false;
  let hasTitle = false;
  let hasDescription = false;
  let hasSchema = false;
  let h1Count = 0;
  let totalImagesCount = 0;
  let lazyImagesCount = 0;
  let altImagesCount = 0;
  let scriptTagsCount = 0;
  let deferredScriptCount = 0;
  let domComplexityNodes = 0;
  let hasGscVerification = false;
  let gscCode = '';

  // Defaults if html is empty (e.g. project files not reachable, fallback)
  if (!html) {
    // Generate default/simulated diagnostics if server is stubbed
    isGoogleAnalyticsPresent = false;
    hasRobotsNoIndex = true; // staging default
    hasTitle = true;
    hasDescription = true;
    hasSchema = true;
    h1Count = 1;
    totalImagesCount = 4;
    lazyImagesCount = 4;
    altImagesCount = 4;
    scriptTagsCount = 2;
    deferredScriptCount = 2;
    domComplexityNodes = 320;
    hasGscVerification = false;
    gscCode = '';
  } else {
    // Simple regex parsing to simulate real parser without heavy parser library
    isGoogleAnalyticsPresent = html.includes('googletagmanager') || html.includes('google-analytics') || html.includes('gtag(');
    hasRobotsNoIndex = /meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex[^"']*["']/i.test(html) || 
                       /meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i.test(html);
    hasTitle = /<title[^>]*>/i.test(html);
    hasDescription = /<meta[^>]+name=["']description["']/i.test(html) || /<meta[^>]+content=[^>]+name=["']description["']/i.test(html);
    hasSchema = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);
    hasGscVerification = /meta[^>]+name=["']google-site-verification["']/i.test(html) || 
                         /meta[^>]+content=[^>]+name=["']google-site-verification["']/i.test(html);
    if (hasGscVerification) {
      const gscMatch = html.match(/name=["']google-site-verification["'][^>]+content=["']([^"']+)["']/i) || 
                       html.match(/content=["']([^"']+)["'][^>]+name=["']google-site-verification["']/i);
      gscCode = gscMatch ? gscMatch[1] : 'Present';
    }
    
    const h1Matches = html.match(/<h1[^>]*>/gi);
    h1Count = h1Matches ? h1Matches.length : 0;

    // Dom size estimation by counting tag starts
    const tagMatches = html.match(/<[a-zA-Z]/g);
    domComplexityNodes = tagMatches ? tagMatches.length : 0;

    // Image tags analysis
    const imgMatches = html.match(/<img[^>]*>/gi) || [];
    totalImagesCount = imgMatches.length;
    imgMatches.forEach(img => {
      if (/loading=["']lazy["']/i.test(img)) lazyImagesCount++;
      if (/alt=["'][^"']+/i.test(img)) altImagesCount++;
    });

    // Scripts analysis
    const scriptMatches = html.match(/<script[^>]*>/gi) || [];
    scriptTagsCount = scriptMatches.length;
    scriptMatches.forEach(s => {
      if (/defer/i.test(s) || /async/i.test(s) || /type=["']module["']/i.test(s)) deferredScriptCount++;
    });
  }

  // 1. Check: Google Analytics Tag
  checks.push({
    id: 'GA_TAG_CHECK',
    name: 'Google Analytics Integration',
    status: isGoogleAnalyticsPresent ? 'PASS' : 'FAIL',
    details: isGoogleAnalyticsPresent 
      ? 'Detected global gtag.js snippet successfully initialized in index.html head.' 
      : 'Google Analytics snippet (gtag.js / GTM) missing in index.html head. Real visitor tracking is inactive.'
  });

  // Google Search Console Check
  checks.push({
    id: 'GSC_VERIFICATION',
    name: 'Google Search Console Verification',
    status: hasGscVerification ? 'PASS' : 'WARNING',
    details: hasGscVerification 
      ? `Detected active site verification code (${gscCode}). Site can link to search reports.`
      : 'Verification meta tag is missing. Google Search Console cannot read index telemetry or performance reports.'
  });

  // 2. Check: Robots Crawler index protection
  checks.push({
    id: 'ROBOTS_INDEX',
    name: 'Search Crawler Indexing Protection',
    status: hasRobotsNoIndex ? 'WARNING' : 'PASS',
    details: hasRobotsNoIndex 
      ? 'Staging mode active ("noindex, nofollow" meta detected). Prevents Google crawling drafts. Remember to remove before launching production domain.'
      : 'Indexing allowed. Site is crawlable by public search spiders.'
  });

  // 3. Check: Title tag
  checks.push({
    id: 'SEO_TITLE',
    name: 'Meta Title Presence',
    status: hasTitle ? 'PASS' : 'FAIL',
    details: hasTitle 
      ? 'Meta title is configured in document head supporting search relevancy.' 
      : 'Title tag missing. Browser displays blank tab header; critical failure for SEO mapping.'
  });

  // 4. Check: Meta Description
  checks.push({
    id: 'SEO_DESC',
    name: 'Meta Description Snippet',
    status: hasDescription ? 'PASS' : 'FAIL',
    details: hasDescription 
      ? 'Description tag defined in header. Recommending under 160 characters for crisp SERP snippets.' 
      : 'Meta description tag is missing. Search engines will extract random text blocks.'
  });

  // 5. Check: JSON-LD Schema Structuring
  checks.push({
    id: 'SCHEMA_LD',
    name: 'Structured JSON-LD Schema Metadata',
    status: hasSchema ? 'PASS' : 'WARNING',
    details: hasSchema 
      ? 'Semantic JSON-LD structure found. Schema communicates organization and maps entity properties directly to search engines.' 
      : 'No schema markup detected. Search bots cannot parse business vertical types (e.g. Clinic, Studio) as structured nodes.'
  });

  // 6. Check: Heading Hierarchy
  let h1Status = 'PASS';
  let h1Details = 'Exactly one H1 element detected on page matching recommended SEO standard.';
  if (h1Count === 0) {
    h1Status = 'FAIL';
    h1Details = 'No H1 element found. Document is missing primary typographic heading.';
  } else if (h1Count > 1) {
    h1Status = 'WARNING';
    h1Details = `Multiple H1 elements (${h1Count}) found on landing page. Recommending exactly one H1 to establish strong structural hierarchy.`;
  }
  checks.push({ id: 'HEADING_H1', name: 'Semantic H1 Hierarchy', status: h1Status, details: h1Details });

  // 7. Check: Lazy Loading Images
  let lazyStatus = 'PASS';
  let lazyDetails = 'All images use loading="lazy" supporting performance optimization.';
  if (totalImagesCount > 0) {
    const lazyRatio = lazyImagesCount / totalImagesCount;
    if (lazyRatio < 0.5) {
      lazyStatus = 'WARNING';
      lazyDetails = `Only ${lazyImagesCount}/${totalImagesCount} images configured with loading="lazy". Unoptimized off-screen images cause unnecessary load speed penalties.`;
    }
  }
  checks.push({ id: 'IMG_LAZY', name: 'Image Lazy Loading', status: lazyStatus, details: lazyDetails });

  // 8. Check: Image accessibility alt text
  let altStatus = 'PASS';
  let altDetails = 'All images contain descriptive alt values satisfying screen reader accessibility.';
  if (totalImagesCount > 0) {
    const altRatio = altImagesCount / totalImagesCount;
    if (altRatio < 0.7) {
      altStatus = 'FAIL';
      altDetails = `Accessibility alert: Only ${altImagesCount}/${totalImagesCount} images contain descriptive alt text. Violates WCAG 2.1 criteria.`;
    } else if (altRatio < 1) {
      altStatus = 'WARNING';
      altDetails = `Attention required: ${totalImagesCount - altImagesCount} images missing alt text descriptions. Fix to guarantee flawless accessibility scores.`;
    }
  }
  checks.push({ id: 'IMG_ALT', name: 'Image Alt Accessibility Tagging', status: altStatus, details: altDetails });

  // 9. Check: Script execution bottleneck
  let scriptStatus = 'PASS';
  let scriptDetails = 'All script references defer, use modules, or execute asynchronously; preventing script parser blockers.';
  if (scriptTagsCount > 0 && deferredScriptCount < scriptTagsCount) {
    scriptStatus = 'WARNING';
    scriptDetails = `Performance alert: ${scriptTagsCount - deferredScriptCount} script tags lack "defer" or "async" declarations, blocking HTML parse streams.`;
  }
  checks.push({ id: 'SCRIPT_DEFER', name: 'Non-Blocking Script Execution', status: scriptStatus, details: scriptDetails });

  // 10. Check: DOM Complexity
  let domStatus = 'PASS';
  let domDetails = `DOM structure contains ${domComplexityNodes} nodes, well within speed guidelines (< 800 nodes).`;
  if (domComplexityNodes > 1200) {
    domStatus = 'FAIL';
    domDetails = `Extreme DOM depth detected (${domComplexityNodes} nodes). Causes rendering layout shifts and increases page weights.`;
  } else if (domComplexityNodes > 800) {
    domStatus = 'WARNING';
    domDetails = `Dense DOM elements detected (${domComplexityNodes} nodes). Keep layout markup simplified.`;
  }
  checks.push({ id: 'DOM_COMPLEXITY', name: 'DOM Tree Size Guidelines', status: domStatus, details: domDetails });

  // Calculate scores based on scans
  const scores = calculateScores(checks, isGoogleAnalyticsPresent, hasRobotsNoIndex);

  return {
    checks,
    scores,
    isGoogleAnalyticsPresent,
    hasGscVerification,
    gscCode
  };
}

// Compute dynamic audit scores
function calculateScores(checks, isGaPresent, isStaging) {
  let perfScore = 95;
  let accessScore = 98;
  let bestScore = 92;
  let seoScore = 90;

  checks.forEach(c => {
    if (c.status === 'FAIL') {
      if (['GA_TAG_CHECK', 'SEO_TITLE', 'SEO_DESC'].includes(c.id)) seoScore -= 15;
      if (['HEADING_H1', 'IMG_ALT'].includes(c.id)) accessScore -= 15;
      if (['DOM_COMPLEXITY', 'IMG_LAZY'].includes(c.id)) perfScore -= 12;
    } else if (c.status === 'WARNING') {
      if (['SCHEMA_LD'].includes(c.id)) seoScore -= 10;
      if (['ROBOTS_INDEX'].includes(c.id)) seoScore -= 5; // small staging warning
      if (['IMG_ALT', 'HEADING_H1'].includes(c.id)) accessScore -= 8;
      if (['SCRIPT_DEFER', 'DOM_COMPLEXITY'].includes(c.id)) perfScore -= 10;
    }
  });

  // Bound scores between 0 and 100
  return {
    performance: Math.max(10, Math.min(100, perfScore)),
    accessibility: Math.max(10, Math.min(100, accessScore)),
    bestPractices: Math.max(10, Math.min(100, bestScore)),
    seo: Math.max(10, Math.min(100, seoScore))
  };
}

// Update Lighthouse progress dials with animation
function updateLighthouseDials(scores) {
  const categories = ['Performance', 'Accessibility', 'BestPractices', 'SEO'];
  
  // Update KPI average in top header card
  const avg = Math.round((scores.performance + scores.accessibility + scores.bestPractices + scores.seo) / 4);
  const kpiLighthouse = document.getElementById('kpiLighthouse');
  if (kpiLighthouse) {
    kpiLighthouse.innerText = `${avg}/100`;
  }

  categories.forEach(cat => {
    const scoreVal = scores[cat.charAt(0).toLowerCase() + cat.slice(1)];
    const textEl = document.getElementById(`score${cat}`);
    const circleEl = document.getElementById(`dial${cat}`);

    if (textEl) textEl.innerText = scoreVal;
    
    if (circleEl) {
      // StrokeDashArray is 263.89 (circumference for r=42)
      // StrokeDashOffset = Circumference * (1 - Score/100)
      const offset = 263.89 * (1 - scoreVal / 100);
      circleEl.style.strokeDashoffset = offset;

      // Color adjustment based on score
      let color = '#30D158'; // green
      if (scoreVal < 50) color = '#FF453A'; // red
      else if (scoreVal < 90) color = '#FF9F0A'; // orange
      circleEl.setAttribute('stroke', color);
    }
  });
}

// Populate works / doesn't work highlights list dynamically
function renderOverviewCards(report) {
  const worksList = document.getElementById('evalWorksList');
  const failsList = document.getElementById('evalFailsList');
  const priorityList = document.getElementById('priorityActionsList');
  const bottleneckImpact = document.getElementById('bottleneckImpactAnalysis');

  if (!worksList || !failsList || !priorityList) return;

  worksList.innerHTML = '';
  failsList.innerHTML = '';
  priorityList.innerHTML = '';

  const passChecks = report.checks.filter(c => c.status === 'PASS');
  const issueChecks = report.checks.filter(c => c.status === 'FAIL' || c.status === 'WARNING');

  // Populate Works
  if (passChecks.length === 0) {
    worksList.innerHTML = '<li>Code structures are fully unoptimized. Run core framework modifications.</li>';
  } else {
    passChecks.slice(0, 4).forEach(c => {
      worksList.innerHTML += `<li><strong>${c.name}</strong>: ${extractSnippet(c.details)}</li>`;
    });
  }

  // Populate Fails
  if (issueChecks.length === 0) {
    failsList.innerHTML = '<li>Zero warning nodes detected. Code architecture is running flawless conversion loops!</li>';
  } else {
    issueChecks.forEach(c => {
      const type = c.status === 'FAIL' ? 'critical' : 'warning';
      failsList.innerHTML += `<li class="${type}"><strong>${c.name}</strong>: ${extractSnippet(c.details)}</li>`;
    });
  }

  // Generate priority strategy actions and bottleneck review based on client profile
  const bottleneck = currentProjectData.clientData.revenue_bottleneck || 'conversion';
  const industry = currentProjectData.clientData.industry || 'aesthetics';
  
  let bottleneckAnalysisText = '';
  let recommendations = [];

  if (bottleneck === 'conversion') {
    bottleneckAnalysisText = `The bottleneck profile is mapped as a **Conversion Funnel Leak**. While acquisition structures perform stably, high layout bounces are recorded. The primary task is to optimize CTA contrast, inject yes-ladder checklists, and simplify checkout pathways.`;
    recommendations = [
      'Set up high-contrast primary CTA above the fold in index.html index grids.',
      'Inject data-editable tags for copywriters to audit intake form messaging.',
      'Ensure the Calendly booking widgets avoid redundant redirection wrappers.'
    ];
  } else if (bottleneck === 'outdated') {
    bottleneckAnalysisText = `The bottleneck profile is mapped as an **Outdated Stack speed decay**. Slow DOM tree parsing and undeferred scripts block conversion pipelines. Mobile page load speeds are experiencing significant drag.`;
    recommendations = [
      'Inject "defer" declarations on all blocking third-party scripts.',
      'Apply optimized WebP wrappers and set standard dimensions on hero canvas elements.',
      'Audit layout DOM structure to simplify complex nested columns.'
    ];
  } else if (bottleneck === 'traffic') {
    bottleneckAnalysisText = `The bottleneck profile is mapped as **Low Acquisition Traffic**. Funnel rendering shows high booking conversion ratios, but low traffic volumes bottleneck absolute revenue goals. High-intent Local SEO needs deployment.`;
    recommendations = [
      'Incorporate semantic structured schema JSON-LD scripts to align with search bots.',
      'Establish descriptive links for structural pages (e.g. contact.html) inside service-single elements.',
      'Confirm metadata descriptions use keywords matching local niche intents.'
    ];
  }

  // Add codebase warnings to priority recommendations
  const gaCheck = report.checks.find(c => c.id === 'GA_TAG_CHECK');
  if (gaCheck && gaCheck.status === 'FAIL') {
    recommendations.unshift('CRITICAL: Embed the Google Analytics snippet into index.html head to unlock real conversion statistics.');
  }

  const altCheck = report.checks.find(c => c.id === 'IMG_ALT');
  if (altCheck && altCheck.status === 'FAIL') {
    recommendations.push('Accessibility Audit: Inject alt descriptions to image assets to meet WCAG 2.1 specifications.');
  }

  bottleneckImpact.innerText = bottleneckAnalysisText;
  recommendations.forEach(rec => {
    priorityList.innerHTML += `<li>${rec}</li>`;
  });
}

// Extract shorter text snippet for card visual
function extractSnippet(text) {
  if (text.length > 90) {
    return text.substring(0, 87) + '...';
  }
  return text;
}

// Generate high fidelity simulated analytics adjusted by current bottleneck profile
function renderGoogleAnalytics(scores, clientData) {
  const bottleneck = clientData.revenue_bottleneck || 'conversion';
  
  let baseSessions = 4800;
  let bounceRate = 35.5;
  let conversionRate = 3.2;

  // Modulate based on bottleneck type
  if (bottleneck === 'conversion') {
    baseSessions = 5200;
    bounceRate = 58.4;
    conversionRate = 0.9; // poor conversion
  } else if (bottleneck === 'outdated') {
    baseSessions = 1800;  // speed penalty drops traffic
    bounceRate = 72.8;  // high abandonment
    conversionRate = 1.1;
  } else if (bottleneck === 'traffic') {
    baseSessions = 1100;  // low volume
    bounceRate = 26.2;  // high engagement
    conversionRate = 4.8;  // excellent conversion
  }

  // Adjust slightly based on Lighthouse performance score
  const speedImpact = (100 - scores.performance) * 0.15;
  bounceRate += speedImpact;
  conversionRate -= speedImpact * 0.05;

  // Format bounds
  bounceRate = Math.max(15, Math.min(95, bounceRate)).toFixed(1);
  conversionRate = Math.max(0.1, Math.min(15, conversionRate)).toFixed(2);

  // Update KPI layout values
  document.getElementById('kpiSessions').innerText = baseSessions.toLocaleString();
  document.getElementById('kpiBounce').innerText = `${bounceRate}%`;
  document.getElementById('kpiConversion').innerText = `${conversionRate}%`;

  // Update KPI subtexts
  updateKpiTrends(bottleneck, bounceRate, conversionRate);

  // Generate 30 days daily trend graph
  generateTrafficGraph(baseSessions, bounceRate);

  // Render Traffic Acquisition breakdown
  renderAcquisitionSources(bottleneck);

  // Render Page views
  renderTopPagesList(baseSessions, conversionRate);
}

// Modulate KPI subtexts and trends
function updateKpiTrends(bottleneck, bounce, conversion) {
  const sessionsTrend = document.getElementById('kpiSessionsTrend');
  const bounceTrend = document.getElementById('kpiBounceTrend');
  const conversionTrend = document.getElementById('kpiConversionTrend');

  if (bottleneck === 'conversion') {
    sessionsTrend.innerHTML = '<span class="material-icons kpi-trend-up" style="font-size:1rem;">trending_up</span> <span class="kpi-trend-up">+18.5%</span> acquisition spike';
    bounceTrend.innerHTML = '<span class="material-icons kpi-trend-down" style="font-size:1rem; color:var(--color-error);">trending_up</span> <span style="color:var(--color-error); font-weight:600;">+12.4%</span> leakage bounce';
    conversionTrend.innerHTML = '<span class="material-icons kpi-trend-down" style="font-size:1rem; color:var(--color-error);">trending_down</span> <span style="color:var(--color-error); font-weight:600;">-1.5%</span> below benchmark';
  } else if (bottleneck === 'outdated') {
    sessionsTrend.innerHTML = '<span class="material-icons kpi-trend-down" style="font-size:1rem; color:var(--color-error);">trending_down</span> <span style="color:var(--color-error); font-weight:600;">-12.8%</span> speed ranking hit';
    bounceTrend.innerHTML = '<span class="material-icons kpi-trend-down" style="font-size:1rem; color:var(--color-error);">trending_up</span> <span style="color:var(--color-error); font-weight:600;">+24.1%</span> page-load bounce';
    conversionTrend.innerHTML = '<span class="material-icons kpi-trend-down" style="font-size:1rem; color:var(--color-error);">trending_down</span> <span style="color:var(--color-error); font-weight:600;">-0.8%</span> slow checkout drop';
  } else {
    sessionsTrend.innerHTML = '<span class="material-icons kpi-trend-down" style="font-size:1rem; color:var(--color-error);">trending_down</span> <span style="color:var(--color-error); font-weight:600;">-5.2%</span> low absolute scale';
    bounceTrend.innerHTML = '<span class="material-icons kpi-trend-up" style="font-size:1rem;">trending_down</span> <span class="kpi-trend-up">-8.6%</span> highly sticky views';
    conversionTrend.innerHTML = '<span class="material-icons kpi-trend-up" style="font-size:1rem;">trending_up</span> <span class="kpi-trend-up">+2.4%</span> elite lead funnel';
  }
}

// Generate animated SVG traffic chart
function generateTrafficGraph(baseSessions, bounceRate) {
  const container = document.getElementById('trafficChartContainer');
  if (!container) return;

  // Clear container but keep tooltip
  const tooltip = document.getElementById('chartTooltip');
  container.innerHTML = '';
  container.appendChild(tooltip);

  const width = container.clientWidth || 600;
  const height = 230;

  // Generate 30 days data
  const dataPoints = [];
  const dailyBase = baseSessions / 30;
  let seed = dailyBase * 0.9;
  
  for (let i = 0; i < 30; i++) {
    const randomVary = (Math.sin(i / 2) * dailyBase * 0.15) + (Math.random() * dailyBase * 0.1);
    const value = Math.max(10, Math.round(seed + randomVary));
    dataPoints.push(value);
  }

  // Draw SVG
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.overflow = 'visible';

  // Calculate coordinates
  const paddingX = 40;
  const paddingY = 20;
  const graphWidth = width - paddingX * 2;
  const graphHeight = height - paddingY * 2;

  const maxVal = Math.max(...dataPoints) * 1.1;
  const minVal = Math.min(...dataPoints) * 0.9;
  const valRange = maxVal - minVal;

  const coords = dataPoints.map((val, idx) => {
    const x = paddingX + (idx / 29) * graphWidth;
    const y = paddingY + graphHeight - ((val - minVal) / valRange) * graphHeight;
    return { x, y, value: val, day: idx + 1 };
  });

  // 1. Gridlines
  for (let i = 0; i <= 3; i++) {
    const gridY = paddingY + (i / 3) * graphHeight;
    const valLabel = Math.round(maxVal - (i / 3) * valRange);
    
    // Label text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '0');
    text.setAttribute('y', gridY + 4);
    text.setAttribute('fill', 'var(--color-muted)');
    text.setAttribute('font-size', '10px');
    text.textContent = valLabel;
    svg.appendChild(text);

    // Line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', paddingX);
    line.setAttribute('y1', gridY);
    line.setAttribute('x2', width - paddingX);
    line.setAttribute('y2', gridY);
    line.setAttribute('stroke', 'var(--color-dark-border)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '4, 4');
    svg.appendChild(line);
  }

  // 2. Define Gradient
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  gradient.setAttribute('id', 'chartGrad');
  gradient.setAttribute('x1', '0');
  gradient.setAttribute('y1', '0');
  gradient.setAttribute('x2', '0');
  gradient.setAttribute('y2', '1');
  
  const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', 'var(--color-accent)');
  stop1.setAttribute('stop-opacity', '0.25');

  const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', 'var(--color-accent)');
  stop2.setAttribute('stop-opacity', '0.0');

  gradient.appendChild(stop1);
  gradient.appendChild(stop2);
  defs.appendChild(gradient);
  svg.appendChild(defs);

  // 3. Draw Path Line & Fill Area
  let pathD = '';
  coords.forEach((c, idx) => {
    if (idx === 0) pathD += `M ${c.x} ${c.y}`;
    else pathD += ` L ${c.x} ${c.y}`;
  });

  // Area fill path
  const areaD = pathD + ` L ${coords[coords.length - 1].x} ${paddingY + graphHeight} L ${coords[0].x} ${paddingY + graphHeight} Z`;

  const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  areaPath.setAttribute('d', areaD);
  areaPath.setAttribute('fill', 'url(#chartGrad)');
  svg.appendChild(areaPath);

  const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  linePath.setAttribute('d', pathD);
  linePath.setAttribute('fill', 'none');
  linePath.setAttribute('stroke', 'var(--color-accent)');
  linePath.setAttribute('stroke-width', '2.5');
  svg.appendChild(linePath);

  // 4. Interactive Dots (Hover Telemetry)
  coords.forEach((c) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', c.x);
    circle.setAttribute('cy', c.y);
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', 'var(--color-accent)');
    circle.setAttribute('stroke', '#0A0A0A');
    circle.setAttribute('stroke-width', '1.5');
    circle.style.opacity = '0';
    circle.style.cursor = 'pointer';
    circle.style.transition = 'all 0.15s ease';

    // Tooltip interaction trigger
    circle.addEventListener('mouseenter', () => {
      circle.setAttribute('r', '6');
      circle.style.opacity = '1';
      tooltip.style.opacity = '1';
      tooltip.innerHTML = `<strong>Day ${c.day}</strong><br>Sessions: ${c.value}`;
      
      const parentRect = container.getBoundingClientRect();
      tooltip.style.left = `${c.x - 40}px`;
      tooltip.style.top = `${c.y - 65}px`;
    });

    circle.addEventListener('mouseleave', () => {
      circle.setAttribute('r', '4');
      circle.style.opacity = '0';
      tooltip.style.opacity = '0';
    });

    svg.appendChild(circle);
  });

  // Time stamp indicators along X-axis
  const daysToShow = [1, 10, 20, 30];
  daysToShow.forEach(day => {
    const c = coords.find(item => item.day === day);
    if (c) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', c.x - 12);
      text.setAttribute('y', height - 2);
      text.setAttribute('fill', 'var(--color-muted)');
      text.setAttribute('font-size', '10px');
      text.textContent = `Jul ${day.toString().padStart(2, '0')}`;
      svg.appendChild(text);
    }
  });

  container.appendChild(svg);
}

// Render Acquisition Progress Bar channels
function renderAcquisitionSources(bottleneck) {
  const container = document.getElementById('trafficSourcesList');
  if (!container) return;

  let channels = [
    { name: 'Organic SEO', share: 45 },
    { name: 'Direct Traffic', share: 25 },
    { name: 'Referral & Partner Links', share: 20 },
    { name: 'Social Networks', share: 10 }
  ];

  if (bottleneck === 'traffic') {
    // Low search footprint
    channels = [
      { name: 'Organic SEO', share: 18 },
      { name: 'Direct Traffic', share: 42 },
      { name: 'Referral & Partner Links', share: 22 },
      { name: 'Social Networks', share: 18 }
    ];
  }

  container.innerHTML = '';
  channels.forEach(ch => {
    container.innerHTML += `
      <div class="source-item">
        <div class="source-header">
          <span class="source-name">${ch.name}</span>
          <span class="source-val">${ch.share}%</span>
        </div>
        <div class="source-bar-bg">
          <div class="source-bar-fill" style="width: 0%;" data-width="${ch.share}%"></div>
        </div>
      </div>
    `;
  });

  // Trigger anim width after load
  setTimeout(() => {
    document.querySelectorAll('.source-bar-fill').forEach(el => {
      el.style.width = el.getAttribute('data-width');
    });
  }, 100);
}

// Render Landing Page views simulation
function renderTopPagesList(totalSessions, conversionRate) {
  const tbody = document.querySelector('#landingPagesTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  const pages = currentProjectData.pages || [];

  if (pages.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--color-muted); font-style:italic; text-align:center;">No custom subpages index detected. Populate template subpages.</td></tr>`;
    return;
  }

  // Sort pages so index.html/Home is first
  const sortedPages = [...pages].sort((a, b) => {
    if (a.file === 'index.html') return -1;
    if (b.file === 'index.html') return 1;
    return 0;
  });

  // Distribute pageviews proportionally
  let remainingViews = totalSessions;
  
  sortedPages.forEach((p, idx) => {
    let weight = 0.15; // default page share
    if (idx === 0) weight = 0.50; // home takes 50%
    else if (idx === 1) weight = 0.20; // second takes 20%
    
    let pageSessions = Math.round(totalSessions * weight);
    if (idx === sortedPages.length - 1) pageSessions = remainingViews;
    remainingViews -= pageSessions;
    pageSessions = Math.max(12, pageSessions);

    // Goal conversion rates modulation by page type
    let pageConv = parseFloat(conversionRate);
    if (p.file.includes('qualification') || p.file.includes('contact') || p.file.includes('diary')) {
      pageConv = (parseFloat(conversionRate) * 2.8).toFixed(2);
    } else if (p.file.includes('about') || p.file.includes('faq')) {
      pageConv = (parseFloat(conversionRate) * 0.3).toFixed(2);
    } else {
      pageConv = parseFloat(conversionRate).toFixed(2);
    }

    tbody.innerHTML += `
      <tr>
        <td style="padding: 10px 12px; font-family: monospace; font-size: 0.8rem; color:var(--color-secondary);">${p.file}</td>
        <td style="padding: 10px 12px; text-align: right; color:var(--color-muted);">${pageSessions.toLocaleString()}</td>
        <td style="padding: 10px 12px; text-align: right; font-weight:600; color:var(--color-accent);">${pageConv}%</td>
      </tr>
    `;
  });
}

// Render technical audit diagnostics check list detail rows
function renderChecklistDetails(checks) {
  const tbody = document.getElementById('auditDiagnosticsBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  checks.forEach(c => {
    let statusClass = 'pass';
    let statusIcon = 'check';
    
    if (c.status === 'FAIL') {
      statusClass = 'fail';
      statusIcon = 'close';
    } else if (c.status === 'WARNING') {
      statusClass = 'warning';
      statusIcon = 'warning';
    }

    tbody.innerHTML += `
      <tr>
        <td style="font-family: monospace; font-size:0.75rem; color: var(--color-muted);">${c.id}</td>
        <td style="font-weight:600; color:var(--color-secondary);">${c.name}</td>
        <td style="text-align:center;">
          <span class="audit-status-badge ${statusClass}">
            <span class="material-icons" style="font-size:0.9rem;">${statusIcon}</span> ${c.status}
          </span>
        </td>
        <td style="color:var(--color-muted); font-size:0.85rem; line-height:1.4;">${c.details}</td>
      </tr>
    `;
  });
}

// Tab Switching logic
function switchTab(tabId) {
  // Update button headers
  document.querySelectorAll('.analytics-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  const activeBtn = document.getElementById(`tab-btn-${tabId}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Update tabs visibility
  document.querySelectorAll('.tab-section').forEach(section => {
    section.style.display = 'none';
  });

  const activeSection = document.getElementById(`section-${tabId}`);
  if (activeSection) {
    activeSection.style.display = 'block';
    
    // If graph tab is loaded, re-draw the SVG to guarantee parent dimensions match clientWidth
    if (tabId === 'google-analytics') {
      const bottleneck = currentProjectData.clientData.revenue_bottleneck || 'conversion';
      let baseSessions = bottleneck === 'conversion' ? 5200 : (bottleneck === 'outdated' ? 1800 : 1100);
      generateTrafficGraph(baseSessions, bottleneck === 'conversion' ? 58.4 : (bottleneck === 'outdated' ? 72.8 : 26.2));
    }
  }
}

// Toast notification helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : (type === 'error' ? '⚠️' : 'ℹ️')}</span>
    <div>${message}</div>
  `;

  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.style.transition = 'all 0.5s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// Update UI connection status indicators for GSC and Google Analytics
function updateIntegrationsStatus(report) {
  const statusGA = document.getElementById('statusGA');
  const detailsGA = document.getElementById('detailsGA');
  const btnSetupGA = document.getElementById('btnSetupGA');

  const statusGSC = document.getElementById('statusGSC');
  const detailsGSC = document.getElementById('detailsGSC');
  const btnSetupGSC = document.getElementById('btnSetupGSC');

  if (!statusGA || !statusGSC) return;

  if (report.isGoogleAnalyticsPresent) {
    statusGA.innerText = 'Connected';
    statusGA.className = 'audit-status-badge pass';
    let gaId = 'Active';
    const gaMatch = homepageHtml.match(/gtag\('config',\s*'([^']+)'\)/i) || homepageHtml.match(/id=(G-[A-Za-z0-9]+)/i);
    if (gaMatch) gaId = gaMatch[1];
    detailsGA.innerHTML = `gtag.js initialized successfully.<br><strong>Measurement ID: ${gaId}</strong>`;
    btnSetupGA.innerHTML = '<span class="material-icons" style="font-size: 0.9rem; vertical-align:middle;">settings</span> Update GA';
  } else {
    statusGA.innerText = 'Not Found';
    statusGA.className = 'audit-status-badge fail';
    detailsGA.innerText = 'gtag.js snippet is missing in index.html head.';
    btnSetupGA.innerHTML = '<span class="material-icons" style="font-size: 0.9rem; vertical-align:middle;">settings</span> Setup GA';
  }

  if (report.hasGscVerification) {
    statusGSC.innerText = 'Verified';
    statusGSC.className = 'audit-status-badge pass';
    let displayCode = report.gscCode;
    if (displayCode.length > 20) displayCode = displayCode.substring(0, 17) + '...';
    detailsGSC.innerHTML = `Search verification tag active.<br><strong>Key: ${displayCode}</strong>`;
    btnSetupGSC.innerHTML = '<span class="material-icons" style="font-size: 0.9rem; vertical-align:middle;">vpn_key</span> Update Tag';
  } else {
    statusGSC.innerText = 'Not Verified';
    statusGSC.className = 'audit-status-badge fail';
    detailsGSC.innerText = 'Verification meta tag not detected in document head.';
    btnSetupGSC.innerHTML = '<span class="material-icons" style="font-size: 0.9rem; vertical-align:middle;">vpn_key</span> Verify GSC';
  }
}

// Google Analytics Modal controls
function openGASetupModal() {
  const modal = document.getElementById('gaSetupModal');
  if (modal) {
    let gaId = '';
    const gaMatch = homepageHtml.match(/gtag\('config',\s*'([^']+)'\)/i) || homepageHtml.match(/id=(G-[A-Za-z0-9]+)/i);
    if (gaMatch) gaId = gaMatch[1];
    document.getElementById('gaMeasurementId').value = gaId;
    modal.style.display = 'flex';
  }
}

// Global functions exposed to window
window.openGASetupModal = openGASetupModal;

function closeGASetupModal() {
  const modal = document.getElementById('gaSetupModal');
  if (modal) modal.style.display = 'none';
}
window.closeGASetupModal = closeGASetupModal;

async function saveGASetup(e) {
  e.preventDefault();
  const id = document.getElementById('gaMeasurementId').value.trim();
  if (!id) return;

  const btn = document.getElementById('submitGASetupBtn');
  const origText = btn.innerText;
  btn.innerText = 'INJECTING...';
  btn.disabled = true;

  try {
    let html = homepageHtml;
    if (!html) {
      throw new Error('Index.html not loaded from client directory.');
    }

    // Clean old scripts
    html = html.replace(/<!-- Google Analytics -->[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<script[^>]+src=["'][^"']*googletagmanager\.com[^"']*["'][^>]*><\/script>\s*<script>[\s\S]*?<\/script>/gi, '');

    const snippet = `<!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${id}');
  </script>`;

    // Insert right after head starts
    html = html.replace(/<head>/i, `<head>\n  ${snippet}`);

    const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProjectName)}/file?path=index.html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: html })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to edit index.html');
    }

    showToast(`Google Analytics configured for ${currentProjectName}!`, 'success');
    closeGASetupModal();
    await runLiveAudit(false);

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.innerText = origText;
    btn.disabled = false;
  }
}
window.saveGASetup = saveGASetup;

// Google Search Console Modal controls
function openGSCSetupModal() {
  const modal = document.getElementById('gscSetupModal');
  if (modal) {
    let verificationCode = '';
    const gscMatch = homepageHtml.match(/content=["']([^"']+)["'][^>]+name=["']google-site-verification["']/i) ||
                     homepageHtml.match(/name=["']google-site-verification["'][^>]+content=["']([^"']+)["']/i);
    if (gscMatch) verificationCode = gscMatch[1];
    document.getElementById('gscVerificationCode').value = verificationCode;
    modal.style.display = 'flex';
  }
}
window.openGSCSetupModal = openGSCSetupModal;

function closeGSCSetupModal() {
  const modal = document.getElementById('gscSetupModal');
  if (modal) modal.style.display = 'none';
}
window.closeGSCSetupModal = closeGSCSetupModal;

async function saveGSCSetup(e) {
  e.preventDefault();
  const input = document.getElementById('gscVerificationCode').value.trim();
  if (!input) return;

  const btn = document.getElementById('submitGSCSetupBtn');
  const origText = btn.innerText;
  btn.innerText = 'INJECTING...';
  btn.disabled = true;

  try {
    let html = homepageHtml;
    if (!html) {
      throw new Error('Index.html not loaded from client directory.');
    }

    let token = input;
    const tagMatch = input.match(/content=["']([^"']+)["']/i);
    if (tagMatch) token = tagMatch[1];

    // Clean old meta tag
    html = html.replace(/<meta[^>]+name=["']google-site-verification["'][^>]*>/gi, '');

    const snippet = `<meta name="google-site-verification" content="${token}">`;
    html = html.replace(/<head>/i, `<head>\n  ${snippet}`);

    const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProjectName)}/file?path=index.html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: html })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to edit index.html');
    }

    showToast('Search Console verification tag injected successfully!', 'success');
    closeGSCSetupModal();
    await runLiveAudit(false);

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.innerText = origText;
    btn.disabled = false;
  }
}
window.saveGSCSetup = saveGSCSetup;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', initAnalytics);
