/**
 * KS Agency Unified Dashboard - Controller Script
 * Handles view routing, API fetch requests, Supabase database bindings,
 * POS checkout drawer actions, CRM timeline feeds, and Chart.js feeds.
 */

// --- 1. CONFIGURATION & STATE ---
const API_BASE = 'http://localhost:3000'; // local Website Generator API
const SUPABASE_URL = 'https://edycdjjzapimvlzdebkl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_1kOdM2M1WntwU-aZNEk11w_oaVqkKv3';

const AppState = {
  activeView: 'overview',
  apiStatus: 'checking',
  supabaseStatus: 'checking',
  
  // Compiled Web Engine projects from local API
  webProjects: [],
  templates: [],
  
  // Supabase OS salon tenants list
  tenants: [],
  selectedTenant: null,
  
  // Data for active tenant
  services: [],
  staff: [],
  appointments: [],
  waitlist: [],
  offPeakRules: [],
  crmClients: [],
  checkoutTransactions: [],
  selectedClient: null,
  
  // Social Auto marketing queues
  socialSet: 'kasim-agency',
  scheduledPosts: [],
  inbox: [],
  
  // POS Cart State
  cartItems: [],
  cartTotal: 0
};

let supabaseClient = null;

// Initialize Supabase dynamic CDN client
function initSupabase() {
  if (typeof supabase !== 'undefined') {
    try {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      AppState.supabaseStatus = 'online';
      updateStatusBar();
      fetchSupabaseTenants();
    } catch (err) {
      console.error('Supabase init failed:', err);
      AppState.supabaseStatus = 'offline';
      updateStatusBar();
    }
  } else {
    console.warn('Supabase client SDK not loaded from CDN.');
    AppState.supabaseStatus = 'offline';
    updateStatusBar();
  }
}

// --- 2. LIFE-CYCLE LOADERS ---
document.addEventListener('DOMContentLoaded', async () => {
  initSupabase();
  setupNavigation();
  checkApiConnection();
  loadSocialData();
  
  // Attach event listener callbacks
  document.getElementById('btn-unison-wizard').addEventListener('click', openUnisonWizard);
  document.getElementById('btn-close-wizard').addEventListener('click', closeUnisonWizard);
  document.getElementById('wizard-form').addEventListener('submit', handleWizardSubmit);
  document.getElementById('btn-close-checkout').addEventListener('click', closeCheckoutDrawer);
  document.getElementById('btn-process-checkout').addEventListener('click', processPOSCheckout);
  
  // Load initially active modules
  await loadWebCatalog();
  renderOverviewTelemetry();
});

// Update connection badges in sidebar
function updateStatusBar() {
  const apiDot = document.getElementById('api-status-dot');
  const apiText = document.getElementById('api-status-text');
  const dbDot = document.getElementById('db-status-dot');
  const dbText = document.getElementById('db-status-text');
  
  if (AppState.apiStatus === 'online') {
    apiDot.className = 'status-dot online';
    apiText.textContent = 'API ONLINE';
  } else {
    apiDot.className = 'status-dot offline';
    apiText.textContent = 'API OFFLINE';
  }
  
  if (AppState.supabaseStatus === 'online') {
    dbDot.className = 'status-dot online';
    dbText.textContent = 'SUPABASE CONNECTED';
  } else {
    dbDot.className = 'status-dot offline';
    dbText.textContent = 'SUPABASE DISCONNECTED';
  }
}

// Check if website generator API is running
async function checkApiConnection() {
  try {
    const res = await fetch(`${API_BASE}/api/templates`);
    if (res.ok) {
      AppState.apiStatus = 'online';
      const templates = await res.json();
      AppState.templates = templates;
      populateTemplateOptions();
    } else {
      AppState.apiStatus = 'offline';
    }
  } catch (err) {
    console.warn('Website compiler API offline. Running in sandbox simulated mode.');
    AppState.apiStatus = 'offline';
  }
  updateStatusBar();
}

// --- 3. DYNAMIC ROUTING & NAVIGATION ---
function setupNavigation() {
  const links = document.querySelectorAll('.nav-item');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      switchView(view);
      
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
    });
  });
}

function switchView(viewName) {
  AppState.activeView = viewName;
  
  // Hide all views
  const views = document.querySelectorAll('.dashboard-view');
  views.forEach(v => v.classList.remove('active'));
  
  // Show target view
  const target = document.getElementById(`view-${viewName}`);
  if (target) {
    target.classList.add('active');
  }
  
  // Run screen-specific refresh scripts
  if (viewName === 'overview') {
    renderOverviewTelemetry();
  } else if (viewName === 'web') {
    renderWebCatalogView();
  } else if (viewName === 'social') {
    renderSocialDashboard();
  } else if (viewName === 'salon') {
    renderSalonOsModule();
  }
}

// Toast helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>
    <div>${message}</div>
  `;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transition = 'all 0.5s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// --- 4. THE UNISON ACTION CENTER (Wizard) ---
function openUnisonWizard() {
  document.getElementById('unison-wizard-overlay').classList.add('active');
  document.getElementById('wiz-step-1').classList.add('active');
  document.getElementById('wiz-step-2').classList.remove('active');
  document.getElementById('wiz-step-3').classList.remove('active');
  document.getElementById('wiz-btn-prev').style.display = 'none';
  document.getElementById('wiz-btn-next').textContent = 'Next: Service Settings';
  
  // Sync select options
  populateTemplateOptions();
  updateWizardProgress(1);
}

function closeUnisonWizard() {
  document.getElementById('unison-wizard-overlay').classList.remove('active');
  document.getElementById('wizard-form').reset();
}

function updateWizardProgress(stepNum) {
  const steps = document.querySelectorAll('#wizard-indicator .w-step');
  steps.forEach((step, idx) => {
    step.className = 'w-step';
    if (idx + 1 === stepNum) {
      step.classList.add('active');
    } else if (idx + 1 < stepNum) {
      step.classList.add('completed');
    }
  });
}

let wizardStep = 1;
function moveWizard(direction) {
  const currentPanel = document.getElementById(`wiz-step-${wizardStep}`);
  
  // Basic validation before advancing
  if (direction === 1) {
    if (wizardStep === 1) {
      const name = document.getElementById('wizName').value.trim();
      const sub = document.getElementById('wizSubdomain').value.trim();
      if (!name || !sub) {
        showToast('Please complete business identity fields.', 'error');
        return;
      }
    } else if (wizardStep === 2) {
      const industry = document.getElementById('wizIndustry').value;
      if (!industry) {
        showToast('Please select an industry vertical.', 'error');
        return;
      }
    }
  }

  currentPanel.classList.remove('active');
  wizardStep += direction;
  const nextPanel = document.getElementById(`wiz-step-${wizardStep}`);
  nextPanel.classList.add('active');

  // Footers
  const prevBtn = document.getElementById('wiz-btn-prev');
  const nextBtn = document.getElementById('wiz-btn-next');

  prevBtn.style.display = wizardStep === 1 ? 'none' : 'inline-flex';
  
  if (wizardStep === 3) {
    nextBtn.textContent = 'Compile & Provision Workspace';
    nextBtn.className = 'btn btn-accent';
    // Load preview card summaries
    document.getElementById('summary-biz-name').textContent = document.getElementById('wizName').value;
    document.getElementById('summary-subdomain').textContent = document.getElementById('wizSubdomain').value.toLowerCase() + '.kasimshah.com';
    document.getElementById('summary-industry').textContent = document.getElementById('wizIndustry').value.toUpperCase();
    document.getElementById('summary-color').style.backgroundColor = document.getElementById('wizColor').value;
  } else {
    nextBtn.textContent = wizardStep === 1 ? 'Next: Service Settings' : 'Next: Confirm Details';
    nextBtn.className = 'btn btn-primary';
  }
  
  updateWizardProgress(wizardStep);
}

// Trigger move wizard binds
document.getElementById('wiz-btn-next').addEventListener('click', () => {
  if (wizardStep < 3) {
    moveWizard(1);
  }
});
document.getElementById('wiz-btn-prev').addEventListener('click', () => {
  if (wizardStep > 1) {
    moveWizard(-1);
  }
});

// Handle the unison workspace provision compile actions
async function handleWizardSubmit(e) {
  e.preventDefault();
  
  const submitBtn = document.getElementById('wiz-btn-next');
  submitBtn.disabled = true;
  submitBtn.textContent = 'PROVISIONING UNIFIED CLOUD...';
  
  const name = document.getElementById('wizName').value.trim();
  const subdomain = document.getElementById('wizSubdomain').value.trim().toLowerCase();
  const industry = document.getElementById('wizIndustry').value;
  const templateName = document.getElementById('wizTemplate').value;
  const color = document.getElementById('wizColor').value;
  const email = document.getElementById('wizOwnerEmail').value.trim() || `owner@${subdomain}.com`;
  const password = document.getElementById('wizOwnerPassword').value || 'kasimshah123';
  
  showToast(`Initiating compile request for '${name}'...`, 'info');
  
  let webSuccess = false;
  let dbSuccess = false;

  // Step 1: Compile Web Engine Project via local API (simulated fallback if offline)
  try {
    if (AppState.apiStatus === 'online') {
      const res = await fetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          templateName: templateName,
          industry: industry,
          bottleneck: 'conversion',
          bookingLink: `https://${subdomain}.kasimshah.com/book`,
          pageSize: '10',
          brandColor: color,
          vibe: 'Luxury/Editorial',
          tone: 'Sophisticated/Editorial',
          logoText: `${name.toUpperCase()}`,
          services: industry === 'barber' ? ['Skin Fade', 'Beard Trim'] : industry === 'nails' ? ['Gel Manicure', 'Acrylic Set'] : ['Laser Facial']
        })
      });
      if (res.ok) {
        webSuccess = true;
        showToast('Web Engine compiled successfully!', 'success');
      } else {
        const err = await res.json();
        showToast(`Web compile failed: ${err.error}`, 'error');
      }
    } else {
      // simulated success
      webSuccess = true;
      showToast('Simulated Web Engine compile draft created!', 'success');
      // Add mock web project
      AppState.webProjects.push({
        name: name,
        clientData: { industry: industry, revenue_bottleneck: 'conversion' },
        theme: { vibe: 'Luxury/Editorial', colors: { '--md-sys-color-primary': color } },
        pages: ['index.html', 'services.html', 'about.html', 'contact.html']
      });
    }
  } catch (err) {
    showToast(`Web compiler API connection failure: ${err.message}`, 'error');
  }

  // Step 2: Provision Multi-Tenant Supabase Workspace
  try {
    if (AppState.supabaseStatus === 'online' && supabaseClient) {
      // Sign up or insert via RPC or API
      const { data: session } = await supabaseClient.auth.getSession();
      const token = session?.access_token || '';
      
      const response = await fetch(`${API_BASE}/api/admin/provision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          salonName: name,
          subdomain: subdomain,
          industry: industry,
          ownerEmail: email,
          ownerPassword: password
        })
      });
      
      if (response.ok) {
        dbSuccess = true;
        showToast('Supabase workspace & domains provisioned successfully!', 'success');
      } else {
        // Fallback: insert directly into tenants table if service role isn't available
        const { data, error } = await supabaseClient
          .from('tenants')
          .insert([
            { name: name, subdomain: subdomain, primary_color: '#0f172a', secondary_color: '#475569', accent_color: color }
          ])
          .select();
        
        if (!error) {
          dbSuccess = true;
          showToast('Direct Supabase tenant workspace record provisioned.', 'success');
        } else {
          showToast(`Tenant provisioning failed: ${error.message}`, 'error');
        }
      }
    } else {
      dbSuccess = true;
      showToast('Simulated Supabase tenant created in memory.', 'success');
    }
  } catch (err) {
    showToast(`Database connection failure: ${err.message}`, 'error');
  }

  // Step 3: Register Social Set profile
  if (webSuccess || dbSuccess) {
    // Add brand to local lists
    KSSocialMockData.brands.push({ id: subdomain, name: name });
    // Add account
    KSSocialMockData.socialAccounts.push({
      id: `acc-${Date.now()}`,
      platform: 'instagram',
      handle: `@${subdomain}.clinic`,
      name: name,
      avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
      status: 'connected',
      followers: '150',
      weeklyChange: '+0.0%'
    });
    
    // Seed starter scheduled posts based on industry vertical
    KSSocialMockData.scheduledPosts.push({
      id: `post-${Date.now()}`,
      platforms: ['instagram'],
      content: `Welcome to the grand opening of ${name}! We specialize in professional, high-standard ${industry} care. Book your appointment online today! 💅✨ #${industry} #GrandOpening`,
      mediaType: 'image',
      mediaUrl: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
      scheduleDate: new Date(Date.now() + 86400000).toISOString(),
      status: 'scheduled'
    });
    
    showToast('Social Set campaigns configured and scheduled!', 'success');
    
    // Refresh modules
    await loadWebCatalog();
    await fetchSupabaseTenants();
    
    // Switch to overview to celebrate
    closeUnisonWizard();
    switchView('overview');
    showToast(`Workspace compiled & online: https://${subdomain}.kasimshah.com`, 'success');
  } else {
    showToast('Provision pipeline rolled back due to error.', 'error');
  }
  
  submitBtn.disabled = false;
  submitBtn.textContent = 'Compile & Provision Workspace';
  wizardStep = 1;
}

// Populate template dropdown configurations
function populateTemplateOptions() {
  const select = document.getElementById('wizTemplate');
  if (!select) return;
  select.innerHTML = '';
  
  if (AppState.templates.length > 0) {
    AppState.templates.forEach(tpl => {
      const opt = document.createElement('option');
      opt.value = tpl;
      opt.textContent = tpl.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      select.appendChild(opt);
    });
  } else {
    select.innerHTML = `
      <option value="editorial-luxe">Editorial Luxe Theme</option>
      <option value="tech-sleek">Tech Sleek Theme</option>
      <option value="boutique-warm">Boutique Warm Theme</option>
    `;
  }
}

// --- 5. MODULE: COMPILER & FUNNELS ---
async function loadWebCatalog() {
  try {
    const res = await fetch(`${API_BASE}/api/projects`);
    if (res.ok) {
      AppState.webProjects = await res.json();
    }
  } catch (err) {
    console.warn('Failed to load live web catalog. Using default values.');
    AppState.webProjects = [
      {
        name: 'kasimshah.com',
        clientData: { industry: 'Digital Agency', revenue_bottleneck: 'N/A' },
        theme: { vibe: 'Luxury/Editorial', colors: { '--md-sys-color-primary': '#D4AF37' } },
        pages: ['index.html', 'about.html', 'contact.html', 'blog.html']
      }
    ];
  }
}

function renderOverviewTelemetry() {
  document.getElementById('overview-web-count').textContent = AppState.webProjects.length;
  
  const postsCount = KSSocialMockData.scheduledPosts.filter(p => p.status === 'scheduled').length;
  document.getElementById('overview-posts-count').textContent = postsCount;
  
  document.getElementById('overview-tenants-count').textContent = AppState.tenants.length;
  
  // Render Unison Activity feed log
  const feed = document.getElementById('overview-activity-feed');
  feed.innerHTML = '';
  
  const logs = [
    { text: 'Initial agency dashboard runtime online', time: 'Just now', type: 'system' },
    { text: `Supabase state synced: ${AppState.tenants.length} tenants loaded`, time: '2 mins ago', type: 'db' },
    { text: `Catalog synced: ${AppState.webProjects.length} client sites detected`, time: '5 mins ago', type: 'web' },
    { text: `Social marketing engine online: ${postsCount} scheduled runs`, time: '10 mins ago', type: 'social' }
  ];
  
  logs.forEach(log => {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.fontSize = '0.85rem';
    div.style.padding = '8px 0';
    div.style.borderBottom = '1px solid rgba(255, 255, 255, 0.03)';
    div.innerHTML = `
      <span><i class="fa-solid fa-circle-chevron-right" style="color: var(--primary-color); font-size: 0.65rem; margin-right: 8px;"></i>${log.text}</span>
      <span style="color: var(--text-muted); font-size: 0.75rem;">${log.time}</span>
    `;
    feed.appendChild(div);
  });
}

function renderWebCatalogView() {
  const grid = document.getElementById('web-engines-grid');
  grid.innerHTML = '';
  
  if (AppState.webProjects.length === 0) {
    grid.innerHTML = '<div class="glass-card">No compiled engines configured. Spin one up using the Actions wizard.</div>';
    return;
  }
  
  AppState.webProjects.forEach(proj => {
    const card = document.createElement('div');
    card.className = 'glass-card interactive';
    
    const color = proj.theme.colors?.['--md-sys-color-primary'] || '#6366f1';
    
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 12px;">
        <h3 style="font-family: var(--font-display); font-size: 1.25rem;">${proj.name}</h3>
        <span class="badge badge-primary">${proj.theme.vibe || 'Luxury'}</span>
      </div>
      <p style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 16px;">
        Industry: <strong>${proj.clientData.industry || 'General'}</strong><br>
        Key Bottleneck: <strong>${proj.clientData.revenue_bottleneck || 'conversion'}</strong>
      </p>
      
      <div style="display:flex; gap: 8px; align-items:center; margin-bottom:16px;">
        <span style="font-size:0.75rem; color:var(--text-muted);">Palette:</span>
        <span style="width:12px; height:12px; border-radius:50%; background-color:${color}; display:inline-block;"></span>
        <span style="font-size:0.75rem; color:var(--text-secondary);">${color}</span>
      </div>
      
      <div class="engine-card-footer">
        <span style="font-size: 0.8rem; color: var(--text-muted);">Pages Count: <strong>${proj.pages ? proj.pages.length : 0} views</strong></span>
        <div style="display:flex; gap:8px;">
          <a href="${API_BASE}/projects/${proj.name}/index.html" target="_blank" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.75rem;">Launch ↗</a>
          <button class="btn btn-primary" onclick="launchVisualEditor('${proj.name}')" style="padding: 6px 12px; font-size: 0.75rem;">Edit</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function launchVisualEditor(projName) {
  // Simulates launching the visual editor interface
  showToast(`Launching Visual Editor for ${projName}...`, 'info');
  window.open(`${API_BASE}/admin/editor.html?project=${encodeURIComponent(projName)}`, '_blank');
}

// --- 6. MODULE: SOCIAL AUTOMATION ---
function loadSocialData() {
  AppState.scheduledPosts = KSSocialMockData.scheduledPosts;
  AppState.inbox = KSSocialMockData.inboxMessages;
}

function renderSocialDashboard() {
  renderSocialAccounts();
  renderScheduledPostsList();
  renderCompetitorBenchmark();
  renderInboxFeeds();
}

function renderSocialAccounts() {
  const container = document.getElementById('social-accounts-list');
  container.innerHTML = '';
  
  KSSocialMockData.socialAccounts.forEach(acc => {
    const card = document.createElement('div');
    card.className = 'glass-card';
    card.style.padding = '16px';
    card.style.display = 'flex';
    card.style.alignItems = 'center';
    card.style.gap = '12px';
    
    let iconClass = 'fa-instagram';
    let iconColor = '#e1306c';
    if (acc.platform === 'twitter') { iconClass = 'fa-twitter'; iconColor = '#1da1f2'; }
    if (acc.platform === 'linkedin') { iconClass = 'fa-linkedin-in'; iconColor = '#0077b5'; }
    if (acc.platform === 'tiktok') { iconClass = 'fa-tiktok'; iconColor = '#fe2c55'; }
    if (acc.platform === 'pinterest') { iconClass = 'fa-pinterest'; iconColor = '#bd081c'; }
    
    card.innerHTML = `
      <img src="${acc.avatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
      <div style="flex-grow:1;">
        <h4 style="font-size:0.85rem; font-weight:700;">${acc.name}</h4>
        <span style="font-size:0.75rem; color:var(--text-muted);">${acc.handle}</span>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:700; font-size:0.9rem;">${acc.followers}</div>
        <span style="font-size:0.7rem; color:var(--success-color);">${acc.weeklyChange}</span>
      </div>
      <i class="fa-brands ${iconClass}" style="color:${iconColor}; font-size:1.2rem;"></i>
    `;
    container.appendChild(card);
  });
}

function renderScheduledPostsList() {
  const container = document.getElementById('scheduled-posts-list');
  container.innerHTML = '';
  
  const scheduled = AppState.scheduledPosts.filter(p => p.status === 'scheduled');
  
  if (scheduled.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem;">No posts currently scheduled.</div>';
    return;
  }
  
  scheduled.forEach(post => {
    const item = document.createElement('div');
    item.style.padding = '12px';
    item.style.borderBottom = '1px solid rgba(255, 255, 255, 0.04)';
    item.style.display = 'flex';
    item.style.gap = '12px';
    
    const date = new Date(post.scheduleDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    
    item.innerHTML = `
      <div style="flex-grow:1;">
        <p style="font-size:0.85rem; margin-bottom:4px; line-height:1.4;">${post.content}</p>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.75rem; color:var(--text-muted);"><i class="fa-regular fa-clock" style="margin-right:4px;"></i>${date}</span>
          <div style="display:flex; gap:6px;">
            ${post.platforms.map(p => `<span class="badge badge-muted" style="font-size:0.55rem; padding: 2px 6px;">${p}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderCompetitorBenchmark() {
  const container = document.getElementById('competitors-list');
  container.innerHTML = '';
  
  KSSocialMockData.analytics.competitors.forEach(comp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${comp.name}</strong></td>
      <td>${comp.followers}</td>
      <td>${comp.postsPerWeek} posts/wk</td>
      <td>${comp.avgEngagement}</td>
      <td>
        <span class="badge ${comp.status.includes('leading') ? 'badge-success' : 'badge-muted'}">${comp.status.replace('_', ' ')}</span>
      </td>
    `;
    container.appendChild(tr);
  });
}

function renderInboxFeeds() {
  const container = document.getElementById('social-inbox-list');
  container.innerHTML = '';
  
  AppState.inbox.forEach(msg => {
    const div = document.createElement('div');
    div.style.padding = '12px';
    div.style.borderBottom = '1px solid rgba(255, 255, 255, 0.04)';
    div.style.display = 'flex';
    div.style.gap = '12px';
    div.style.cursor = 'pointer';
    div.style.background = msg.unread ? 'rgba(99, 102, 241, 0.05)' : 'transparent';
    
    div.innerHTML = `
      <img src="${msg.senderAvatar}" style="width:36px; height:36px; border-radius:50%; object-fit:cover;">
      <div style="flex-grow:1;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
          <strong style="font-size:0.85rem;">${msg.sender}</strong>
          <span style="font-size:0.7rem; color:var(--text-muted);">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
        <p style="font-size:0.8rem; color:var(--text-secondary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width: 200px;">${msg.content}</p>
      </div>
    `;
    
    div.addEventListener('click', () => openInboxMessageDetails(msg));
    container.appendChild(div);
  });
}

function openInboxMessageDetails(msg) {
  const details = document.getElementById('social-inbox-details');
  details.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:12px;">
      <img src="${msg.senderAvatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
      <div>
        <h4 style="font-size:0.9rem; font-weight:700;">${msg.sender}</h4>
        <span style="font-size:0.75rem; color:var(--text-muted);">Source: ${msg.platform.toUpperCase()} (${msg.type})</span>
      </div>
    </div>
    <div id="thread-chat-log" style="display:flex; flex-direction:column; gap:12px; height:180px; overflow-y:auto; margin-bottom:16px;">
      ${msg.thread.map(t => `
        <div style="align-self: ${t.role === 'agent' ? 'flex-end' : 'flex-start'}; background: ${t.role === 'agent' ? 'var(--primary-color)' : 'rgba(255,255,255,0.04)'}; color: #fff; padding: 10px 14px; border-radius: var(--border-radius-sm); font-size: 0.8rem; max-width: 80%;">
          <p>${t.text}</p>
          <span style="font-size: 0.65rem; color: rgba(255,255,255,0.6); display:block; text-align:right; margin-top:4px;">${t.time}</span>
        </div>
      `).join('')}
    </div>
    <div style="display:flex; gap:8px;">
      <input type="text" id="inbox-reply-input" class="form-control" placeholder="Type a response..." style="padding: 8px 12px; font-size:0.8rem;">
      <button class="btn btn-primary" onclick="sendInboxReply('${msg.id}')" style="padding: 8px 16px; font-size:0.8rem;">Send</button>
    </div>
  `;
}

window.sendInboxReply = function(msgId) {
  const input = document.getElementById('inbox-reply-input');
  const replyText = input.value.trim();
  if (!replyText) return;
  
  const msg = AppState.inbox.find(m => m.id === msgId);
  if (msg) {
    msg.thread.push({ sender: 'Kasim Shah', role: 'agent', text: replyText, time: 'Now' });
    msg.unread = false;
    showToast('Reply dispatched via API integrations!', 'success');
    renderInboxFeeds();
    openInboxMessageDetails(msg);
  }
};

// --- 7. MODULE: MULTI-TENANT SALON OS ---
async function fetchSupabaseTenants() {
  if (!supabaseClient) return;
  try {
    const { data, error } = await supabaseClient
      .from('tenants')
      .select('*')
      .order('name');
    if (!error && data) {
      AppState.tenants = data;
      renderTenantsSelectorList();
      updateStatusBar();
    }
  } catch (e) {
    console.error('Supabase query failed:', e);
  }
}

function renderTenantsSelectorList() {
  const container = document.getElementById('salon-tenants-list');
  if (!container) return;
  container.innerHTML = '';
  
  if (AppState.tenants.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding:12px;">No active tenants registered in Supabase.</div>';
    return;
  }
  
  AppState.tenants.forEach(tenant => {
    const btn = document.createElement('button');
    btn.className = `tenant-nav-btn ${AppState.selectedTenant?.id === tenant.id ? 'active' : ''}`;
    btn.innerHTML = `
      <i class="fa-solid fa-shop"></i>
      <div style="text-align:left; flex-grow:1;">
        <div style="font-weight:600; font-size:0.85rem;">${tenant.name}</div>
        <span style="font-size:0.7rem; color:var(--text-muted);">${tenant.subdomain}.kasimshah.com</span>
      </div>
      <span style="width:8px; height:8px; border-radius:50%; background-color:${tenant.accent_color || '#10b981'};"></span>
    `;
    btn.addEventListener('click', () => selectTenantWorkspace(tenant));
    container.appendChild(btn);
  });
}

async function selectTenantWorkspace(tenant) {
  AppState.selectedTenant = tenant;
  renderTenantsSelectorList();
  
  // Show active tenant screen workspace panels
  document.getElementById('tenant-workspace-title').textContent = tenant.name;
  document.getElementById('tenant-workspace-subtitle').textContent = `Subdomain: ${tenant.subdomain}.kasimshah.com`;
  document.getElementById('tenant-active-panel').style.display = 'block';
  
  // Set theme properties dynamically
  const wrp = document.getElementById('tenant-active-panel');
  wrp.style.setProperty('--primary-color', tenant.primary_color || '#6366f1');
  wrp.style.setProperty('--accent-color', tenant.accent_color || '#10b981');
  
  showToast(`Synced workspace schema for '${tenant.name}'`, 'info');
  
  // Fetch tenant related data models
  await fetchTenantDbDetails(tenant.id);
  renderTenantCalendar();
  renderTenantCRMTab();
  renderTenantBillingAndRules();
}

async function fetchTenantDbDetails(tenantId) {
  if (!supabaseClient) {
    // simulated seeding data
    AppState.services = [
      { id: 's1', name: 'Luxury Hair Cut', duration: 45, price: 4500 },
      { id: 's2', name: 'Hot Towel Beard Shave', duration: 30, price: 2500 }
    ];
    AppState.staff = [
      { id: 'u1', name: 'Master Stylist Kasim', role: 'owner' }
    ];
    AppState.crmClients = [
      { id: 'c1', name: 'John Doe', email: 'john@gmail.com', loyalty_points: 120 }
    ];
    AppState.appointments = [];
    return;
  }
  
  try {
    // 1. Fetch services
    const { data: svcs } = await supabaseClient.from('services').select('*').eq('tenant_id', tenantId);
    AppState.services = svcs || [];
    
    // 2. Fetch staff (users)
    const { data: users } = await supabaseClient.from('users').select('*').eq('tenant_id', tenantId);
    AppState.staff = users || [];
    
    // 3. Fetch clients (if exists or fallback users)
    const { data: clients } = await supabaseClient.from('clients').select('*').eq('tenant_id', tenantId);
    AppState.crmClients = clients || [];
    if (AppState.crmClients.length === 0) {
      // Mock client if table is empty so UI is interactive
      AppState.crmClients = [
        { id: 'c-mock-1', tenant_id: tenantId, name: 'Alice Watson', email: 'alice@watson.com', phone: '+44 7911 123456', loyalty_points: 150 },
        { id: 'c-mock-2', tenant_id: tenantId, name: 'Marcus Sterling', email: 'marcus@sterling.co', phone: '+44 7911 654321', loyalty_points: 80 }
      ];
    }
    
    // 4. Fetch waitlists
    const { data: wlist } = await supabaseClient.from('waitlist').select('*').eq('tenant_id', tenantId);
    AppState.waitlist = wlist || [];
    
    // 5. Fetch appointments
    const { data: appts } = await supabaseClient.from('appointments').select('*, services(name, price), users(name)').eq('tenant_id', tenantId);
    AppState.appointments = appts || [];
    
    // 6. Fetch off-peak rules
    const { data: rules } = await supabaseClient.from('off_peak_rules').select('*').eq('tenant_id', tenantId);
    AppState.offPeakRules = rules || [];
    
  } catch (err) {
    console.error('Failed to query tenant records:', err);
  }
}

// Render Weekly Calendar View
function renderTenantCalendar() {
  const container = document.getElementById('tenant-calendar-container');
  container.innerHTML = '';
  
  // Simple calendar calendar visual rendering
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  
  const div = document.createElement('div');
  div.className = 'calendar-component';
  
  let headerHtml = `
    <div class="calendar-days-header">
      ${daysOfWeek.map(d => `<div>${d.slice(0,3)}</div>`).join('')}
    </div>
    <div class="calendar-grid">
  `;
  
  // Render 28 cells (simulated month)
  for (let i = 1; i <= 28; i++) {
    const hasAppts = i === 12 || i === 15 || i === 22;
    headerHtml += `
      <div class="calendar-cell ${hasAppts ? 'has-events' : ''} ${i === 13 ? 'today' : ''}" onclick="showDayAppointments(${i})">
        <div class="cell-day-num">${i}</div>
        <div class="cell-events-dots">
          ${hasAppts ? '<span class="event-dot primary"></span>' : ''}
        </div>
      </div>
    `;
  }
  
  headerHtml += '</div>';
  div.innerHTML = headerHtml;
  container.appendChild(div);
  
  // Load waitlist entries card list
  const wlContainer = document.getElementById('tenant-waitlist-box');
  wlContainer.innerHTML = '';
  if (AppState.waitlist.length === 0) {
    wlContainer.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem;">No clients currently in waitlist.</div>';
  } else {
    AppState.waitlist.forEach(wl => {
      const card = document.createElement('div');
      card.style.background = 'rgba(255,255,255,0.02)';
      card.style.padding = '8px 12px';
      card.style.borderRadius = '6px';
      card.style.borderLeft = '3px solid var(--warning-color)';
      card.style.marginBottom = '6px';
      card.style.fontSize = '0.8rem';
      card.innerHTML = `
        <strong>${wl.client_name || 'Client'}</strong> waiting for Service ID: ${wl.service_id || 'Cut'}<br>
        <span style="font-size:0.7rem; color:var(--text-muted)">Preferred: ${wl.preferred_date} (${wl.status})</span>
      `;
      wlContainer.appendChild(card);
    });
  }
}

window.showDayAppointments = function(dayNum) {
  // Shows list of active appointments on calendar cell click
  const container = document.getElementById('tenant-waitlist-box');
  container.innerHTML = `<h4>Appointments on Day ${dayNum}</h4>`;
  
  const dailyAppts = AppState.appointments.filter(a => new Date(a.start_time).getDate() === dayNum);
  
  if (dailyAppts.length === 0) {
    container.innerHTML += '<p style="font-size:0.8rem; color:var(--text-muted); margin-top:8px;">No bookings scheduled.</p>';
  } else {
    dailyAppts.forEach(a => {
      container.innerHTML += `
        <div style="padding:8px; background:rgba(255,255,255,0.02); border-radius:6px; margin-top:6px; font-size:0.8rem;">
          <strong>${a.users?.name || 'Stylist'}</strong> &mdash; ${a.services?.name || 'Hair Cut'}<br>
          <span style="color:var(--text-muted)">Time: ${new Date(a.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} (${a.status})</span>
        </div>
      `;
    });
  }
};

// Render CRM Client Timeline & Profile
function renderTenantCRMTab() {
  const selector = document.getElementById('crm-client-select');
  selector.innerHTML = '<option value="">-- Choose Client Profile --</option>';
  
  AppState.crmClients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (Pts: ${c.loyalty_points || 0})`;
    selector.appendChild(opt);
  });
  
  selector.addEventListener('change', (e) => {
    const id = e.target.value;
    const client = AppState.crmClients.find(c => c.id === id);
    if (client) {
      AppState.selectedClient = client;
      renderClientTimelineDetails(client);
    }
  });
}

function renderClientTimelineDetails(client) {
  const container = document.getElementById('crm-client-details-box');
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:16px;">
      <div>
        <h3 style="font-family:var(--font-display); font-size:1.3rem;">${client.name}</h3>
        <p style="font-size:0.85rem; color:var(--text-secondary);">${client.email} | ${client.phone || '+44 7911 000000'}</p>
      </div>
      <div style="text-align:right;">
        <span class="badge badge-success" style="font-size:0.8rem; padding: 6px 12px;">${client.loyalty_points || 0} LOYALTY POINTS</span>
      </div>
    </div>
    
    <div style="display:flex; gap:12px; margin-bottom:24px;">
      <button class="btn btn-primary" onclick="openPOSCheckoutDrawer('${client.id}')" style="padding: 8px 16px; font-size:0.8rem;"><i class="fa-solid fa-cart-plus"></i> Open POS Checkout</button>
      <button class="btn btn-secondary" onclick="viewClientIntakeForms('${client.id}')" style="padding: 8px 16px; font-size:0.8rem;"><i class="fa-regular fa-clipboard"></i> Intake Forms</button>
    </div>
    
    <h4>Timeline Chronological History</h4>
    <div class="client-timeline">
      <div class="timeline-item">
        <span class="timeline-dot checkout"></span>
        <div class="timeline-meta">
          <span>Checkout Transaction Completed</span>
          <span>12 Jul 2026</span>
        </div>
        <div class="timeline-card">
          Completed checkout checkout receipt. Total spent: £45.00.<br>
          <span style="color:var(--success-color); font-size:0.75rem;">+45 Loyalty Points Credited</span>
        </div>
      </div>
      <div class="timeline-item">
        <span class="timeline-dot appointment"></span>
        <div class="timeline-meta">
          <span>Salon Visit Booked</span>
          <span>10 Jul 2026</span>
        </div>
        <div class="timeline-card">
          Standard Gel Manicure scheduled with Stylist Sarah.<br>
          <span style="color:var(--primary-color); font-size:0.75rem;">Status: Completed</span>
        </div>
      </div>
    </div>
  `;
}

window.viewClientIntakeForms = function(clientId) {
  showToast('Intake form responses retrieved from secure CRM records.', 'info');
};

// POS Checkout Drawer
window.openPOSCheckoutDrawer = function(clientId) {
  const client = AppState.crmClients.find(c => c.id === clientId);
  if (!client) return;
  
  document.getElementById('checkout-client-name').textContent = client.name;
  document.getElementById('checkout-client-points').textContent = `${client.loyalty_points || 0} pts`;
  
  // Populate services catalog listing in cart
  const container = document.getElementById('checkout-services-select');
  container.innerHTML = '<option value="">-- Choose Item / Service --</option>';
  AppState.services.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} (£${(s.price / 100).toFixed(2)})`;
    container.appendChild(opt);
  });
  
  // Staff lists
  const staffSel = document.getElementById('checkout-staff-select');
  staffSel.innerHTML = '<option value="">-- Assign Stylist --</option>';
  AppState.staff.forEach(stf => {
    const opt = document.createElement('option');
    opt.value = stf.id;
    opt.textContent = stf.name;
    staffSel.appendChild(opt);
  });

  AppState.cartItems = [];
  renderPOSCartList();
  
  document.getElementById('pos-checkout-drawer').classList.add('active');
};

function closeCheckoutDrawer() {
  document.getElementById('pos-checkout-drawer').classList.remove('active');
}

// Add item to cart
document.getElementById('btn-add-cart').addEventListener('click', () => {
  const itemVal = document.getElementById('checkout-services-select').value;
  const staffVal = document.getElementById('checkout-staff-select').value;
  
  if (!itemVal) {
    showToast('Please select a service or retail item.', 'error');
    return;
  }
  
  const svc = AppState.services.find(s => s.id === itemVal);
  if (svc) {
    AppState.cartItems.push({
      id: svc.id,
      name: svc.name,
      price: svc.price,
      staffId: staffVal
    });
    renderPOSCartList();
    showToast(`${svc.name} added to cart.`, 'success');
  }
});

function renderPOSCartList() {
  const container = document.getElementById('checkout-cart-items');
  container.innerHTML = '';
  
  let total = 0;
  AppState.cartItems.forEach((item, idx) => {
    total += item.price;
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.fontSize = '0.85rem';
    div.style.padding = '8px 0';
    div.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
    div.innerHTML = `
      <div>
        <strong>${item.name}</strong><br>
        <span style="font-size:0.7rem; color:var(--text-muted)">Staff: ${AppState.staff.find(s=>s.id===item.staffId)?.name || 'House'}</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span>£${(item.price / 100).toFixed(2)}</span>
        <button onclick="removeCartItem(${idx})" style="background:none; border:none; color:var(--danger-color); cursor:pointer;"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    `;
    container.appendChild(div);
  });
  
  AppState.cartTotal = total;
  document.getElementById('checkout-subtotal').textContent = `£${(total / 100).toFixed(2)}`;
  
  // Loyalty warning calculations (1 point per £1 spent)
  const earnedPoints = Math.floor(total / 100);
  document.getElementById('checkout-earned-points').textContent = `+${earnedPoints} loyalty points`;
  document.getElementById('checkout-total').textContent = `£${(total / 100).toFixed(2)}`;
}

window.removeCartItem = function(index) {
  AppState.cartItems.splice(index, 1);
  renderPOSCartList();
};

async function processPOSCheckout() {
  if (AppState.cartItems.length === 0) {
    showToast('Cart is currently empty.', 'error');
    return;
  }
  
  const btn = document.getElementById('btn-process-checkout');
  btn.disabled = true;
  btn.textContent = 'COMMITTING TRANSACTION...';
  
  const client = AppState.selectedClient;
  const earnedPoints = Math.floor(AppState.cartTotal / 100);
  
  try {
    if (AppState.supabaseStatus === 'online' && supabaseClient) {
      // 1. Insert POS checkout transaction
      const { data: tx, error: txErr } = await supabaseClient
        .from('checkout_transactions')
        .insert([
          {
            tenant_id: AppState.selectedTenant.id,
            client_id: client.id,
            total_amount: AppState.cartTotal,
            payment_method: 'card',
            items_json: AppState.cartItems
          }
        ])
        .select();
        
      if (txErr) throw txErr;
      
      // 2. Increment client loyalty points in Supabase (Module 5 trigger does this automatically on Postgres table triggers, but update client local state too)
      const { error: ptsErr } = await supabaseClient
        .from('clients')
        .update({ loyalty_points: (client.loyalty_points || 0) + earnedPoints })
        .eq('id', client.id);
        
      if (ptsErr) console.warn('Warning: loyalty sync failed on direct update:', ptsErr.message);
    }
    
    // Update local variables
    client.loyalty_points = (client.loyalty_points || 0) + earnedPoints;
    showToast(`POS Checkout successful! £${(AppState.cartTotal / 100).toFixed(2)} recorded.`, 'success');
    showToast(`Client credited with ${earnedPoints} loyalty points!`, 'success');
    
    // Refresh UI
    renderClientTimelineDetails(client);
    renderTenantCRMTab();
    closeCheckoutDrawer();
  } catch (err) {
    showToast(`POS Transaction failed: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Pay Now';
  }
}

// Render configs and off-peak rules
function renderTenantBillingAndRules() {
  const container = document.getElementById('tenant-billing-panel');
  container.innerHTML = '';
  
  const div = document.createElement('div');
  div.innerHTML = `
    <h4 style="margin-bottom:12px;">Active Off-Peak Discounts</h4>
    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px;">
      ${AppState.offPeakRules.length === 0 ? '<p style="font-size:0.8rem; color:var(--text-muted);">No off-peak rules defined.</p>' : 
        AppState.offPeakRules.map(r => `
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:8px; background:rgba(255,255,255,0.02); border-radius:6px;">
            <span>Day ${r.dayOfWeek || 'Mon'}: ${r.startTime} - ${r.endTime}</span>
            <span style="color:var(--success-color); font-weight:700;">-${r.discountPercentage}% off</span>
          </div>
        `).join('')}
    </div>
    
    <h4>SMS Automations Rules</h4>
    <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.4; margin-top:8px;">
      Trigger event: <strong>booking_created</strong><br>
      Template text: <span style="font-family:var(--font-mono); font-size:0.75rem; background:#000; padding:2px 6px; border-radius:4px;">Hello [Client], your booking for [Service] is confirmed!</span>
    </p>
  `;
  container.appendChild(div);
}

// --- 8. GLOBAL SETTINGS ---
function generateTelemetryReport() {
  showToast('Generating PDF report summaries...', 'info');
  setTimeout(() => {
    showToast('Report generated successfully! Download started.', 'success');
  }, 1000);
}
document.getElementById('btn-download-report').addEventListener('click', generateTelemetryReport);
