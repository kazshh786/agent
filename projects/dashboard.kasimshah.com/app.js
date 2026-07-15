/**
 * KS Agency Unified Dashboard - Controller Script (Production Foundation)
 *
 * Handles:
 * - Supabase authentication (login, register, logout, password reset)
 * - Multi-tenant workspace management (creation, switching, validation)
 * - View routing and module rendering
 * - Safe DOM manipulation (no innerHTML with user data)
 * - Website Engine proxy via server-side API
 * - POS checkout, CRM timeline, social campaign UI
 */

// --- 1. CONFIGURATION & STATE ---
// Configuration is loaded from the global KS_CONFIG object injected by index.html
// which reads from meta tags or Vercel environment injection.
const AppConfig = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  appUrl: window.location.origin
};

const AppState = {
  // Auth
  user: null,
  session: null,
  authLoading: true,

  // Platform identity (derived from API, never from localStorage)
  platformRole: null,           // null | 'platform_owner' | 'platform_admin' | 'platform_support'
  currentMode: null,            // 'agency' | 'customer' | 'unassigned' | null
  permittedModes: [],           // ['agency'] | ['customer'] | ['agency', 'customer'] | []
  workspaceMemberships: [],     // from /api/me

  // Workspace (customer mode)
  activeView: 'overview',
  currentWorkspace: null,
  workspaces: [],

  // Agency mode
  agencyWorkspaces: [],         // all customer workspaces (from platform API)

  // Website Engine
  apiStatus: 'checking',
  supabaseStatus: 'checking',
  webProjects: [],

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

// --- 2. SAFE DOM HELPERS ---
// These replace innerHTML interpolation with safe DOM creation.

function createEl(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([key, val]) => {
      if (key === 'className') el.className = val;
      else if (key === 'textContent') el.textContent = val;
      else if (key === 'style' && typeof val === 'object') {
        Object.assign(el.style, val);
      } else if (key.startsWith('on') && typeof val === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), val);
      } else {
        // Strict URL validation
        if (key.toLowerCase() === 'href' || key.toLowerCase() === 'src') {
          try {
            const url = new URL(val, window.location.origin);
            const protocol = url.protocol.toLowerCase();
            
            if (key.toLowerCase() === 'href') {
              if (!['https:', 'http:', 'mailto:', 'tel:'].includes(protocol)) {
                console.warn(`Unsafe URL blocked for href: ${val}`);
                return; // Skip setting this attribute
              }
            } else if (key.toLowerCase() === 'src') {
              if (!['https:', 'data:'].includes(protocol) && url.origin !== window.location.origin) {
                console.warn(`Unsafe URL blocked for src: ${val}`);
                return;
              }
              // For data:, we only allow images
              if (protocol === 'data:' && !val.startsWith('data:image/')) {
                console.warn(`Unsafe data URI blocked for src: ${val}`);
                return;
              }
            }
          } catch (e) {
            // Invalid URL
            if (val.startsWith('#') || val.startsWith('/')) {
              // Same-origin relative URLs are handled well by new URL(val, origin)
              // so if it throws, it's malformed. 
              // Wait, new URL('/foo', 'http://a.com') works. 
              // If it threw, it's definitely malformed.
            }
            console.warn(`Malformed URL blocked for ${key}: ${val}`);
            return;
          }
        }
        el.setAttribute(key, val);
      }
    });
  }
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach(child => {
      if (typeof child === 'string') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    });
  }
  return el;
}

function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function escapeForAttribute(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- 3. SUPABASE AUTH ---

function initSupabase() {
  if (!AppConfig.supabaseUrl || !AppConfig.supabaseAnonKey) {
    console.warn('Supabase configuration missing. Auth will be unavailable.');
    AppState.authLoading = false;
    AppState.supabaseStatus = 'offline';
    showAuthScreen();
    updateStatusBar();
    return;
  }

  if (typeof supabase !== 'undefined') {
    try {
      supabaseClient = supabase.createClient(AppConfig.supabaseUrl, AppConfig.supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      });
      AppState.supabaseStatus = 'online';
      updateStatusBar();

      // Listen for auth state changes
      supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          AppState.session = session;
          AppState.user = session?.user || null;
          AppState.authLoading = false;
          onAuthenticated();
        } else if (event === 'SIGNED_OUT') {
          AppState.session = null;
          AppState.user = null;
          showAuthScreen();
        } else if (event === 'PASSWORD_RECOVERY') {
          showResetPasswordForm();
        }
      });

      // Check existing session
      checkExistingSession();
    } catch (err) {
      console.error('Supabase init failed:', err);
      AppState.supabaseStatus = 'offline';
      AppState.authLoading = false;
      showAuthScreen();
      updateStatusBar();
    }
  } else {
    console.warn('Supabase client SDK not loaded from CDN.');
    AppState.supabaseStatus = 'offline';
    AppState.authLoading = false;
    showAuthScreen();
    updateStatusBar();
  }
}

async function checkExistingSession() {
  try {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    if (session) {
      AppState.session = session;
      AppState.user = session.user;
      AppState.authLoading = false;
      const inviteToken = sessionStorage.getItem('agency_os_invite');
      if (inviteToken) {
        checkInvitationState(inviteToken);
      } else {
        onAuthenticated();
      }
    } else {
      AppState.authLoading = false;
      const inviteToken = sessionStorage.getItem('agency_os_invite');
      if (inviteToken) {
        checkInvitationState(inviteToken);
      } else {
        showAuthScreen();
      }
    }
  } catch (err) {
    console.error('Session check failed:', err);
    AppState.authLoading = false;
    showAuthScreen();
  }
}

async function handleLogin(email, password) {
  const errorEl = document.getElementById('auth-error');
  clearEl(errorEl);
  errorEl.style.display = 'none';

  if (!email || !password) {
    showAuthError('Please enter both email and password.');
    return;
  }

  setAuthLoading(true);

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data.user && !data.user.email_confirmed_at) {
      showAuthError('Please check your email to verify your account before logging in.');
      setAuthLoading(false);
      return;
    }
    // Auth state change listener will handle the rest
  } catch (err) {
    showAuthError(getFriendlyAuthError(err));
    setAuthLoading(false);
  }
}

async function handleRegister(email, password, fullName) {
  const errorEl = document.getElementById('auth-error');
  clearEl(errorEl);
  errorEl.style.display = 'none';

  if (!email || !password) {
    showAuthError('Please enter both email and password.');
    return;
  }
  if (password.length < 8) {
    showAuthError('Password must be at least 8 characters.');
    return;
  }

  setAuthLoading(true);

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || '' },
        emailRedirectTo: `${AppConfig.appUrl}/auth/callback`
      }
    });
    if (error) throw error;

    if (data.user && !data.user.email_confirmed_at) {
      showAuthSuccess('Account created! Please check your email to verify your account.');
    }
    setAuthLoading(false);
  } catch (err) {
    showAuthError(getFriendlyAuthError(err));
    setAuthLoading(false);
  }
}

async function handleForgotPassword(email) {
  if (!email) {
    showAuthError('Please enter your email address.');
    return;
  }

  setAuthLoading(true);

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${AppConfig.appUrl}/reset-password`
    });
    if (error) throw error;
    showAuthSuccess('Password reset email sent. Please check your inbox.');
    setAuthLoading(false);
  } catch (err) {
    showAuthError(getFriendlyAuthError(err));
    setAuthLoading(false);
  }
}

async function handlePasswordReset(newPassword) {
  if (!newPassword || newPassword.length < 8) {
    showAuthError('Password must be at least 8 characters.');
    return;
  }

  setAuthLoading(true);

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;
    showAuthSuccess('Password updated successfully! You can now log in.');
    setTimeout(() => showLoginForm(), 2000);
    setAuthLoading(false);
  } catch (err) {
    showAuthError(getFriendlyAuthError(err));
    setAuthLoading(false);
  }
}

async function handleLogout() {
  try {
    await supabaseClient.auth.signOut();
  } catch (err) {
    console.error('Logout error:', err);
  }
  AppState.user = null;
  AppState.session = null;
  AppState.currentWorkspace = null;
  AppState.workspaces = [];
  localStorage.removeItem('ks_selected_workspace');
  showAuthScreen();
}

function getFriendlyAuthError(err) {
  const msg = err.message || '';
  if (msg.includes('Invalid login')) return 'Invalid email or password. Please try again.';
  if (msg.includes('Email not confirmed')) return 'Please verify your email before logging in.';
  if (msg.includes('already registered')) return 'An account with this email already exists.';
  if (msg.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.';
  if (msg.includes('network')) return 'Network error. Please check your connection.';
  return msg || 'An unexpected error occurred. Please try again.';
}

// --- 4. AUTH UI MANAGEMENT ---
// --- INVITATION AND UNASSIGNED LOGIC ---

async function checkInvitationState(token) {
  document.getElementById('invitation-overlay').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('loading-overlay').style.display = 'none';
  
  const msgEl = document.getElementById('invitation-message');
  const authActions = document.getElementById('invitation-auth-actions');
  const acceptActions = document.getElementById('invitation-accept-actions');
  const errorActions = document.getElementById('invitation-error-actions');

  try {
    const res = await fetch('/api/invitations/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    
    if (!res.ok) {
      msgEl.textContent = 'This invitation is invalid or has expired.';
      errorActions.style.display = 'flex';
      return;
    }

    if (data.validityCategory === 'valid') {
      msgEl.textContent = `You have been invited to join ${data.workspaceName} as a ${data.role}.`;
      if (AppState.user) {
        acceptActions.style.display = 'flex';
        authActions.style.display = 'none';
      } else {
        acceptActions.style.display = 'none';
        authActions.style.display = 'flex';
      }
    } else {
      msgEl.textContent = `This invitation is ${data.validityCategory}.`;
      errorActions.style.display = 'flex';
    }
  } catch (err) {
    msgEl.textContent = 'An error occurred while checking the invitation.';
    errorActions.style.display = 'flex';
  }
}

function bindInvitationForms() {
  document.getElementById('btn-invitation-login')?.addEventListener('click', () => {
    document.getElementById('invitation-overlay').style.display = 'none';
    showAuthScreen();
  });
  
  document.getElementById('btn-invitation-register')?.addEventListener('click', () => {
    document.getElementById('invitation-overlay').style.display = 'none';
    showAuthScreen();
    document.getElementById('show-register').click();
  });
  
  document.getElementById('btn-invitation-accept')?.addEventListener('click', async () => {
    const token = sessionStorage.getItem('agency_os_invite');
    if (!token) return;
    
    const btn = document.getElementById('btn-invitation-accept');
    btn.disabled = true;
    btn.textContent = 'Accepting...';
    
    try {
      const res = await apiRequest('/invitations/accept', 'POST', { token });
      sessionStorage.removeItem('agency_os_invite');
      showToast('Invitation accepted successfully!', 'success');
      
      // Reload identity to reflect new workspace
      const meData = await apiRequest('/me');
      AppState.permittedModes = meData.permittedModes || [];
      AppState.workspaceMemberships = meData.workspaces || [];
      AppState.workspaces = meData.workspaces || [];
      
      if (AppState.permittedModes.includes('customer')) {
        AppState.currentMode = 'customer';
        showDashboard();
        setupNavigation();
        applyModeRouting();
        await enterCustomerMode();
      } else {
        // Fallback if they still have no workspaces? Unlikely if accept succeeded.
        window.location.reload();
      }
    } catch (err) {
      showToast(err.message || 'Failed to accept invitation', 'error');
      btn.disabled = false;
      btn.textContent = 'Accept Invitation';
    }
  });

  document.getElementById('btn-invitation-home')?.addEventListener('click', () => {
    sessionStorage.removeItem('agency_os_invite');
    window.location.reload();
  });

  document.getElementById('btn-unassigned-logout')?.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
  });
}

function showUnassignedScreen() {
  document.getElementById('unassigned-overlay').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
  document.getElementById('loading-overlay').style.display = 'none';
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('invitation-overlay').style.display = 'none';
}

// --- /INVITATION AND UNASSIGNED LOGIC ---

function showAuthScreen() {
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
  document.getElementById('loading-overlay').style.display = 'none';
  showLoginForm();
}

function showDashboard() {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('app-container').style.display = 'flex';
  document.getElementById('loading-overlay').style.display = 'none';
}

function showLoginForm() {
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('forgot-form').style.display = 'none';
  document.getElementById('reset-form').style.display = 'none';
  clearAuthMessages();
}

function showRegisterForm() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
  document.getElementById('forgot-form').style.display = 'none';
  document.getElementById('reset-form').style.display = 'none';
  clearAuthMessages();
}

function showForgotPasswordForm() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('forgot-form').style.display = 'block';
  document.getElementById('reset-form').style.display = 'none';
  clearAuthMessages();
}

function showResetPasswordForm() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('forgot-form').style.display = 'none';
  document.getElementById('reset-form').style.display = 'block';
  clearAuthMessages();
}

function clearAuthMessages() {
  const errorEl = document.getElementById('auth-error');
  const successEl = document.getElementById('auth-success');
  clearEl(errorEl);
  clearEl(successEl);
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
}

function showAuthError(message) {
  const el = document.getElementById('auth-error');
  el.textContent = message;
  el.style.display = 'block';
  const successEl = document.getElementById('auth-success');
  successEl.style.display = 'none';
}

function showAuthSuccess(message) {
  const el = document.getElementById('auth-success');
  el.textContent = message;
  el.style.display = 'block';
  const errorEl = document.getElementById('auth-error');
  errorEl.style.display = 'none';
}

function setAuthLoading(loading) {
  const btns = document.querySelectorAll('.auth-form .btn-primary');
  btns.forEach(btn => {
    btn.disabled = loading;
    if (loading) {
      btn.dataset.originalText = btn.textContent;
      btn.textContent = 'Loading...';
    } else if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
    }
  });
}

// --- 5. WORKSPACE MANAGEMENT ---

async function onAuthenticated() {
  updateUserDisplay();
  checkApiHealth();

  // Determine platform identity from API (never from localStorage)
  try {
    const meData = await apiRequest('/me');
    AppState.platformRole = meData.platformRole || null;
    AppState.permittedModes = meData.permittedModes || [];
    AppState.workspaceMemberships = meData.workspaces || [];
    AppState.workspaces = meData.workspaces || [];
  } catch (err) {
    console.error('Failed to load identity:', err);
    AppState.platformRole = null;
    AppState.permittedModes = [];
    AppState.workspaces = [];
  }

  // Determine current mode from API identity
  if (AppState.permittedModes.length === 0 && !AppState.platformRole) {
    showUnassignedScreen();
    return;
  }

  showDashboard();
  setupNavigation();
  
  if (!window.location.hash || window.location.hash === '#' || window.location.hash === '#/') {
    if (AppState.permittedModes.includes('agency')) {
      window.location.hash = '#/agency/overview';
    } else {
      const firstId = AppState.workspaces[0]?.id || '';
      if (firstId) window.location.hash = `#/workspace/${firstId}/overview`;
      else showUnassignedScreen();
    }
  } else {
    handleHashChange();
  }
}

function updateUserDisplay() {
  const nameEl = document.getElementById('user-display-name');
  const emailEl = document.getElementById('user-display-email');
  if (nameEl && AppState.user) {
    nameEl.textContent = AppState.user.user_metadata?.full_name || 'User';
  }
  if (emailEl && AppState.user) {
    emailEl.textContent = AppState.user.email || '';
  }
}

async function loadWorkspaces() {
  if (!supabaseClient || !AppState.user) return;

  try {
    const { data, error } = await supabaseClient
      .from('workspace_members')
      .select('workspace_id, role, workspaces(id, name, slug, owner_id)')
      .eq('user_id', AppState.user.id);

    if (error) throw error;

    AppState.workspaces = (data || []).map(row => ({
      ...row.workspaces,
      role: row.role
    }));

    renderWorkspaceSelector();
  } catch (err) {
    console.error('Failed to load workspaces:', err);
    showToast('Failed to load workspaces.', 'error');
  }
}

function renderWorkspaceSelector() {
  const selector = document.getElementById('workspace-selector');
  if (!selector) return;
  clearEl(selector);

  if (AppState.workspaces.length === 0) {
    selector.appendChild(createEl('option', { value: '', textContent: 'No workspaces' }));
    return;
  }

  AppState.workspaces.forEach(ws => {
    const opt = createEl('option', {
      value: ws.id,
      textContent: ws.name
    });
    if (AppState.currentWorkspace && ws.id === AppState.currentWorkspace.id) {
      opt.selected = true;
    }
    selector.appendChild(opt);
  });
}

async function selectWorkspace(workspace) {
  if (!workspace || !workspace.id) return;

  // Load the customer-safe workspace contract. This revalidates membership and
  // hydrates status/module entitlements before any customer view is rendered.
  try {
    const hydrated = await apiRequest(`/customer/workspaces/${encodeURIComponent(workspace.id)}`);
    workspace = { ...workspace, ...hydrated };
  } catch (err) {
    console.error('Workspace hydration failed:', err);
    showToast('You no longer have access to this workspace.', 'error');
    AppState.workspaces = AppState.workspaces.filter(w => w.id !== workspace.id);
    renderWorkspaceSelector();
    if (AppState.workspaces.length > 0) await selectWorkspace(AppState.workspaces[0]);
    else showUnassignedScreen();
    return;
  }

  AppState.currentWorkspace = workspace;
  localStorage.setItem('ks_selected_workspace', workspace.id);
  renderWorkspaceSelector();

  // Refresh all data for the selected workspace
  await loadWebProjects();
  await fetchSupabaseTenants();
  renderOverviewTelemetry();

  showToast(`Workspace: ${workspace.name}`, 'info');
}

async function handleWorkspaceSelectorChange(e) {
  const val = e.target.value;
  const currentView = AppState.activeView || 'overview';
  window.location.hash = `#/workspace/${val}/${currentView}`;
}

// --- UNASSIGNED SCREEN ---
function showUnassignedScreen() {
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('app-container').style.display = 'none';
  document.getElementById('loading-overlay').style.display = 'none';
  const overlay = document.getElementById('no-workspace-overlay');
  if (overlay) overlay.style.display = 'flex';
}

// --- MODE ROUTING ---
function applyModeRouting() {
  const agencyNav = document.getElementById('agency-nav-group');
  const customerNav = document.getElementById('customer-nav-group');
  const modeSwitcher = document.getElementById('mode-switcher');
  const wsSelector = document.getElementById('workspace-selector-container');
  const agencyButton = document.getElementById('mode-switch-agency');
  const customerButton = document.getElementById('mode-switch-customer');

  if (AppState.currentMode === 'agency') {
    if (agencyNav) agencyNav.style.display = 'flex';
    if (customerNav) customerNav.style.display = 'none';
    if (wsSelector) wsSelector.style.display = 'none';
  } else {
    if (agencyNav) agencyNav.style.display = 'none';
    if (customerNav) customerNav.style.display = 'flex';
    if (wsSelector) wsSelector.style.display = 'block';
  }
  agencyButton?.classList.toggle('active', AppState.currentMode === 'agency');
  customerButton?.classList.toggle('active', AppState.currentMode === 'customer');

  // Show mode switcher if user has both modes
  if (modeSwitcher && AppState.permittedModes.length > 1) {
    modeSwitcher.style.display = 'flex';
  } else if (modeSwitcher) {
    modeSwitcher.style.display = 'none';
  }
}

async function navigate(mode, viewId, workspaceId) {
  AppState.currentMode = mode;
  AppState.activeView = viewId;
  
  applyModeRouting();
  
  const wsSelector = document.getElementById('workspace-selector');
  if (wsSelector && workspaceId) {
    wsSelector.value = workspaceId;
  }
  
  if (mode === 'customer' && workspaceId) {
    if (!AppState.currentWorkspace || AppState.currentWorkspace.id !== workspaceId) {
      const ws = AppState.workspaces.find(w => w.id === workspaceId);
      if (ws) {
        await selectWorkspace(ws);
      }
    }
    
    if (AppState.currentWorkspace && AppState.currentWorkspace.status === 'suspended') {
      viewId = 'suspended';
    }
  } else if (mode === 'agency') {
    if (AppState.agencyWorkspaces.length === 0) {
      await loadAgencyWorkspaces();
    }
  }

  const views = document.querySelectorAll('.dashboard-view');
  views.forEach(v => v.classList.remove('active'));
  
  let target = document.getElementById(`view-${mode}-${viewId}`) || 
               document.getElementById(`view-workspace-${viewId}`) ||
               document.getElementById(`view-${viewId}`) || 
               document.getElementById(`view-${mode}`);
               
  if (!target) {
    if (viewId === 'website') target = document.getElementById('view-web');
    if (viewId === 'booking') target = document.getElementById('view-salon');
  }

  if (target) {
    target.classList.add('active');
    
    const formattedViewName = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    document.title = `${formattedViewName} | KS Agency`;
    
    window.KSRouter.applyViewAccessibility(document, target, mode, viewId);
  }

  const topbarMode = document.getElementById('topbar-mode');
  const topbarView = document.getElementById('topbar-view');
  if (topbarMode) topbarMode.textContent = mode === 'agency' ? 'Agency OS' : (AppState.currentWorkspace?.name || 'Customer workspace');
  if (topbarView) topbarView.textContent = viewId.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  document.querySelector('.sidebar')?.classList.remove('mobile-open');

  if (mode === 'agency' && viewId === 'overview') renderAgencyControlCentre();
  else if (mode === 'agency' && viewId === 'customers') renderAgencyControlCentre();
  else if (mode === 'agency' && viewId === 'websites') renderAgencyWebsites();
  else if (mode === 'agency' && viewId === 'analytics') renderAgencyAnalytics();
  else if (mode === 'agency' && viewId === 'launch-readiness') renderLaunchReadiness();
  else if (mode === 'agency' && viewId === 'integrations') renderAgencyIntegrations();
  else if (mode === 'agency' && viewId === 'jobs') renderAgencyJobs();
  else if (mode === 'customer') {
    if (viewId === 'overview') renderOverviewTelemetry();
    else if (viewId === 'website' || viewId === 'web') renderCustomerWebsite();
    else if (viewId === 'analytics') renderCustomerAnalytics();
    else if (viewId === 'automations') renderCustomerAutomations();
    else renderCustomerModuleState(viewId);
  }
}

function createWebsiteWorkspaceSelect(selectedId, onChange) {
  const select=createEl('select',{className:'form-control select-control'},workspaceOptions(selectedId));
  select.addEventListener('change',()=>onChange(select.value));return select;
}

async function renderAgencyWebsites() {
  if(AppState.agencyWorkspaces.length===0)await loadAgencyWorkspaces();
  const host=document.getElementById('agency-websites-content');if(!host)return;
  const workspaceId=host.dataset.workspaceId||AppState.agencyWorkspaces[0]?.id;
  clearEl(host);if(!workspaceId)return host.appendChild(createEl('p',{textContent:'No customer workspaces are available.'}));
  host.appendChild(createWebsiteWorkspaceSelect(workspaceId,id=>{host.dataset.workspaceId=id;renderAgencyWebsites();}));
  const content=createEl('div',{style:{marginTop:'16px'}});host.appendChild(content);
  await renderWebsiteManager(content,workspaceId,true);
}

async function renderCustomerWebsite(){
  const host=document.getElementById('customer-website-content');if(!host||!AppState.currentWorkspace)return;
  await renderWebsiteManager(host,AppState.currentWorkspace.id,false);
}

async function renderWebsiteManager(host,workspaceId,isAgency){
  clearEl(host);
  const loading=createEl('p',{textContent:'Loading website configuration…'});host.appendChild(loading);
  let data;
  try{data=await apiRequest(`/websites?workspaceId=${encodeURIComponent(workspaceId)}`);}catch(error){loading.textContent=error.message;return;}
  loading.remove();
  const canManage=isAgency||['owner','admin','editor'].includes(AppState.currentWorkspace?.role);
  const form=createEl('form',{className:'website-create-form'},[
    createEl('div',{className:'builder-intro'},[
      createEl('span',{className:'command-icon violet'},[createEl('i',{className:'fa-solid fa-wand-magic-sparkles'})]),
      createEl('div',{},[createEl('strong',{textContent:'Create a booking-first website'}),createEl('p',{textContent:'Every build includes the required /book conversion route and first-party analytics contract.'})])
    ]),
    websiteFormField('Website name',createEl('input',{className:'form-control',name:'name',placeholder:'Bare Beauty',required:true})),
    websiteFormField('Primary domain',createEl('input',{className:'form-control',name:'domain',placeholder:'barebeauty.co.uk',required:true})),
    websiteFormField('Design system',createEl('select',{className:'form-control select-control',name:'template'},[createEl('option',{value:'editorial-luxe',textContent:'Editorial Luxe'})])),
    websiteFormField('Booking payment',createEl('select',{className:'form-control select-control',name:'paymentMode'},[
      createEl('option',{value:'pay_later',textContent:'Pay later / in person'}),createEl('option',{value:'no_payment',textContent:'No payment'}),
      createEl('option',{value:'deposit',textContent:'Deposit required'}),createEl('option',{value:'full_payment',textContent:'Full payment'}),
      createEl('option',{value:'customer_choice',textContent:'Customer choice'})])),
    createEl('button',{className:'btn btn-primary',type:'submit'},[createEl('i',{className:'fa-solid fa-plus'}),'Create website'])
  ]);
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{
    await apiRequest('/websites',{method:'POST',body:JSON.stringify({workspaceId,name:form.elements.name.value.trim(),templateName:form.elements.template.value,primaryDomain:form.elements.domain.value.trim().toLowerCase(),paymentMode:form.elements.paymentMode.value})});
    showToast('Website created with the required /book conversion route.','success');await renderWebsiteManager(host,workspaceId,isAgency);
  }catch(error){showToast(error.message,'error');}finally{button.disabled=false;}});
  if(canManage)host.appendChild(form);
  if(!data.websites.length){host.appendChild(createEl('div',{className:'premium-empty-state'},[createEl('i',{className:'fa-regular fa-window-maximize'}),createEl('strong',{textContent:'No website created yet'}),createEl('p',{textContent:'Use the builder setup above to create the workspace’s booking-first website.'})]));return;}
  data.websites.forEach(site=>{
    const readiness=site.bookingReadiness;const card=createEl('div',{className:'site-project-card'},[
      createEl('div',{className:'site-preview-tile'},[createEl('i',{className:'fa-solid fa-globe'}),createEl('span',{textContent:'Website preview'})]),
      createEl('div',{className:'site-project-main'},[
      createEl('div',{className:'site-project-heading'},[
        createEl('div',{},[createEl('span',{className:'page-eyebrow',textContent:'Primary website'}),createEl('h3',{textContent:site.primary_domain}),createEl('p',{textContent:`Conversion route ${site.booking_path} · ${String(site.payment_mode || 'not configured').replaceAll('_',' ')}`})]),
        createEl('span',{className:`badge ${site.publishReady?'badge-success':'badge-warning'}`,textContent:site.publishReady?'Publish ready':site.status})]),
      createEl('div',{className:`site-readiness ${readiness.ready?'ready':''}`},[createEl('i',{className:`fa-solid ${readiness.ready?'fa-circle-check':'fa-circle-exclamation'}`}),createEl('span',{textContent:readiness.ready?'KS OS booking connection is ready.':`Publishing blocked: ${readiness.reasons.join(', ')}`})])
      ])
    ]);
    const actions=createEl('div',{className:'site-project-actions'});
    const compile=createEl('button',{className:'btn btn-secondary',textContent:'Compile website + booking page'});
    compile.addEventListener('click',async()=>{compile.disabled=true;try{await apiRequest('/website-engine/compile',{method:'POST',headers:{'X-Workspace-Id':workspaceId},body:JSON.stringify({siteId:site.id})});showToast('Website compiled with booking route and conversion tracking.','success');await renderWebsiteManager(host,workspaceId,isAgency);}catch(error){showToast(error.message,'error');}finally{compile.disabled=false;}});
    if(canManage)actions.appendChild(compile);
    if(site.live_url)actions.appendChild(createEl('a',{className:'btn btn-secondary',href:site.live_url,target:'_blank',rel:'noopener',textContent:'Preview'}));
    card.querySelector('.site-project-main').appendChild(actions);host.appendChild(card);
  });
}

function websiteFormField(label, control) {
  return createEl('label',{className:'form-group'},[createEl('span',{textContent:label}),control]);
}

async function renderCustomerAnalytics(){
  const host=document.getElementById('customer-analytics-content');if(!host||!AppState.currentWorkspace)return;clearEl(host);
  const today=new Date().toISOString().slice(0,10),from=new Date(Date.now()-29*86400000).toISOString().slice(0,10);const controls=createEl('form',{style:{display:'flex',gap:'10px',flexWrap:'wrap',marginBottom:'18px'}},[createEl('input',{className:'form-control',type:'date',name:'from',value:from,'aria-label':'From date'}),createEl('input',{className:'form-control',type:'date',name:'to',value:today,'aria-label':'To date'}),createEl('select',{className:'form-control select-control',name:'bookingType','aria-label':'Booking type'},[createEl('option',{value:'',textContent:'All booking types'}),createEl('option',{value:'shop',textContent:'Shop'}),createEl('option',{value:'mobile',textContent:'Mobile'})]),createEl('button',{className:'btn btn-primary',type:'submit',textContent:'Apply'})]);host.appendChild(controls);const content=createEl('div');host.appendChild(content);
  const load=async()=>{clearEl(content);content.appendChild(createEl('p',{textContent:'Loading trusted analytics…'}));try{const q=new URLSearchParams({workspaceId:AppState.currentWorkspace.id,from:controls.elements.from.value,to:controls.elements.to.value});if(controls.elements.bookingType.value)q.set('bookingType',controls.elements.bookingType.value);const data=await apiRequest(`/analytics/unified?${q}`);clearEl(content);const m=data.metrics;
    const currency=m.currency?`${m.currency} ${(m.verifiedRevenueMinor/100).toFixed(2)}`:m.verifiedRevenueMinor?'Multiple currencies':'No verified revenue';const values={sessions:m.sessions,ctaClicks:m.ctaClicks,bookingStarts:m.bookingStarts,confirmedBookings:m.confirmedBookings,bookingConversionRate:`${m.bookingConversionRate}%`,verifiedRevenueMinor:currency};const freshness=data.freshness.asOf?new Date(data.freshness.asOf).toLocaleString():'No source events yet';const grid=createEl('div',{className:'stats-grid'});Object.entries(values).forEach(([key,value])=>{const def=data.definitions[key],empty=key==='verifiedRevenueMinor'?m.verifiedRevenueMinor===0:key==='bookingConversionRate'?m.sessions===0:Number(m[key])===0;grid.appendChild(createEl('div',{className:'glass-card stat-card'},[createEl('span',{className:'stat-title',textContent:def.label}),createEl('span',{className:'stat-value',textContent:String(value)}),createEl('small',{textContent:def.definition,style:{color:'var(--text-secondary)',display:'block'}}),createEl('small',{textContent:`Source: ${def.source}`,style:{color:'var(--text-muted)',display:'block'}}),createEl('small',{textContent:`Freshness: ${freshness}`,style:{color:'var(--text-muted)',display:'block'}}),empty?createEl('small',{textContent:'No matching data in this date range.',style:{color:'var(--warning-color)',display:'block'}}):null].filter(Boolean)));});content.appendChild(grid);
    const summary=createEl('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:'16px',marginTop:'20px'}});const table=(title,rows)=>{const box=createEl('div',{className:'glass-card',style:{padding:'16px'}},[createEl('h3',{textContent:title})]);Object.entries(rows).forEach(([label,value])=>box.appendChild(createEl('div',{style:{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,.08)'}},[createEl('span',{textContent:label.replaceAll('_',' ')}),createEl('strong',{textContent:String(value)})])));return box;};summary.appendChild(table('Booking funnel',data.funnel));summary.appendChild(table('First-touch channels',data.firstTouch));summary.appendChild(table('Last-touch channels',data.lastTouch));summary.appendChild(table('Booking type',{'Shop bookings':m.shopBookings,'Mobile bookings':m.mobileBookings}));content.appendChild(summary);
    const campaigns=createEl('div',{className:'glass-card',style:{padding:'16px',marginTop:'18px'}},[createEl('h3',{textContent:'Campaign performance'})]);if(!data.campaigns.length)campaigns.appendChild(createEl('p',{textContent:'No campaign-attributed conversions exist in this range.'}));data.campaigns.forEach(row=>campaigns.appendChild(createEl('div',{style:{display:'flex',justifyContent:'space-between',gap:'10px',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.08)'}},[createEl('span',{textContent:`${row.campaign||'Unlabelled'} · ${row.channel} · ${row.source||'unknown'}`}),createEl('strong',{textContent:`${row.conversions} conversions`})])));content.appendChild(campaigns);const comparison=data.comparison;const comparisonText=comparison?`Previous ${comparison.range.from}–${comparison.range.to}: sessions ${comparison.sessionsPercent==null?'new':`${comparison.sessionsPercent}%`}, bookings ${comparison.confirmedBookingsPercent==null?'new':`${comparison.confirmedBookingsPercent}%`}, revenue ${comparison.verifiedRevenuePercent==null?'new':`${comparison.verifiedRevenuePercent}%`}.`:'';const status=createEl('div',{style:{marginTop:'18px'}},[createEl('p',{textContent:`Data freshness: ${data.freshness.asOf?new Date(data.freshness.asOf).toLocaleString():'No events recorded yet.'}`}),createEl('p',{textContent:comparisonText}),createEl('p',{textContent:'Email: Not connected · Social: Not connected · ROAS: unavailable until genuine spend data is connected.',style:{color:'var(--text-muted)'}})]);if(data.warnings.length)status.appendChild(createEl('p',{textContent:`Limited-data warnings: ${data.warnings.join(', ')}`,style:{color:'var(--warning-color)'}}));if(!m.sessions)status.appendChild(createEl('p',{textContent:'No attributable website sessions exist for this date range. Complete the launch test journey to populate this view.'}));content.appendChild(status);
  }catch(error){clearEl(content);content.appendChild(createEl('div',{role:'alert'},[createEl('h3',{textContent:'Analytics unavailable'}),createEl('p',{textContent:error.message})]));}};controls.addEventListener('submit',event=>{event.preventDefault();load();});await load();
}

async function renderAgencyAnalytics(){
  const host=document.getElementById('agency-analytics-content');if(!host)return;clearEl(host);host.appendChild(createEl('p',{textContent:'Loading privacy-safe workspace summaries…'}));try{const data=await apiRequest('/platform/analytics');clearEl(host);if(!data.workspaces.length)return host.appendChild(createEl('p',{textContent:'No workspaces are available.'}));data.workspaces.forEach(row=>host.appendChild(createEl('div',{className:'glass-card',style:{padding:'16px',marginBottom:'12px'}},[createEl('h3',{textContent:row.workspaceName}),createEl('p',{textContent:`Websites ${row.activeWebsites} · Confirmed bookings ${row.confirmedBookings} · Conversion ${row.bookingConversionRate}% · Verified revenue ${row.currency?`${row.currency} ${(row.verifiedRevenueMinor/100).toFixed(2)}`:'not available'} · Failed ingestion ${row.failedEventIngestion} · Failed automations ${row.failedAutomationRuns}`}),createEl('small',{textContent:`Analytics freshness: ${row.analyticsFreshness?new Date(row.analyticsFreshness).toLocaleString():'No data'} · Integration health: ${row.integrationHealth}`,style:{color:'var(--text-muted)'}})])));}catch(error){clearEl(host);host.appendChild(createEl('p',{textContent:error.message,role:'alert'}));}
}

async function renderLaunchReadiness(){
  if(AppState.agencyWorkspaces.length===0)await loadAgencyWorkspaces();const host=document.getElementById('agency-launch-readiness-content');if(!host)return;clearEl(host);const selected=host.dataset.workspaceId||AppState.agencyWorkspaces[0]?.id;if(!selected)return host.appendChild(createEl('p',{textContent:'No launch workspace is available.'}));const select=createWebsiteWorkspaceSelect(selected,id=>{host.dataset.workspaceId=id;renderLaunchReadiness();});host.appendChild(select);const output=createEl('div',{style:{marginTop:'18px'}},[createEl('p',{textContent:'Running explicit launch checks…'})]);host.appendChild(output);try{const data=await apiRequest(`/platform/launch-readiness?workspaceId=${encodeURIComponent(selected)}`);clearEl(output);output.appendChild(createEl('div',{className:'glass-card',style:{padding:'16px',marginBottom:'14px'}},[createEl('h2',{textContent:data.status}),createEl('p',{textContent:'This result is advisory. No deployment or publication has been triggered.'}),createEl('small',{textContent:`Checked ${new Date(data.checkedAt).toLocaleString()}`,style:{color:'var(--text-muted)'}})]));Object.entries(data.checks).forEach(([name,item])=>output.appendChild(createEl('div',{style:{padding:'12px 0',borderBottom:'1px solid rgba(255,255,255,.08)'}},[createEl('div',{style:{display:'flex',justifyContent:'space-between',gap:'12px'}},[createEl('strong',{textContent:name.replaceAll(/([A-Z])/g,' $1')}),createEl('span',{className:`badge ${item.state==='READY'?'badge-success':item.state==='DEGRADED'?'badge-warning':'badge-danger'}`,textContent:item.state})]),createEl('p',{textContent:item.explanation}),createEl('small',{textContent:`Last checked: ${new Date(item.lastCheckedAt).toLocaleString()}`,style:{color:'var(--text-muted)',display:'block'}}),item.remediation?createEl('small',{textContent:`Next: ${item.remediation}`,style:{color:'var(--text-muted)'}}):null].filter(Boolean))));}catch(error){clearEl(output);output.appendChild(createEl('p',{textContent:error.message,role:'alert'}));}
}

const INTEGRATION_PROVIDER_FIELDS = {
  ks_os: { label: 'KS OS Booking', secretLabel: 'Service token', placeholder: 'Available after KS OS service API is added' },
  website_engine: { label: 'Website Engine', secretLabel: 'API token' },
  resend: { label: 'Resend Email', secretLabel: 'API key' },
  meta: { label: 'Meta Social', secretLabel: 'Access token' },
};

function workspaceOptions(selectedId) {
  return AppState.agencyWorkspaces.map(ws => createEl('option', {
    value: ws.id, textContent: `${ws.name} (${ws.status})`, ...(ws.id === selectedId ? { selected: true } : {}),
  }));
}

async function renderAgencyIntegrations() {
  if (AppState.agencyWorkspaces.length === 0) await loadAgencyWorkspaces();
  const formHost = document.getElementById('agency-integration-form');
  const listHost = document.getElementById('agency-integration-list');
  if (!formHost || !listHost) return;
  clearEl(formHost);
  const selectedId = formHost.dataset.workspaceId || AppState.agencyWorkspaces[0]?.id || '';
  if (!selectedId) {
    clearEl(listHost); listHost.appendChild(createEl('p', { textContent: 'No customer workspaces are available.' })); return;
  }
  const workspaceSelect = createEl('select', { className: 'form-control select-control', name: 'workspaceId' }, workspaceOptions(selectedId));
  const providerSelect = createEl('select', { className: 'form-control select-control', name: 'provider' },
    Object.entries(INTEGRATION_PROVIDER_FIELDS).map(([value, def]) => createEl('option', { value, textContent: def.label })));
  const secretInput = createEl('input', { className: 'form-control', name: 'secret', type: 'password', autocomplete: 'new-password', placeholder: 'Provider credential' });
  const externalInput = createEl('input', { className: 'form-control', name: 'externalAccountId', placeholder: 'Tenant/account ID (optional)' });
  const form = createEl('form', { className: 'integration-connect-form' }, [
    createEl('h3', { textContent: 'Connect provider', style: { marginBottom: '12px' } }),
    workspaceSelect, providerSelect, externalInput, secretInput,
    createEl('button', { className: 'btn btn-primary', type: 'submit', textContent: 'Save securely and test' }),
    createEl('p', { textContent: 'Credentials are encrypted server-side and are never returned to the browser.', style: { color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '8px' } }),
  ]);
  workspaceSelect.addEventListener('change', () => { formHost.dataset.workspaceId = workspaceSelect.value; loadAgencyIntegrationList(workspaceSelect.value); });
  providerSelect.addEventListener('change', () => {
    const def = INTEGRATION_PROVIDER_FIELDS[providerSelect.value];
    secretInput.placeholder = def.placeholder || def.secretLabel;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const provider = providerSelect.value;
    const def = INTEGRATION_PROVIDER_FIELDS[provider];
    const credentialKey = provider === 'ks_os' ? 'serviceToken' : provider === 'website_engine' ? 'apiToken' : provider === 'resend' ? 'apiKey' : 'accessToken';
    if (!secretInput.value.trim()) return showToast(`${def.secretLabel} is required.`, 'error');
    try {
      await apiRequest('/integrations', { method: 'POST', body: JSON.stringify({
        workspaceId: workspaceSelect.value, provider, displayName: def.label,
        externalAccountId: externalInput.value.trim() || null, configuration: {},
        credentials: { [credentialKey]: secretInput.value.trim() },
      }) });
      secretInput.value = '';
      showToast('Integration saved and a connection test was queued.', 'success');
      await loadAgencyIntegrationList(workspaceSelect.value);
    } catch (error) { showToast(error.message, 'error'); }
  });
  formHost.appendChild(form);
  await loadAgencyIntegrationList(selectedId);
}

async function loadAgencyIntegrationList(workspaceId) {
  const host = document.getElementById('agency-integration-list');
  if (!host) return;
  clearEl(host); host.appendChild(createEl('p', { textContent: 'Loading integrations…' }));
  try {
    const data = await apiRequest(`/integrations?workspaceId=${encodeURIComponent(workspaceId)}`);
    clearEl(host);
    if (!data.connections.length) return host.appendChild(createEl('p', { textContent: 'No providers connected for this workspace.' }));
    data.connections.forEach(connection => host.appendChild(createEl('div', { className: 'integration-row', style: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.08)' } }, [
      createEl('div', {}, [createEl('strong', { textContent: connection.display_name || connection.provider }), createEl('div', { textContent: connection.external_account_id || 'No external account ID', style: { color: 'var(--text-muted)', fontSize: '.75rem' } })]),
      createEl('span', { className: `badge ${connection.status === 'connected' ? 'badge-success' : 'badge-primary'}`, textContent: connection.status }),
    ])));
  } catch (error) { clearEl(host); host.appendChild(createEl('p', { textContent: error.message, style: { color: 'var(--danger-color)' } })); }
}

async function renderAgencyJobs() {
  if (AppState.agencyWorkspaces.length === 0) await loadAgencyWorkspaces();
  const controls = document.getElementById('agency-jobs-controls');
  if (!controls) return;
  clearEl(controls);
  const selectedId = controls.dataset.workspaceId || AppState.agencyWorkspaces[0]?.id || '';
  if (!selectedId) return controls.appendChild(createEl('p', { textContent: 'No customer workspaces are available.' }));
  const select = createEl('select', { className: 'form-control select-control' }, workspaceOptions(selectedId));
  select.addEventListener('change', () => { controls.dataset.workspaceId = select.value; loadAgencyJobs(select.value); });
  controls.appendChild(select);
  await loadAgencyJobs(selectedId);
}

async function loadAgencyJobs(workspaceId) {
  const host = document.getElementById('agency-jobs-list');
  if (!host) return;
  clearEl(host); host.appendChild(createEl('p', { textContent: 'Loading jobs…' }));
  try {
    const data = await apiRequest(`/jobs?workspaceId=${encodeURIComponent(workspaceId)}`);
    clearEl(host);
    if (!data.jobs.length) return host.appendChild(createEl('p', { textContent: 'No integration jobs have been queued.' }));
    data.jobs.forEach(job => host.appendChild(createEl('div', { style: { display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '12px', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.08)', fontSize: '.85rem' } }, [
      createEl('span', { textContent: `${job.provider} · ${job.job_type}` }),
      createEl('span', { textContent: job.status }),
      createEl('span', { textContent: `${job.attempts}/${job.max_attempts} attempts` }),
      createEl('span', { textContent: job.last_error_code || '—', style: { color: job.last_error_code ? 'var(--warning-color)' : 'var(--text-muted)' } }),
    ])));
  } catch (error) { clearEl(host); host.appendChild(createEl('p', { textContent: error.message, style: { color: 'var(--danger-color)' } })); }
}

// --- AGENCY CONTROL CENTRE ---
async function loadAgencyWorkspaces() {
  try {
    const data = await apiRequest('/platform/workspaces');
    AppState.agencyWorkspaces = data.workspaces || [];
  } catch (err) {
    console.error('Failed to load agency workspaces:', err);
    AppState.agencyWorkspaces = [];
  }
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'active': return 'badge-success';
    case 'provisioning': return 'badge-primary';
    case 'suspended': return 'badge-warning';
    case 'archived': return 'badge-danger';
    case 'failed': return 'badge-danger';
    default: return 'badge-secondary';
  }
}

function getStatusLabel(status) {
  if (status === 'provisioning') return 'Awaiting customer invitation';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function renderAgencyControlCentre() {
  const container = document.getElementById('agency-workspace-list');
  
  let activeCount = 0;
  let provCount = 0;
  let suspCount = 0;
  let failCount = 0;
  
  AppState.agencyWorkspaces.forEach(ws => {
    if (ws.status === 'active') activeCount++;
    else if (ws.status === 'provisioning') provCount++;
    else if (ws.status === 'suspended') suspCount++;
    else if (ws.status === 'failed') failCount++;
  });
  
  const elActive = document.getElementById('agency-stat-active');
  const elProv = document.getElementById('agency-stat-provisioning');
  const elSusp = document.getElementById('agency-stat-suspended');
  const elFail = document.getElementById('agency-stat-failed');
  
  if (elActive) elActive.textContent = activeCount;
  if (elProv) elProv.textContent = provCount;
  if (elSusp) elSusp.textContent = suspCount;
  if (elFail) elFail.textContent = failCount;
  
  if (!container) return;
  clearEl(container);

  if (AppState.agencyWorkspaces.length === 0) {
    container.appendChild(createEl('div', {
      style: { textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }
    }, [
      createEl('i', { className: 'fa-solid fa-inbox', style: { fontSize: '2rem', marginBottom: '12px', display: 'block' } }),
      createEl('p', { textContent: 'No customer workspaces provisioned yet.' })
    ]));
    return;
  }

  AppState.agencyWorkspaces.forEach(ws => {
    const customerDisplay = (ws.customer_name && ws.customer_name.trim())
      ? ws.customer_name
      : 'Legacy workspace \u2014 customer details not configured';

    const modulesStr = (ws.modules || [])
      .filter(m => m.enabled)
      .map(m => m.module)
      .join(', ') || 'None';

    const provisionedStr = ws.provisioned_at
      ? new Date(ws.provisioned_at).toLocaleDateString()
      : 'Pre-platform';

    const card = createEl('div', { className: 'glass-card agency-ws-card', style: { marginBottom: '12px', padding: '16px' } }, [
      createEl('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } }, [
        createEl('div', {}, [
          createEl('strong', { textContent: ws.name, style: { fontSize: '1rem' } }),
          createEl('span', { textContent: ` (${ws.slug})`, style: { color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '6px' } })
        ]),
        createEl('span', { className: `badge ${getStatusBadgeClass(ws.status)}`, textContent: getStatusLabel(ws.status) })
      ]),
      createEl('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' } }, [
        createEl('div', {}, [
          createEl('span', { style: { color: 'var(--text-muted)' }, textContent: 'Customer: ' }),
          createEl('span', { textContent: customerDisplay })
        ]),
        createEl('div', {}, [
          createEl('span', { style: { color: 'var(--text-muted)' }, textContent: 'Provisioned: ' }),
          createEl('span', { textContent: provisionedStr })
        ]),
        createEl('div', {}, [
          createEl('span', { style: { color: 'var(--text-muted)' }, textContent: 'Modules: ' }),
          createEl('span', { textContent: modulesStr })
        ]),
        createEl('div', {}, [
          createEl('span', { style: { color: 'var(--text-muted)' }, textContent: 'Integrations: ' }),
          createEl('span', { textContent: 'Not configured', style: { color: 'var(--warning-color)' } })
        ])
      ]),
      createEl('div', { style: { display: 'flex', gap: '8px', marginTop: '12px' } },
        buildAgencyActions(ws)
      )
    ]);

    container.appendChild(card);
  });
}

function buildAgencyActions(ws) {
  const actions = [createEl('button', {
    className: 'btn btn-primary', style: { fontSize: '0.75rem', padding: '4px 12px' },
    textContent: 'Open setup',
    onClick: () => openAgencyWorkspaceSetup(ws)
  })];
  const isOwner = AppState.platformRole === 'platform_owner';
  const isAdmin = AppState.platformRole === 'platform_admin';

  if (ws.status === 'provisioning' && (isOwner || isAdmin)) {
    actions.push(createEl('button', {
      className: 'btn btn-secondary', style: { fontSize: '0.75rem', padding: '4px 12px' },
      textContent: 'Activate', disabled: true, title: 'Requires customer invitation (Prompt 2)',
    }));
  }
  if (ws.status === 'active' && (isOwner || isAdmin)) {
    actions.push(createEl('button', {
      className: 'btn btn-secondary', style: { fontSize: '0.75rem', padding: '4px 12px' },
      textContent: 'Suspend',
      onClick: () => handleWorkspaceAction(ws.id, 'suspend', ws.name)
    }));
  }
  if ((ws.status === 'active' || ws.status === 'suspended') && isOwner) {
    actions.push(createEl('button', {
      className: 'btn btn-secondary', style: { fontSize: '0.75rem', padding: '4px 12px', color: 'var(--danger-color)' },
      textContent: 'Archive',
      onClick: () => handleWorkspaceAction(ws.id, 'archive', ws.name)
    }));
  }
  if (ws.status === 'suspended' && (isOwner || isAdmin)) {
    actions.push(createEl('button', {
      className: 'btn btn-secondary', style: { fontSize: '0.75rem', padding: '4px 12px' },
      textContent: 'Reactivate',
      onClick: () => handleWorkspaceAction(ws.id, 'activate', ws.name)
    }));
  }
  if (ws.status === 'failed' && (isOwner || isAdmin)) {
    actions.push(createEl('button', {
      className: 'btn btn-secondary', style: { fontSize: '0.75rem', padding: '4px 12px' },
      textContent: 'Retry',
      onClick: () => handleWorkspaceAction(ws.id, 'retry', ws.name)
    }));
  }

  if (actions.length === 0) {
    actions.push(createEl('span', { textContent: 'Read-only', style: { fontSize: '0.75rem', color: 'var(--text-muted)' } }));
  }
  return actions;
}

function openAgencyWorkspaceSetup(workspace) {
  if (!workspace?.id) return;
  ['agency-websites-content', 'agency-integration-form', 'agency-integration-list',
    'agency-jobs-controls', 'agency-jobs-list', 'agency-launch-readiness-content']
    .forEach(id => {
      const element = document.getElementById(id);
      if (element) element.dataset.workspaceId = workspace.id;
    });
  window.location.hash = '#/agency/websites';
}

async function handleWorkspaceAction(wsId, action, wsName) {
  const confirmed = confirm(`Are you sure you want to ${action} workspace "${wsName}"?`);
  if (!confirmed) return;

  try {
    await apiRequest(`/platform/workspaces/${wsId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action })
    });
    showToast(`Workspace ${action} successful.`, 'success');
    await loadAgencyWorkspaces();
    renderAgencyControlCentre();
  } catch (err) {
    showToast(`Failed to ${action}: ${err.message}`, 'error');
  }
}

// --- AGENCY PROVISIONING (via platform API) ---
async function handleAgencyProvision(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('wiz-btn-next');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'PROVISIONING...';
  }

  const name = document.getElementById('wizName')?.value.trim();
  const slug = document.getElementById('wizSubdomain')?.value.trim().toLowerCase();
  const customerName = document.getElementById('wizCustomerName')?.value.trim();
  const customerEmail = document.getElementById('wizCustomerEmail')?.value.trim();

  // Gather selected modules
  const moduleCheckboxes = e.currentTarget.querySelectorAll('.module-checkbox:checked');
  const modules = Array.from(moduleCheckboxes).map(cb => cb.value);

  if (!name || !slug || !customerName || !customerEmail || modules.length === 0) {
    showToast('Please complete all required fields and select at least one module.', 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Provision Workspace'; }
    return;
  }

  try {
    const response = await apiRequest('/platform/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, slug, customer_name: customerName, customer_email: customerEmail, modules })
    });
    const provisioned = response.workspace;
    showToast(`${provisioned?.name || name} provisioned. Opening its website setup.`, 'success');
    e.currentTarget.reset();
    await loadAgencyWorkspaces();
    openAgencyWorkspaceSetup(provisioned || { id: AppState.agencyWorkspaces.find(ws => ws.slug === slug)?.id });
  } catch (err) {
    showToast(`Provisioning failed: ${err.message}`, 'error');
  }

  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Provision Workspace'; }
}

// --- 6. API HELPERS ---

function getApiHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (AppState.session?.access_token) {
    headers['Authorization'] = `Bearer ${AppState.session.access_token}`;
  }
  if (AppState.currentWorkspace?.id) {
    headers['X-Workspace-Id'] = AppState.currentWorkspace.id;
  }
  return headers;
}

async function apiRequest(path, options = {}) {
  const url = `/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...getApiHeaders(),
      ...(options.headers || {})
    }
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error?.message || `API error: ${res.status}`);
  }
  return body;
}

// --- 7. LIFECYCLE LOADERS ---

document.addEventListener('DOMContentLoaded', async () => {
  // Intercept invitation token immediately
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get('invite');
  if (inviteToken) {
    sessionStorage.setItem('agency_os_invite', inviteToken);
    urlParams.delete('invite');
    const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
    window.history.replaceState({}, '', newUrl);
  }

  // Show loading overlay
  document.getElementById('loading-overlay').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
  document.getElementById('auth-overlay').style.display = 'none';
  document.getElementById('invitation-overlay').style.display = 'none';
  document.getElementById('unassigned-overlay').style.display = 'none';

  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const config = await res.json();
      AppConfig.supabaseUrl = config.supabaseUrl;
      AppConfig.supabaseAnonKey = config.supabaseAnonKey;
    } else {
      console.error('Failed to load configuration from /api/config');
    }
  } catch (err) {
    console.error('Network error loading configuration:', err);
  }

  initSupabase();
  bindAuthForms();
  bindWorkspaceForms();
  bindInvitationForms();
});

function bindAuthForms() {
  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      handleLogin(email, password);
    });
  }

  // Register form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('register-email').value.trim();
      const password = document.getElementById('register-password').value;
      const name = document.getElementById('register-name').value.trim();
      handleRegister(email, password, name);
    });
  }

  // Forgot password form
  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value.trim();
      handleForgotPassword(email);
    });
  }

  // Reset password form
  const resetForm = document.getElementById('reset-form');
  if (resetForm) {
    resetForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const password = document.getElementById('reset-new-password').value;
      handlePasswordReset(password);
    });
  }

  // Navigation links between forms
  document.getElementById('show-register')?.addEventListener('click', (e) => { e.preventDefault(); showRegisterForm(); });
  document.getElementById('show-login')?.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });
  document.getElementById('show-forgot')?.addEventListener('click', (e) => { e.preventDefault(); showForgotPasswordForm(); });
  document.getElementById('show-login-from-forgot')?.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });
  document.getElementById('show-login-from-reset')?.addEventListener('click', (e) => { e.preventDefault(); showLoginForm(); });

  // Logout buttons
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('btn-unassigned-logout-view')?.addEventListener('click', handleLogout);
}

function bindWorkspaceForms() {
  // Workspace selector
  const selector = document.getElementById('workspace-selector');
  if (selector) selector.addEventListener('change', handleWorkspaceSelectorChange);

  // Wizard, checkout, report buttons
  document.getElementById('btn-unison-wizard')?.addEventListener('click', openUnisonWizard);
  document.getElementById('btn-close-wizard')?.addEventListener('click', closeUnisonWizard);
  document.getElementById('wizard-form')?.addEventListener('submit', handleAgencyProvision);
  document.getElementById('btn-close-checkout')?.addEventListener('click', closeCheckoutDrawer);
  document.getElementById('btn-process-checkout')?.addEventListener('click', processPOSCheckout);
  document.getElementById('btn-download-report')?.addEventListener('click', generateTelemetryReport);

  // Mode switcher
  document.getElementById('mode-switch-agency')?.addEventListener('click', () => {
    window.location.hash = '#/agency/overview';
  });
  document.getElementById('mode-switch-customer')?.addEventListener('click', () => {
    const firstId = AppState.workspaces[0]?.id || '';
    if (firstId) {
      window.location.hash = `#/workspace/${firstId}/overview`;
    } else {
      showUnassignedScreen();
    }
  });
  document.getElementById('mobile-nav-toggle')?.addEventListener('click', () => {
    document.querySelector('.sidebar')?.classList.toggle('mobile-open');
  });
  document.querySelector('[data-customer-shortcut="booking"]')?.addEventListener('click', event => {
    event.preventDefault();
    const wsId = AppState.currentWorkspace?.id || AppState.workspaces[0]?.id;
    if (wsId) window.location.hash = `#/workspace/${wsId}/booking`;
  });
}

// --- 8. STATUS BAR ---

function updateStatusBar() {
  const apiDot = document.getElementById('api-status-dot');
  const apiText = document.getElementById('api-status-text');
  const dbDot = document.getElementById('db-status-dot');
  const dbText = document.getElementById('db-status-text');

  if (apiDot && apiText) {
    if (AppState.apiStatus === 'online') {
      apiDot.className = 'status-dot online';
      apiText.textContent = 'ENGINE ONLINE';
    } else if (AppState.apiStatus === 'unavailable') {
      apiDot.className = 'status-dot offline';
      apiText.textContent = 'ENGINE UNAVAILABLE';
    } else {
      apiDot.className = 'status-dot offline';
      apiText.textContent = 'ENGINE OFFLINE';
    }
  }

  if (dbDot && dbText) {
    if (AppState.supabaseStatus === 'online') {
      dbDot.className = 'status-dot online';
      dbText.textContent = 'DATABASE CONNECTED';
    } else {
      dbDot.className = 'status-dot offline';
      dbText.textContent = 'DATABASE DISCONNECTED';
    }
  }
}

// Check health via server-side API
async function checkApiHealth() {
  try {
    const data = await apiRequest('/health');
    AppState.apiStatus = data.components?.websiteEngine === 'healthy' ? 'online' : 'unavailable';
    AppState.supabaseStatus = data.components?.database === 'healthy' ? 'online' : 'offline';
  } catch (err) {
    // Health endpoint may not be deployed yet, fall back to direct checks
    AppState.apiStatus = 'unavailable';
    console.warn('Health check failed:', err.message);
  }
  updateStatusBar();
}

// --- 9. DYNAMIC ROUTING & NAVIGATION ---

function setupNavigation() {
  document.querySelectorAll('#agency-nav-group [data-hash]').forEach(item => {
    item.querySelector('a')?.addEventListener('click', event => {
      event.preventDefault();
      window.location.hash = item.dataset.hash;
    });
  });
  document.querySelectorAll('#customer-nav-group [data-route]').forEach(item => {
    item.querySelector('a')?.addEventListener('click', event => {
      event.preventDefault();
      const wsId = AppState.currentWorkspace?.id || AppState.workspaces[0]?.id;
      if (wsId) window.location.hash = `#/workspace/${wsId}/${item.dataset.route}`;
    });
  });
  
  window.removeEventListener('hashchange', handleHashChange);
  window.addEventListener('hashchange', handleHashChange);
}

function handleHashChange() {
  if (!AppState.user) return;
  if (AppState.permittedModes.length === 0 && !AppState.platformRole) {
    showUnassignedScreen();
    return;
  }
  
  const route = window.KSRouter.resolveRoute(window.location.hash, {
    permittedModes: AppState.permittedModes,
    workspaces: AppState.workspaces,
    workspaceMemberships: AppState.workspaceMemberships
  });
  if (route.unassigned) return showUnassignedScreen();
  if (route.redirect) {
    if (window.location.hash !== route.redirect) window.location.hash = route.redirect;
    return;
  }
  navigate(route.mode, route.viewId, route.workspaceId);
}

// Toast helper - uses safe DOM creation
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const iconMap = { success: 'fa-circle-check', error: 'fa-triangle-exclamation', info: 'fa-circle-info' };

  const toast = createEl('div', { className: `toast ${type}` }, [
    createEl('i', { className: `fa-solid ${iconMap[type] || iconMap.info}` }),
    createEl('div', { textContent: message })
  ]);

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'all 0.5s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// --- 10. UNISON WIZARD ---

function openUnisonWizard() {
  document.getElementById('unison-wizard-overlay').classList.add('active');
  document.getElementById('wiz-step-1').classList.add('active');
  document.getElementById('wiz-step-2').classList.remove('active');
  document.getElementById('wiz-step-3').classList.remove('active');
  document.getElementById('wiz-btn-prev').style.display = 'none';
  document.getElementById('wiz-btn-next').textContent = 'Next: Service Settings';
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
    if (idx + 1 === stepNum) step.classList.add('active');
    else if (idx + 1 < stepNum) step.classList.add('completed');
  });
}

let wizardStep = 1;
function moveWizard(direction) {
  const currentPanel = document.getElementById(`wiz-step-${wizardStep}`);

  if (direction === 1) {
    if (wizardStep === 1) {
      const name = document.getElementById('wizName').value.trim();
      const sub = document.getElementById('wizSubdomain').value.trim();
      if (!name || !sub) {
        showToast('Please complete business identity fields.', 'error');
        return;
      }
    } else if (wizardStep === 2) {
      if (!document.getElementById('wizIndustry').value) {
        showToast('Please select an industry vertical.', 'error');
        return;
      }
    }
  }

  currentPanel.classList.remove('active');
  wizardStep += direction;
  document.getElementById(`wiz-step-${wizardStep}`).classList.add('active');

  const prevBtn = document.getElementById('wiz-btn-prev');
  const nextBtn = document.getElementById('wiz-btn-next');
  prevBtn.style.display = wizardStep === 1 ? 'none' : 'inline-flex';

  if (wizardStep === 3) {
    nextBtn.textContent = 'Compile & Provision Workspace';
    nextBtn.className = 'btn btn-accent';
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

// Wizard navigation buttons
document.addEventListener('DOMContentLoaded', () => {
  // Retain navigation only when the legacy multi-step wizard is present.
  if (document.getElementById('wiz-step-1')) {
    document.getElementById('wiz-btn-next')?.addEventListener('click', () => {
      if (wizardStep < 3) moveWizard(1);
    });
  }
  document.getElementById('wiz-btn-prev')?.addEventListener('click', () => {
    if (wizardStep > 1) moveWizard(-1);
  });
});

// Handle workspace provision via server-side API
async function handleWizardSubmit(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('wiz-btn-next');
  submitBtn.disabled = true;
  submitBtn.textContent = 'PROVISIONING...';

  const name = document.getElementById('wizName').value.trim();
  const subdomain = document.getElementById('wizSubdomain').value.trim().toLowerCase();
  const industry = document.getElementById('wizIndustry').value;
  const templateName = document.getElementById('wizTemplate').value;
  const color = document.getElementById('wizColor').value;

  showToast(`Initiating compile request for '${name}'...`, 'info');

  let webSuccess = false;
  let projectSuccess = false;

  // Step 1: Create project record via API
  try {
    await apiRequest('/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        type: 'website',
        external_project_path: subdomain
      })
    });
    projectSuccess = true;
    showToast('Project record created.', 'success');
  } catch (err) {
    showToast(`Project creation failed: ${err.message}`, 'error');
  }

  // Step 2: Compile via website engine proxy
  try {
    await apiRequest('/website-engine/compile', {
      method: 'POST',
      body: JSON.stringify({
        projectName: name,
        templateName: templateName,
        industry: industry,
        brandColor: color,
        bookingLink: `https://${subdomain}.kasimshah.com/book`
      })
    });
    webSuccess = true;
    showToast('Web Engine compiled successfully!', 'success');
  } catch (err) {
    if (err.message.includes('ENGINE_UNAVAILABLE') || err.message.includes('not configured')) {
      showToast('Website Engine unavailable. Project record created without compilation.', 'error');
      // Show retry control
      showEngineUnavailableNotice();
    } else {
      showToast(`Web compile failed: ${err.message}`, 'error');
    }
  }

  if (projectSuccess || webSuccess) {
    await loadWebProjects();
    closeUnisonWizard();
    switchView('overview');
    renderOverviewTelemetry();
  }

  submitBtn.disabled = false;
  submitBtn.textContent = 'Compile & Provision Workspace';
  wizardStep = 1;
}

function showEngineUnavailableNotice() {
  const container = document.getElementById('engine-status-notice');
  if (!container) return;
  clearEl(container);
  container.style.display = 'flex';

  container.appendChild(createEl('div', { className: 'engine-unavailable-banner' }, [
    createEl('i', { className: 'fa-solid fa-triangle-exclamation', style: { color: 'var(--warning-color)', marginRight: '8px' } }),
    createEl('span', { textContent: 'Website Engine unavailable. Compilation features are disabled.' }),
    createEl('button', {
      className: 'btn btn-secondary',
      textContent: 'Retry',
      style: { marginLeft: '12px', padding: '4px 12px', fontSize: '0.75rem' },
      onClick: () => { checkApiHealth(); container.style.display = 'none'; }
    })
  ]));
}

// --- 11. WEB CATALOG ---

async function loadWebProjects() {
  if (!AppState.currentWorkspace) {
    AppState.webProjects = [];
    return;
  }

  try {
    const data = await apiRequest('/projects');
    AppState.webProjects = data.projects || [];
  } catch (err) {
    console.warn('Failed to load projects from API:', err.message);
    AppState.webProjects = [];
  }
}

function renderOverviewTelemetry() {
  const title = document.getElementById('customer-overview-title');
  if (title && AppState.currentWorkspace) {
    title.textContent = AppState.currentWorkspace.name || 'Workspace Overview';
  }
  
  const grid = document.getElementById('customer-module-grid');
  if (!grid) return;
  clearEl(grid);

  if (!AppState.currentWorkspace) return;

  const modules = AppState.currentWorkspace.modules || [];
  
  const moduleDefs = [
    { id: 'website', name: 'Website', description: 'Pages, domain and booking journey', icon: 'fa-globe', route: 'website' },
    { id: 'analytics', name: 'Analytics', description: 'Sessions, bookings and attribution', icon: 'fa-chart-simple', route: 'analytics' },
    { id: 'booking', name: 'Booking', description: 'Shop and mobile availability', icon: 'fa-calendar-check', route: 'booking' },
    { id: 'automations', name: 'Automations', description: 'Event-led customer workflows', icon: 'fa-bolt', route: 'automations' },
    { id: 'contacts', name: 'Contacts', description: 'Customer records and activity', icon: 'fa-address-book', route: 'contacts' },
    { id: 'email', name: 'Email Marketing', description: 'Campaigns and lifecycle messaging', icon: 'fa-envelope', route: 'email' },
    { id: 'social', name: 'Social Media', description: 'Publishing and performance', icon: 'fa-share-nodes', route: 'social' },
    { id: 'team', name: 'Team', description: 'Access and workspace roles', icon: 'fa-users-gear', route: 'team' }
  ];

  moduleDefs.forEach(def => {
    const mod = modules.find(m => m.module === def.id);
    const isEnabled = mod && mod.enabled;
    const deferred = def.id === 'email' || def.id === 'social';
    const card = createEl('div', { className: `glass-card module-card ${isEnabled ? 'enabled' : 'disabled'}` }, [
      createEl('div', { className: 'module-card-top' }, [
        createEl('span', { className: 'module-card-icon' }, [createEl('i', { className: `fa-solid ${def.icon}` })]),
        createEl('span', { className: `module-state ${isEnabled ? 'enabled' : ''}`, textContent: isEnabled ? 'Enabled' : (deferred ? 'Upcoming' : 'Not enabled') })
      ]),
      createEl('div', { className: 'module-card-copy' }, [
        createEl('strong', { textContent: def.name }),
        createEl('p', { textContent: def.description })
      ]),
      createEl('div', { className: 'module-card-action' }, [
        createEl('span', { textContent: isEnabled ? 'Open product' : 'Contact your agency' }),
        createEl('i', { className: `fa-solid ${isEnabled ? 'fa-arrow-right' : 'fa-lock'}` })
      ])
    ]);
    
    if (isEnabled) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => {
        window.location.hash = `#/workspace/${AppState.currentWorkspace.id}/${def.route}`;
      });
    }
    
    grid.appendChild(card);
  });
}

function renderWebCatalogView() {
  const grid = document.getElementById('web-engines-grid');
  if (!grid) return;
  clearEl(grid);

  if (AppState.webProjects.length === 0) {
    grid.appendChild(createEl('div', { className: 'glass-card', textContent: 'No projects found. Create one using the Provision Workspace wizard.' }));
    return;
  }

  AppState.webProjects.forEach(proj => {
    const card = createEl('div', { className: 'glass-card interactive' });

    const header = createEl('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
      createEl('h3', { style: { fontFamily: 'var(--font-display)', fontSize: '1.25rem' }, textContent: proj.name }),
      createEl('span', { className: `badge badge-${proj.status === 'active' ? 'success' : 'primary'}`, textContent: proj.status || 'draft' })
    ]);

    const info = createEl('p', {
      style: { fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }
    }, [
      document.createTextNode('Type: '),
      createEl('strong', { textContent: proj.type || 'website' }),
      document.createTextNode(proj.external_project_path ? ` | Path: ${proj.external_project_path}` : '')
    ]);

    const footer = createEl('div', { className: 'engine-card-footer' }, [
      createEl('span', { style: { fontSize: '0.8rem', color: 'var(--text-muted)' }, textContent: `Created: ${new Date(proj.created_at).toLocaleDateString()}` })
    ]);

    card.appendChild(header);
    card.appendChild(info);
    card.appendChild(footer);
    grid.appendChild(card);
  });
}

// --- 12. SOCIAL AUTOMATION ---

function renderCustomerModuleState(moduleId) {
  const target = document.getElementById(`view-workspace-${moduleId}`) || document.getElementById(`view-${moduleId}`);
  if (!target) return;
  const entitlement = (AppState.currentWorkspace?.modules || []).find(item => item.module === moduleId);
  const enabled = Boolean(entitlement?.enabled);
  clearEl(target);

  if (moduleId === 'booking' && enabled) {
    target.appendChild(createEl('div', { className: 'booking-product-shell' }, [
      createEl('div', { className: 'workspace-header' }, [
        createEl('div', { className: 'workspace-title' }, [
          createEl('span', { className: 'page-eyebrow', textContent: 'KS OS booking' }),
          createEl('h1', { textContent: 'Booking operations' }),
          createEl('p', { textContent: 'Manage the conversion journey from website CTA to confirmed shop or mobile appointment.' })
        ]),
        createEl('span', { className: 'status-chip', textContent: 'Module enabled' })
      ]),
      createEl('div', { className: 'booking-channel-grid' }, [
        bookingCapabilityCard('fa-store', 'Shop appointments', 'A dedicated in-location schedule with its own opening hours and availability.'),
        bookingCapabilityCard('fa-car-side', 'Mobile appointments', 'A separate mobile-service schedule for travel windows and service coverage.'),
        bookingCapabilityCard('fa-credit-card', 'Flexible payment', 'Support pay later, no payment, deposits, full payment or customer choice.'),
        bookingCapabilityCard('fa-link', 'Conversion-first /book route', 'The website header and footer remain consistent throughout the booking journey.')
      ]),
      createEl('div', { className: 'booking-setup-notice' }, [
        createEl('i', { className: 'fa-solid fa-plug-circle-exclamation' }),
        createEl('div', {}, [
          createEl('strong', { textContent: 'Customer booking controls are awaiting the KS OS management connection' }),
          createEl('p', { textContent: 'Your agency can complete the connection from Agency OS → Integrations. No booking data is fabricated while setup is incomplete.' })
        ])
      ])
    ]));
    return;
  }

  target.appendChild(createEl('div', { style: { padding: '40px', textAlign: 'center', color: 'var(--text-muted)' } }, [
    createEl('i', { className: `fa-solid ${enabled ? 'fa-plug-circle-exclamation' : 'fa-lock'}`, style: { fontSize: '3rem', marginBottom: '16px' } }),
    createEl('h2', { textContent: enabled ? 'Enabled — setup pending' : 'Module not enabled' }),
    createEl('p', { textContent: enabled
      ? 'Your agency has enabled this module, but its customer interface or provider connection is not configured yet.'
      : 'This module is not included in this workspace. Contact your agency if you need access.' })
  ]));
}

function bookingCapabilityCard(icon, title, description) {
  return createEl('div', { className: 'booking-capability-card' }, [
    createEl('span', { className: 'module-card-icon' }, [createEl('i', { className: `fa-solid ${icon}` })]),
    createEl('strong', { textContent: title }),
    createEl('p', { textContent: description }),
    createEl('span', { className: 'module-state enabled', textContent: 'Available in KS OS' })
  ]);
}

const automationTriggerOptions = [
  ['booking.created', 'Booking created'], ['booking.cancelled', 'Booking cancelled'],
  ['appointment.completed', 'Appointment completed'], ['contact.created', 'Contact created'],
  ['contact.added_to_list', 'Contact added to list'], ['website.form_submitted', 'Website form submitted']
];
const automationActionOptions = [
  ['internal_notification.create', 'Create internal notification'], ['contact.add_tag', 'Add contact tag'],
  ['contact.remove_tag', 'Remove contact tag'], ['contact.add_to_list', 'Add contact to list'],
  ['booking_link.create', 'Create booking link notification'], ['delay.until', 'Delay']
];

function automationOption(value, label) { return createEl('option', { value, textContent: label }); }

function automationStepRow() {
  const row = createEl('div', { className: 'glass-card', style: { padding: '14px', display: 'grid', gap: '10px', marginBottom: '10px' } });
  const action = createEl('select', { className: 'form-control select-control', 'aria-label': 'Automation action' }, automationActionOptions.map(item => automationOption(item[0], item[1])));
  const config = createEl('div', { style: { display: 'grid', gap: '8px' } });
  const remove = createEl('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Remove step' });
  const renderConfig = () => {
    clearEl(config); const type = action.value;
    if (type === 'internal_notification.create') config.append(
      createEl('input', { className: 'form-control', name: 'title', maxlength: '120', placeholder: 'Notification title', required: true }),
      createEl('textarea', { className: 'form-control', name: 'message', maxlength: '1000', placeholder: 'Message — variables such as {{booking.reference}} are allowed', required: true }),
      createEl('select', { className: 'form-control select-control', name: 'severity' }, ['info', 'success', 'warning', 'error'].map(value => automationOption(value, value)))
    );
    else if (type === 'contact.add_to_list') config.appendChild(createEl('input', { className: 'form-control', name: 'listKey', maxlength: '80', placeholder: 'List key', required: true }));
    else if (type === 'delay.until') config.appendChild(createEl('input', { className: 'form-control', name: 'seconds', type: 'number', min: '60', max: '7776000', value: '3600', required: true, 'aria-label': 'Delay in seconds' }));
    else if (type === 'booking_link.create') config.appendChild(createEl('input', { className: 'form-control', name: 'title', maxlength: '120', value: 'Booking link ready', required: true }));
    else config.appendChild(createEl('input', { className: 'form-control', name: 'tag', maxlength: '60', placeholder: 'Contact tag', required: true }));
  };
  action.addEventListener('change', renderConfig); remove.addEventListener('click', () => row.remove()); renderConfig();
  row.append(action, config, remove); row.automationValue = () => {
    const own = {}; config.querySelectorAll('[name]').forEach(input => { own[input.name] = input.name === 'seconds' ? Number(input.value) : input.value; });
    return { type: action.value, config: own };
  };
  return row;
}

async function renderCustomerAutomations() {
  const host = document.getElementById('customer-automations-content'); const workspace = AppState.currentWorkspace;
  if (!host || !workspace) return; clearEl(host);
  const enabled = (workspace.modules || []).some(item => item.module === 'automations' && item.enabled);
  if (!enabled) return renderCustomerModuleState('automations');
  const canEdit = ['owner', 'admin', 'editor'].includes(workspace.role); const canActivate = ['owner', 'admin'].includes(workspace.role);
  const toolbar = createEl('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' } }, [
    createEl('div', {}, [createEl('h2', { textContent: 'Cross-channel workflows' }), createEl('p', { textContent: 'Booking, website and contact events can run controlled launch actions.' })])
  ]); host.appendChild(toolbar);
  if (canEdit) toolbar.appendChild(createEl('button', { className: 'btn btn-primary', textContent: 'New automation', onClick: () => renderAutomationBuilder(host) }));
  host.appendChild(createEl('div', { className: 'glass-card', style: { padding: '12px', marginBottom: '18px', borderLeft: '3px solid var(--warning-color)' } }, [
    createEl('strong', { textContent: 'Launch scope: ' }), document.createTextNode('email sends and social publishing are disabled until those modules are installed. They cannot be activated through this builder.')
  ]));
  const list = createEl('div'); host.appendChild(list); list.appendChild(createEl('p', { textContent: 'Loading automations…' }));
  try {
    const data = await apiRequest(`/automations?workspaceId=${encodeURIComponent(workspace.id)}`); clearEl(list);
    if (!(data.automations || []).length) list.appendChild(createEl('p', { textContent: 'No automations yet. Create a draft to begin.' }));
    (data.automations || []).forEach(item => {
      const actions = createEl('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
      actions.appendChild(createEl('button', { className: 'btn btn-secondary', textContent: 'Run history', onClick: () => renderAutomationRuns(host, item) }));
      if (canEdit && item.latest_version_id) actions.appendChild(createEl('button', { className: 'btn btn-secondary', textContent: 'Test', onClick: async () => {
        try { const result = await apiRequest(`/automations/${item.id}/test`, { method: 'POST', body: JSON.stringify({ workspaceId: workspace.id, versionId: item.latest_version_id }) }); showToast(`Test passed: ${result.steps.length} step(s) would run`, 'success'); } catch (error) { showToast(error.message, 'error'); }
      } }));
      if (canActivate && item.status !== 'active' && item.latest_version_id) actions.appendChild(createEl('button', { className: 'btn btn-primary', textContent: 'Activate', onClick: async () => {
        try { await apiRequest(`/automations/${item.id}/activate`, { method: 'POST', body: JSON.stringify({ workspaceId: workspace.id, versionId: item.latest_version_id }) }); showToast('Automation activated', 'success'); renderCustomerAutomations(); } catch (error) { showToast(error.message, 'error'); }
      } }));
      if (canActivate && item.status === 'active') actions.appendChild(createEl('button', { className: 'btn btn-secondary', textContent: 'Pause', onClick: async () => {
        try { await apiRequest(`/automations/${item.id}`, { method: 'PATCH', body: JSON.stringify({ workspaceId: workspace.id, status: 'paused' }) }); showToast('Automation paused', 'success'); renderCustomerAutomations(); } catch (error) { showToast(error.message, 'error'); }
      } }));
      list.appendChild(createEl('article', { className: 'glass-card', style: { padding: '16px', marginBottom: '12px' } }, [
        createEl('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' } }, [createEl('h3', { textContent: item.name }), createEl('span', { className: `badge badge-${item.status === 'active' ? 'success' : 'primary'}`, textContent: item.status })]),
        createEl('p', { textContent: item.description || 'No description' }), actions
      ]));
    });
  } catch (error) { clearEl(list); list.appendChild(createEl('p', { textContent: error.message })); }
}

function renderAutomationBuilder(host) {
  clearEl(host); const workspace = AppState.currentWorkspace;
  const form = createEl('form', { style: { display: 'grid', gap: '14px' } }); const steps = createEl('div');
  const name = createEl('input', { className: 'form-control', maxlength: '120', placeholder: 'Automation name', required: true });
  const description = createEl('textarea', { className: 'form-control', maxlength: '500', placeholder: 'What this workflow does' });
  const trigger = createEl('select', { className: 'form-control select-control', 'aria-label': 'Automation trigger' }, automationTriggerOptions.map(item => automationOption(item[0], item[1])));
  steps.appendChild(automationStepRow());
  form.append(
    createEl('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px' } }, [createEl('h2', { textContent: 'New automation draft' }), createEl('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Back', onClick: renderCustomerAutomations })]),
    name, description, trigger, createEl('h3', { textContent: 'Ordered actions' }), steps,
    createEl('button', { type: 'button', className: 'btn btn-secondary', textContent: 'Add step', onClick: () => { if (steps.children.length < 25) steps.appendChild(automationStepRow()); else showToast('Maximum 25 steps', 'error'); } }),
    createEl('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Save draft' })
  );
  form.addEventListener('submit', async event => {
    event.preventDefault(); const rows = [...steps.children]; if (!rows.length) return showToast('Add at least one step', 'error');
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      await apiRequest('/automations', { method: 'POST', body: JSON.stringify({ workspaceId: workspace.id, name: name.value, description: description.value, triggerType: trigger.value, definition: { steps: rows.map(row => row.automationValue()) } }) });
      showToast('Automation draft created', 'success'); await renderCustomerAutomations();
    } catch (error) { showToast(error.message, 'error'); submit.disabled = false; }
  });
  host.appendChild(form);
}

async function renderAutomationRuns(host, automation) {
  clearEl(host); host.appendChild(createEl('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' } }, [
    createEl('h2', { textContent: `${automation.name} — run history` }), createEl('button', { className: 'btn btn-secondary', textContent: 'Back', onClick: renderCustomerAutomations })
  ]));
  const list = createEl('div'); host.appendChild(list); list.appendChild(createEl('p', { textContent: 'Loading run history…' }));
  try {
    const data = await apiRequest(`/automations/${automation.id}/runs?workspaceId=${encodeURIComponent(AppState.currentWorkspace.id)}`); clearEl(list);
    if (!(data.runs || []).length) list.appendChild(createEl('p', { textContent: 'No runs recorded yet.' }));
    (data.runs || []).forEach(run => list.appendChild(createEl('div', { className: 'glass-card', style: { padding: '14px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', gap: '12px' } }, [
      createEl('div', {}, [createEl('strong', { textContent: run.automation_events?.event_type || 'event' }), createEl('p', { textContent: new Date(run.created_at).toLocaleString() })]),
      createEl('span', { className: `badge badge-${run.status === 'completed' ? 'success' : 'primary'}`, textContent: run.failure_code ? `${run.status}: ${run.failure_code}` : run.status })
    ])));
  } catch (error) { clearEl(list); list.appendChild(createEl('p', { textContent: error.message })); }
}
