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

  // Revalidate membership server-side
  try {
    const { data, error } = await supabaseClient
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace.id)
      .eq('user_id', AppState.user.id)
      .single();

    if (error || !data) {
      showToast('You no longer have access to this workspace.', 'error');
      AppState.workspaces = AppState.workspaces.filter(w => w.id !== workspace.id);
      renderWorkspaceSelector();
      if (AppState.workspaces.length > 0) {
        await selectWorkspace(AppState.workspaces[0]);
      } else {
        showUnassignedScreen();
      }
      return;
    }

    workspace.role = data.role;
  } catch (err) {
    console.error('Workspace validation failed:', err);
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
  const agencyNav = document.getElementById('nav-agency');
  const customerNavItems = document.querySelectorAll('.nav-item-customer');
  const modeSwitcher = document.getElementById('mode-switcher');
  const wsSelector = document.getElementById('workspace-selector-container');

  if (AppState.currentMode === 'agency') {
    if (agencyNav) agencyNav.style.display = 'block';
    customerNavItems.forEach(el => el.style.display = 'none');
    if (wsSelector) wsSelector.style.display = 'none';
  } else {
    if (agencyNav) agencyNav.style.display = 'none';
    customerNavItems.forEach(el => el.style.display = 'block');
    if (wsSelector) wsSelector.style.display = 'block';
  }

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

  if (mode === 'agency' && viewId === 'overview') renderAgencyControlCentre();
  else if (mode === 'customer') {
    if (viewId === 'overview') renderOverviewTelemetry();
    else if (viewId === 'website' || viewId === 'web') renderWebCatalogView();
    else renderCustomerModuleState(viewId);
  }
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
  const actions = [];
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
  const moduleCheckboxes = document.querySelectorAll('.module-checkbox:checked');
  const modules = Array.from(moduleCheckboxes).map(cb => cb.value);

  if (!name || !slug || !customerName || !customerEmail || modules.length === 0) {
    showToast('Please complete all required fields and select at least one module.', 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Provision Workspace'; }
    return;
  }

  try {
    await apiRequest('/platform/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, slug, customer_name: customerName, customer_email: customerEmail, modules })
    });
    showToast('Customer workspace provisioned. Awaiting customer invitation.', 'success');
    closeUnisonWizard();
    await loadAgencyWorkspaces();
    renderAgencyControlCentre();
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
  document.getElementById('btn-unassigned-logout')?.addEventListener('click', handleLogout);
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
  const links = document.querySelectorAll('.nav-item, .nav-item-customer');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      const view = link.getAttribute('data-view');
      if (view) {
        e.preventDefault();
        const mode = AppState.currentMode || 'customer';
        if (mode === 'agency') {
          window.location.hash = `#/agency/${view}`;
        } else {
          const wsId = AppState.currentWorkspace?.id || AppState.workspaces[0]?.id || '';
          if (wsId) {
            window.location.hash = `#/workspace/${wsId}/${view}`;
          }
        }
      }
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
  document.getElementById('wiz-btn-next')?.addEventListener('click', () => {
    if (wizardStep < 3) moveWizard(1);
  });
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
    { id: 'website', name: 'Web Engine', icon: 'fa-code', route: 'website' },
    { id: 'analytics', name: 'Analytics', icon: 'fa-chart-bar', route: 'analytics' },
    { id: 'contacts', name: 'Contacts', icon: 'fa-address-book', route: 'contacts' },
    { id: 'email', name: 'Email Marketing', icon: 'fa-envelope', route: 'email' },
    { id: 'social', name: 'Social Media', icon: 'fa-share-nodes', route: 'social' },
    { id: 'booking', name: 'Booking', icon: 'fa-calendar-check', route: 'booking' },
    { id: 'automations', name: 'Automations', icon: 'fa-bolt', route: 'automations' },
    { id: 'team', name: 'Team', icon: 'fa-users-gear', route: 'team' }
  ];

  moduleDefs.forEach(def => {
    const mod = modules.find(m => m.module === def.id);
    const isEnabled = mod && mod.enabled;
    const statusText = isEnabled ? 'ENABLED' : 'NOT ENABLED';
    const statusClass = isEnabled ? 'positive' : 'neutral';
    
    const card = createEl('div', { className: `glass-card stat-card ${isEnabled ? '' : 'disabled'}` }, [
      createEl('div', { className: 'stat-card-content' }, [
        createEl('div', { className: 'stat-info' }, [
          createEl('span', { className: 'stat-title', textContent: def.name }),
          createEl('span', { className: 'stat-value', style: { fontSize: '1rem', marginTop: '4px' }, textContent: isEnabled ? 'Active' : 'Locked' }),
          createEl('span', { className: `stat-trend ${statusClass}` }, [
             createEl('i', { className: `fa-solid ${isEnabled ? 'fa-check' : 'fa-lock'}` }),
             document.createTextNode(` ${statusText}`)
          ])
        ]),
        createEl('div', { className: 'stat-icon' }, [
          createEl('i', { className: `fa-solid ${def.icon}` })
        ])
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
  clearEl(target);
  target.appendChild(createEl('div', { style: { padding: '40px', textAlign: 'center', color: 'var(--text-muted)' } }, [
    createEl('i', { className: 'fa-solid fa-plug-circle-xmark', style: { fontSize: '3rem', marginBottom: '16px' } }),
    createEl('h2', { textContent: 'Module State' }),
    createEl('p', { textContent: 'This module is ENABLED_NOT_CONFIGURED. Functionality is currently restricted.' })
  ]));
}
