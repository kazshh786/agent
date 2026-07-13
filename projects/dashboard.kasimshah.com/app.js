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

  // Workspace
  activeView: 'overview',
  currentWorkspace: null,
  workspaces: [],

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
      onAuthenticated();
    } else {
      AppState.authLoading = false;
      showAuthScreen();
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
  document.getElementById('auth-login-form').style.display = 'block';
  document.getElementById('auth-register-form').style.display = 'none';
  document.getElementById('auth-forgot-form').style.display = 'none';
  document.getElementById('auth-reset-form').style.display = 'none';
  clearAuthMessages();
}

function showRegisterForm() {
  document.getElementById('auth-login-form').style.display = 'none';
  document.getElementById('auth-register-form').style.display = 'block';
  document.getElementById('auth-forgot-form').style.display = 'none';
  document.getElementById('auth-reset-form').style.display = 'none';
  clearAuthMessages();
}

function showForgotPasswordForm() {
  document.getElementById('auth-login-form').style.display = 'none';
  document.getElementById('auth-register-form').style.display = 'none';
  document.getElementById('auth-forgot-form').style.display = 'block';
  document.getElementById('auth-reset-form').style.display = 'none';
  clearAuthMessages();
}

function showResetPasswordForm() {
  document.getElementById('auth-login-form').style.display = 'none';
  document.getElementById('auth-register-form').style.display = 'none';
  document.getElementById('auth-forgot-form').style.display = 'none';
  document.getElementById('auth-reset-form').style.display = 'block';
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
  showDashboard();
  updateUserDisplay();
  setupNavigation();
  checkApiHealth();
  loadSocialData();

  // Load workspaces
  await loadWorkspaces();

  if (AppState.workspaces.length === 0) {
    showWorkspaceOnboarding();
  } else {
    // Restore persisted workspace or use first
    const savedWsId = localStorage.getItem('ks_selected_workspace');
    const saved = AppState.workspaces.find(w => w.id === savedWsId);
    if (saved) {
      await selectWorkspace(saved);
    } else {
      await selectWorkspace(AppState.workspaces[0]);
    }
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

  // Add create option
  selector.appendChild(createEl('option', { value: '__create__', textContent: '+ Create New Workspace' }));
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
        showWorkspaceOnboarding();
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
  if (val === '__create__') {
    showWorkspaceCreationModal();
    // Reset selector to current
    renderWorkspaceSelector();
    return;
  }
  const ws = AppState.workspaces.find(w => w.id === val);
  if (ws) await selectWorkspace(ws);
}

function showWorkspaceOnboarding() {
  document.getElementById('workspace-onboarding-overlay').style.display = 'flex';
}

function hideWorkspaceOnboarding() {
  document.getElementById('workspace-onboarding-overlay').style.display = 'none';
}

function showWorkspaceCreationModal() {
  document.getElementById('workspace-create-modal').style.display = 'flex';
}

function hideWorkspaceCreationModal() {
  document.getElementById('workspace-create-modal').style.display = 'none';
}

async function handleCreateWorkspace(name, slug) {
  if (!name || name.length < 2) {
    showToast('Workspace name must be at least 2 characters.', 'error');
    return;
  }

  // Validate slug
  const slugRegex = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slugRegex.test(cleanSlug)) {
    showToast('Slug must be 3-63 characters: lowercase letters, numbers, and hyphens.', 'error');
    return;
  }

  try {
    const { data, error } = await supabaseClient.rpc('create_workspace_with_owner', {
      p_name: name,
      p_slug: cleanSlug
    });

    if (error) throw error;

    showToast('Workspace created successfully!', 'success');
    hideWorkspaceOnboarding();
    hideWorkspaceCreationModal();

    await loadWorkspaces();
    const newWs = AppState.workspaces.find(w => w.slug === cleanSlug);
    if (newWs) await selectWorkspace(newWs);
  } catch (err) {
    showToast(`Failed to create workspace: ${err.message}`, 'error');
  }
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
  // Show loading overlay
  document.getElementById('loading-overlay').style.display = 'flex';
  document.getElementById('app-container').style.display = 'none';
  document.getElementById('auth-overlay').style.display = 'none';

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

  // Logout button
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
}

function bindWorkspaceForms() {
  // Workspace selector
  const selector = document.getElementById('workspace-selector');
  if (selector) selector.addEventListener('change', handleWorkspaceSelectorChange);

  // Onboarding workspace creation
  const onboardingForm = document.getElementById('onboarding-workspace-form');
  if (onboardingForm) {
    onboardingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('onboarding-ws-name').value.trim();
      const slug = document.getElementById('onboarding-ws-slug').value.trim().toLowerCase();
      handleCreateWorkspace(name, slug);
    });
  }

  // Modal workspace creation
  const modalForm = document.getElementById('modal-workspace-form');
  if (modalForm) {
    modalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('modal-ws-name').value.trim();
      const slug = document.getElementById('modal-ws-slug').value.trim().toLowerCase();
      handleCreateWorkspace(name, slug);
    });
  }

  document.getElementById('btn-close-ws-modal')?.addEventListener('click', hideWorkspaceCreationModal);

  // Wizard, checkout, report buttons
  document.getElementById('btn-unison-wizard')?.addEventListener('click', openUnisonWizard);
  document.getElementById('btn-close-wizard')?.addEventListener('click', closeUnisonWizard);
  document.getElementById('wizard-form')?.addEventListener('submit', handleWizardSubmit);
  document.getElementById('btn-close-checkout')?.addEventListener('click', closeCheckoutDrawer);
  document.getElementById('btn-process-checkout')?.addEventListener('click', processPOSCheckout);
  document.getElementById('btn-download-report')?.addEventListener('click', generateTelemetryReport);
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
  const views = document.querySelectorAll('.dashboard-view');
  views.forEach(v => v.classList.remove('active'));

  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  if (viewName === 'overview') renderOverviewTelemetry();
  else if (viewName === 'web') renderWebCatalogView();
  else if (viewName === 'social') renderSocialDashboard();
  else if (viewName === 'salon') renderSalonOsModule();
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

  // Step 3: Register social set (mock — social publishing not connected)
  if (projectSuccess) {
    KSSocialMockData.scheduledPosts.push({
      id: `post-${Date.now()}`,
      platforms: ['instagram'],
      content: `Welcome to ${name}! Professional ${industry} services now booking online. ✨`,
      mediaType: 'none',
      mediaUrl: '',
      scheduleDate: new Date(Date.now() + 86400000).toISOString(),
      status: 'scheduled'
    });
    showToast('Social campaign template queued (mock).', 'info');
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
  const webCountEl = document.getElementById('overview-web-count');
  const postsCountEl = document.getElementById('overview-posts-count');
  const tenantsCountEl = document.getElementById('overview-tenants-count');

  if (webCountEl) webCountEl.textContent = AppState.webProjects.length;

  const postsCount = KSSocialMockData.scheduledPosts.filter(p => p.status === 'scheduled').length;
  if (postsCountEl) postsCountEl.textContent = postsCount;
  if (tenantsCountEl) tenantsCountEl.textContent = AppState.tenants.length;

  // Render activity feed using safe DOM
  const feed = document.getElementById('overview-activity-feed');
  if (!feed) return;
  clearEl(feed);

  const logs = [
    { text: 'Dashboard session authenticated', time: 'Just now', type: 'system' },
    { text: `Database sync: ${AppState.tenants.length} tenants loaded`, time: '2 mins ago', type: 'db' },
    { text: `Projects: ${AppState.webProjects.length} records`, time: '5 mins ago', type: 'web' },
    { text: `Social queue: ${postsCount} scheduled posts (mock)`, time: '10 mins ago', type: 'social' }
  ];

  logs.forEach(log => {
    const div = createEl('div', {
      style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '8px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }
    }, [
      createEl('span', {}, [
        createEl('i', { className: 'fa-solid fa-circle-chevron-right', style: { color: 'var(--primary-color)', fontSize: '0.65rem', marginRight: '8px' } }),
        document.createTextNode(log.text)
      ]),
      createEl('span', { style: { color: 'var(--text-muted)', fontSize: '0.75rem' }, textContent: log.time })
    ]);
    feed.appendChild(div);
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

function loadSocialData() {
  if (typeof KSSocialMockData !== 'undefined') {
    AppState.scheduledPosts = KSSocialMockData.scheduledPosts;
    AppState.inbox = KSSocialMockData.inboxMessages;
  }
}

function renderSocialDashboard() {
  renderSocialAccounts();
  renderScheduledPostsList();
  renderCompetitorBenchmark();
  renderInboxFeeds();
}

function renderSocialAccounts() {
  const container = document.getElementById('social-accounts-list');
  if (!container) return;
  clearEl(container);

  if (typeof KSSocialMockData === 'undefined') return;

  KSSocialMockData.socialAccounts.forEach(acc => {
    const iconMap = {
      instagram: { cls: 'fa-instagram', color: '#e1306c' },
      twitter: { cls: 'fa-twitter', color: '#1da1f2' },
      linkedin: { cls: 'fa-linkedin-in', color: '#0077b5' },
      tiktok: { cls: 'fa-tiktok', color: '#fe2c55' },
      pinterest: { cls: 'fa-pinterest', color: '#bd081c' }
    };
    const icon = iconMap[acc.platform] || iconMap.instagram;

    const card = createEl('div', {
      className: 'glass-card',
      style: { padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }
    }, [
      createEl('img', { src: acc.avatar, style: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' } }),
      createEl('div', { style: { flexGrow: '1' } }, [
        createEl('h4', { style: { fontSize: '0.85rem', fontWeight: '700' }, textContent: acc.name }),
        createEl('span', { style: { fontSize: '0.75rem', color: 'var(--text-muted)' }, textContent: acc.handle })
      ]),
      createEl('div', { style: { textAlign: 'right' } }, [
        createEl('div', { style: { fontWeight: '700', fontSize: '0.9rem' }, textContent: acc.followers }),
        createEl('span', { style: { fontSize: '0.7rem', color: 'var(--success-color)' }, textContent: acc.weeklyChange })
      ]),
      createEl('i', { className: `fa-brands ${icon.cls}`, style: { color: icon.color, fontSize: '1.2rem' } })
    ]);

    container.appendChild(card);
  });
}

function renderScheduledPostsList() {
  const container = document.getElementById('scheduled-posts-list');
  if (!container) return;
  clearEl(container);

  const scheduled = (AppState.scheduledPosts || []).filter(p => p.status === 'scheduled');

  if (scheduled.length === 0) {
    container.appendChild(createEl('div', {
      style: { color: 'var(--text-muted)', fontSize: '0.85rem' },
      textContent: 'No posts currently scheduled.'
    }));
    return;
  }

  scheduled.forEach(post => {
    const date = new Date(post.scheduleDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    const badgesContainer = createEl('div', { style: { display: 'flex', gap: '6px' } });
    post.platforms.forEach(p => {
      badgesContainer.appendChild(createEl('span', {
        className: 'badge badge-muted',
        style: { fontSize: '0.55rem', padding: '2px 6px' },
        textContent: p
      }));
    });

    const item = createEl('div', {
      style: { padding: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.04)', display: 'flex', gap: '12px' }
    }, [
      createEl('div', { style: { flexGrow: '1' } }, [
        createEl('p', { style: { fontSize: '0.85rem', marginBottom: '4px', lineHeight: '1.4' }, textContent: post.content }),
        createEl('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
          createEl('span', { style: { fontSize: '0.75rem', color: 'var(--text-muted)' } }, [
            createEl('i', { className: 'fa-regular fa-clock', style: { marginRight: '4px' } }),
            document.createTextNode(date)
          ]),
          badgesContainer
        ])
      ])
    ]);

    container.appendChild(item);
  });
}

function renderCompetitorBenchmark() {
  const container = document.getElementById('competitors-list');
  if (!container) return;
  clearEl(container);

  if (typeof KSSocialMockData === 'undefined') return;

  KSSocialMockData.analytics.competitors.forEach(comp => {
    const tr = createEl('tr', {}, [
      createEl('td', {}, [createEl('strong', { textContent: comp.name })]),
      createEl('td', { textContent: comp.followers }),
      createEl('td', { textContent: `${comp.postsPerWeek} posts/wk` }),
      createEl('td', { textContent: comp.avgEngagement }),
      createEl('td', {}, [
        createEl('span', {
          className: `badge ${comp.status.includes('leading') ? 'badge-success' : 'badge-muted'}`,
          textContent: comp.status.replace('_', ' ')
        })
      ])
    ]);
    container.appendChild(tr);
  });
}

function renderInboxFeeds() {
  const container = document.getElementById('social-inbox-list');
  if (!container) return;
  clearEl(container);

  (AppState.inbox || []).forEach(msg => {
    const div = createEl('div', {
      style: {
        padding: '12px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
        display: 'flex',
        gap: '12px',
        cursor: 'pointer',
        background: msg.unread ? 'rgba(99, 102, 241, 0.05)' : 'transparent'
      }
    }, [
      createEl('img', { src: msg.senderAvatar, style: { width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' } }),
      createEl('div', { style: { flexGrow: '1' } }, [
        createEl('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' } }, [
          createEl('strong', { style: { fontSize: '0.85rem' }, textContent: msg.sender }),
          createEl('span', { style: { fontSize: '0.7rem', color: 'var(--text-muted)' }, textContent: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
        ]),
        createEl('p', { style: { fontSize: '0.8rem', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '200px' }, textContent: msg.content })
      ])
    ]);

    div.addEventListener('click', () => openInboxMessageDetails(msg));
    container.appendChild(div);
  });
}

function openInboxMessageDetails(msg) {
  const details = document.getElementById('social-inbox-details');
  clearEl(details);
  details.style.display = 'flex';
  details.style.flexDirection = 'column';
  details.style.justifyContent = 'flex-start';
  details.style.alignItems = 'stretch';

  // Header
  const header = createEl('div', {
    style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }
  }, [
    createEl('img', { src: msg.senderAvatar, style: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' } }),
    createEl('div', {}, [
      createEl('h4', { style: { fontSize: '0.9rem', fontWeight: '700' }, textContent: msg.sender }),
      createEl('span', { style: { fontSize: '0.75rem', color: 'var(--text-muted)' }, textContent: `Source: ${msg.platform.toUpperCase()} (${msg.type})` })
    ])
  ]);
  details.appendChild(header);

  // Thread
  const chatLog = createEl('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', height: '180px', overflowY: 'auto', marginBottom: '16px' } });
  (msg.thread || []).forEach(t => {
    const bubble = createEl('div', {
      style: {
        alignSelf: t.role === 'agent' ? 'flex-end' : 'flex-start',
        background: t.role === 'agent' ? 'var(--primary-color)' : 'rgba(255,255,255,0.04)',
        color: '#fff',
        padding: '10px 14px',
        borderRadius: 'var(--border-radius-sm)',
        fontSize: '0.8rem',
        maxWidth: '80%'
      }
    }, [
      createEl('p', { textContent: t.text }),
      createEl('span', { style: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', display: 'block', textAlign: 'right', marginTop: '4px' }, textContent: t.time })
    ]);
    chatLog.appendChild(bubble);
  });
  details.appendChild(chatLog);

  // Reply input
  const replyRow = createEl('div', { style: { display: 'flex', gap: '8px' } }, [
    createEl('input', { type: 'text', id: 'inbox-reply-input', className: 'form-control', placeholder: 'Type a response...', style: { padding: '8px 12px', fontSize: '0.8rem' } }),
    createEl('button', {
      className: 'btn btn-primary',
      style: { padding: '8px 16px', fontSize: '0.8rem' },
      textContent: 'Send',
      onClick: () => sendInboxReply(msg.id)
    })
  ]);
  details.appendChild(replyRow);
}

function sendInboxReply(msgId) {
  const input = document.getElementById('inbox-reply-input');
  const replyText = input?.value.trim();
  if (!replyText) return;

  const msg = AppState.inbox.find(m => m.id === msgId);
  if (msg) {
    msg.thread.push({ sender: 'Agent', role: 'agent', text: replyText, time: 'Now' });
    msg.unread = false;
    showToast('Reply dispatched (mock — social integration not connected).', 'info');
    renderInboxFeeds();
    openInboxMessageDetails(msg);
  }
}

// --- 13. MULTI-TENANT SALON OS ---

async function fetchSupabaseTenants() {
  if (!supabaseClient || !AppState.currentWorkspace) return;
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

function renderSalonOsModule() {
  renderTenantsSelectorList();
}

function renderTenantsSelectorList() {
  const container = document.getElementById('salon-tenants-list');
  if (!container) return;
  clearEl(container);

  if (AppState.tenants.length === 0) {
    container.appendChild(createEl('div', {
      style: { color: 'var(--text-muted)', fontSize: '0.85rem', padding: '12px' },
      textContent: 'No active tenants registered in database.'
    }));
    return;
  }

  AppState.tenants.forEach(tenant => {
    const btn = createEl('button', {
      className: `tenant-nav-btn ${AppState.selectedTenant?.id === tenant.id ? 'active' : ''}`
    }, [
      createEl('i', { className: 'fa-solid fa-shop' }),
      createEl('div', { style: { textAlign: 'left', flexGrow: '1' } }, [
        createEl('div', { style: { fontWeight: '600', fontSize: '0.85rem' }, textContent: tenant.name }),
        createEl('span', { style: { fontSize: '0.7rem', color: 'var(--text-muted)' }, textContent: `${tenant.subdomain}.kasimshah.com` })
      ]),
      createEl('span', {
        style: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tenant.accent_color || '#10b981' }
      })
    ]);
    btn.addEventListener('click', () => selectTenantWorkspace(tenant));
    container.appendChild(btn);
  });
}

async function selectTenantWorkspace(tenant) {
  AppState.selectedTenant = tenant;
  renderTenantsSelectorList();

  document.getElementById('tenant-workspace-title').textContent = tenant.name;
  document.getElementById('tenant-workspace-subtitle').textContent = `Subdomain: ${tenant.subdomain}.kasimshah.com`;
  document.getElementById('tenant-active-panel').style.display = 'block';

  showToast(`Synced workspace schema for '${tenant.name}'`, 'info');

  await fetchTenantDbDetails(tenant.id);
  renderTenantCalendar();
  renderTenantCRMTab();
  renderTenantBillingAndRules();
}

async function fetchTenantDbDetails(tenantId) {
  if (!supabaseClient) {
    AppState.services = [
      { id: 's1', name: 'Luxury Hair Cut', duration: 45, price: 4500 },
      { id: 's2', name: 'Hot Towel Beard Shave', duration: 30, price: 2500 }
    ];
    AppState.staff = [{ id: 'u1', name: 'Master Stylist', role: 'owner' }];
    AppState.crmClients = [{ id: 'c1', name: 'John Doe', email: 'john@gmail.com', loyalty_points: 120 }];
    AppState.appointments = [];
    return;
  }

  try {
    const { data: svcs } = await supabaseClient.from('services').select('*').eq('tenant_id', tenantId);
    AppState.services = svcs || [];

    const { data: users } = await supabaseClient.from('users').select('*').eq('tenant_id', tenantId);
    AppState.staff = users || [];

    const { data: clients } = await supabaseClient.from('clients').select('*').eq('tenant_id', tenantId);
    AppState.crmClients = clients || [];

    const { data: wlist } = await supabaseClient.from('waitlist').select('*').eq('tenant_id', tenantId);
    AppState.waitlist = wlist || [];

    const { data: appts } = await supabaseClient.from('appointments').select('*, services(name, price), users(name)').eq('tenant_id', tenantId);
    AppState.appointments = appts || [];

    const { data: rules } = await supabaseClient.from('off_peak_rules').select('*').eq('tenant_id', tenantId);
    AppState.offPeakRules = rules || [];
  } catch (err) {
    console.error('Failed to query tenant records:', err);
  }
}

// Calendar rendering
function renderTenantCalendar() {
  const container = document.getElementById('tenant-calendar-container');
  if (!container) return;
  clearEl(container);

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const calDiv = createEl('div', { className: 'calendar-component' });

  const headerRow = createEl('div', { className: 'calendar-days-header' });
  daysOfWeek.forEach(d => headerRow.appendChild(createEl('div', { textContent: d })));
  calDiv.appendChild(headerRow);

  const grid = createEl('div', { className: 'calendar-grid' });
  for (let i = 1; i <= 28; i++) {
    const hasAppts = i === 12 || i === 15 || i === 22;
    const cell = createEl('div', {
      className: `calendar-cell ${hasAppts ? 'has-events' : ''} ${i === 13 ? 'today' : ''}`,
      onClick: () => showDayAppointments(i)
    }, [
      createEl('div', { className: 'cell-day-num', textContent: String(i) })
    ]);
    if (hasAppts) {
      const dots = createEl('div', { className: 'cell-events-dots' });
      dots.appendChild(createEl('span', { className: 'event-dot primary' }));
      cell.appendChild(dots);
    }
    grid.appendChild(cell);
  }
  calDiv.appendChild(grid);
  container.appendChild(calDiv);

  // Load waitlist
  const wlContainer = document.getElementById('tenant-waitlist-box');
  if (!wlContainer) return;
  clearEl(wlContainer);

  if (AppState.waitlist.length === 0) {
    wlContainer.appendChild(createEl('div', {
      style: { color: 'var(--text-muted)', fontSize: '0.8rem' },
      textContent: 'No clients currently in waitlist.'
    }));
  } else {
    AppState.waitlist.forEach(wl => {
      const card = createEl('div', {
        style: { background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '6px', borderLeft: '3px solid var(--warning-color)', marginBottom: '6px', fontSize: '0.8rem' }
      }, [
        createEl('strong', { textContent: wl.client_name || 'Client' }),
        document.createTextNode(` waiting for Service ID: ${wl.service_id || 'Cut'}`),
        createEl('br'),
        createEl('span', { style: { fontSize: '0.7rem', color: 'var(--text-muted)' }, textContent: `Preferred: ${wl.preferred_date} (${wl.status})` })
      ]);
      wlContainer.appendChild(card);
    });
  }
}

function showDayAppointments(dayNum) {
  const container = document.getElementById('tenant-waitlist-box');
  if (!container) return;
  clearEl(container);

  container.appendChild(createEl('h4', { textContent: `Appointments on Day ${dayNum}` }));

  const dailyAppts = AppState.appointments.filter(a => new Date(a.start_time).getDate() === dayNum);

  if (dailyAppts.length === 0) {
    container.appendChild(createEl('p', {
      style: { fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' },
      textContent: 'No bookings scheduled.'
    }));
  } else {
    dailyAppts.forEach(a => {
      container.appendChild(createEl('div', {
        style: { padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', marginTop: '6px', fontSize: '0.8rem' }
      }, [
        createEl('strong', { textContent: a.users?.name || 'Stylist' }),
        document.createTextNode(` — ${a.services?.name || 'Hair Cut'}`),
        createEl('br'),
        createEl('span', { style: { color: 'var(--text-muted)' }, textContent: `Time: ${new Date(a.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${a.status})` })
      ]));
    });
  }
}

// CRM Tab
function renderTenantCRMTab() {
  const selector = document.getElementById('crm-client-select');
  if (!selector) return;
  clearEl(selector);

  selector.appendChild(createEl('option', { value: '', textContent: '-- Choose Client Profile --' }));

  AppState.crmClients.forEach(c => {
    selector.appendChild(createEl('option', {
      value: c.id,
      textContent: `${c.name} (Pts: ${c.loyalty_points || 0})`
    }));
  });

  // Remove old listeners by cloning
  const newSelector = selector.cloneNode(true);
  selector.parentNode.replaceChild(newSelector, selector);

  newSelector.addEventListener('change', (e) => {
    const client = AppState.crmClients.find(c => c.id === e.target.value);
    if (client) {
      AppState.selectedClient = client;
      renderClientTimelineDetails(client);
    }
  });
}

function renderClientTimelineDetails(client) {
  const container = document.getElementById('crm-client-details-box');
  if (!container) return;
  clearEl(container);
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.justifyContent = 'flex-start';
  container.style.alignItems = 'stretch';
  container.style.minHeight = '220px';

  // Header
  const header = createEl('div', {
    style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }
  }, [
    createEl('div', {}, [
      createEl('h3', { style: { fontFamily: 'var(--font-display)', fontSize: '1.3rem' }, textContent: client.name }),
      createEl('p', { style: { fontSize: '0.85rem', color: 'var(--text-secondary)' }, textContent: `${client.email} | ${client.phone || '+44 7911 000000'}` })
    ]),
    createEl('div', { style: { textAlign: 'right' } }, [
      createEl('span', { className: 'badge badge-success', style: { fontSize: '0.8rem', padding: '6px 12px' }, textContent: `${client.loyalty_points || 0} LOYALTY POINTS` })
    ])
  ]);
  container.appendChild(header);

  // Actions
  const actions = createEl('div', { style: { display: 'flex', gap: '12px', marginBottom: '24px' } }, [
    createEl('button', {
      className: 'btn btn-primary',
      style: { padding: '8px 16px', fontSize: '0.8rem' },
      onClick: () => openPOSCheckoutDrawer(client.id)
    }, [
      createEl('i', { className: 'fa-solid fa-cart-plus' }),
      document.createTextNode(' Open POS Checkout')
    ]),
    createEl('button', {
      className: 'btn btn-secondary',
      style: { padding: '8px 16px', fontSize: '0.8rem' },
      onClick: () => showToast('Intake forms retrieved (mock).', 'info')
    }, [
      createEl('i', { className: 'fa-regular fa-clipboard' }),
      document.createTextNode(' Intake Forms')
    ])
  ]);
  container.appendChild(actions);

  // Timeline
  container.appendChild(createEl('h4', { textContent: 'Timeline Chronological History' }));
  const timeline = createEl('div', { className: 'client-timeline' });

  const events = [
    { dot: 'checkout', title: 'Checkout Transaction Completed', date: '12 Jul 2026', detail: 'Completed checkout receipt.', extra: '+45 Loyalty Points Credited', extraColor: 'var(--success-color)' },
    { dot: 'appointment', title: 'Salon Visit Booked', date: '10 Jul 2026', detail: 'Standard service scheduled.', extra: 'Status: Completed', extraColor: 'var(--primary-color)' }
  ];

  events.forEach(ev => {
    timeline.appendChild(createEl('div', { className: 'timeline-item' }, [
      createEl('span', { className: `timeline-dot ${ev.dot}` }),
      createEl('div', { className: 'timeline-meta' }, [
        createEl('span', { textContent: ev.title }),
        createEl('span', { textContent: ev.date })
      ]),
      createEl('div', { className: 'timeline-card' }, [
        document.createTextNode(ev.detail),
        createEl('br'),
        createEl('span', { style: { color: ev.extraColor, fontSize: '0.75rem' }, textContent: ev.extra })
      ])
    ]));
  });
  container.appendChild(timeline);
}

// POS Checkout
function openPOSCheckoutDrawer(clientId) {
  const client = AppState.crmClients.find(c => c.id === clientId);
  if (!client) return;

  document.getElementById('checkout-client-name').textContent = client.name;
  document.getElementById('checkout-client-points').textContent = `${client.loyalty_points || 0} pts`;

  const svcContainer = document.getElementById('checkout-services-select');
  clearEl(svcContainer);
  svcContainer.appendChild(createEl('option', { value: '', textContent: '-- Choose Item / Service --' }));
  AppState.services.forEach(s => {
    svcContainer.appendChild(createEl('option', { value: s.id, textContent: `${s.name} (£${(s.price / 100).toFixed(2)})` }));
  });

  const staffSel = document.getElementById('checkout-staff-select');
  clearEl(staffSel);
  staffSel.appendChild(createEl('option', { value: '', textContent: '-- Assign Stylist --' }));
  AppState.staff.forEach(stf => {
    staffSel.appendChild(createEl('option', { value: stf.id, textContent: stf.name }));
  });

  AppState.cartItems = [];
  renderPOSCartList();
  document.getElementById('pos-checkout-drawer').classList.add('active');
}

function closeCheckoutDrawer() {
  document.getElementById('pos-checkout-drawer').classList.remove('active');
}

// Cart management
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-add-cart')?.addEventListener('click', () => {
    const itemVal = document.getElementById('checkout-services-select').value;
    const staffVal = document.getElementById('checkout-staff-select').value;

    if (!itemVal) {
      showToast('Please select a service or retail item.', 'error');
      return;
    }

    const svc = AppState.services.find(s => s.id === itemVal);
    if (svc) {
      AppState.cartItems.push({ id: svc.id, name: svc.name, price: svc.price, staffId: staffVal });
      renderPOSCartList();
      showToast(`${svc.name} added to cart.`, 'success');
    }
  });
});

function renderPOSCartList() {
  const container = document.getElementById('checkout-cart-items');
  if (!container) return;
  clearEl(container);

  let total = 0;
  AppState.cartItems.forEach((item, idx) => {
    total += item.price;
    const staffName = AppState.staff.find(s => s.id === item.staffId)?.name || 'House';

    const div = createEl('div', {
      style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }
    }, [
      createEl('div', {}, [
        createEl('strong', { textContent: item.name }),
        createEl('br'),
        createEl('span', { style: { fontSize: '0.7rem', color: 'var(--text-muted)' }, textContent: `Staff: ${staffName}` })
      ]),
      createEl('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
        createEl('span', { textContent: `£${(item.price / 100).toFixed(2)}` }),
        createEl('button', {
          style: { background: 'none', border: 'none', color: 'var(--danger-color)', cursor: 'pointer' },
          onClick: () => { AppState.cartItems.splice(idx, 1); renderPOSCartList(); }
        }, [createEl('i', { className: 'fa-solid fa-trash-can' })])
      ])
    ]);
    container.appendChild(div);
  });

  AppState.cartTotal = total;
  const subtotalEl = document.getElementById('checkout-subtotal');
  const earnedEl = document.getElementById('checkout-earned-points');
  const totalEl = document.getElementById('checkout-total');
  if (subtotalEl) subtotalEl.textContent = `£${(total / 100).toFixed(2)}`;
  const earnedPoints = Math.floor(total / 100);
  if (earnedEl) earnedEl.textContent = `+${earnedPoints} loyalty points`;
  if (totalEl) totalEl.textContent = `£${(total / 100).toFixed(2)}`;
}

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
      const { error: txErr } = await supabaseClient
        .from('checkout_transactions')
        .insert([{
          tenant_id: AppState.selectedTenant.id,
          client_id: client.id,
          total_amount: AppState.cartTotal,
          payment_method: 'card',
          items_json: AppState.cartItems
        }])
        .select();

      if (txErr) throw txErr;

      await supabaseClient
        .from('clients')
        .update({ loyalty_points: (client.loyalty_points || 0) + earnedPoints })
        .eq('id', client.id);
    }

    client.loyalty_points = (client.loyalty_points || 0) + earnedPoints;
    showToast(`POS Checkout successful! £${(AppState.cartTotal / 100).toFixed(2)} recorded.`, 'success');
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

// Billing/Rules
function renderTenantBillingAndRules() {
  const container = document.getElementById('tenant-billing-panel');
  if (!container) return;
  clearEl(container);

  container.appendChild(createEl('h4', { style: { marginBottom: '12px' }, textContent: 'Active Off-Peak Discounts' }));

  const rulesContainer = createEl('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' } });
  if (AppState.offPeakRules.length === 0) {
    rulesContainer.appendChild(createEl('p', { style: { fontSize: '0.8rem', color: 'var(--text-muted)' }, textContent: 'No off-peak rules defined.' }));
  } else {
    AppState.offPeakRules.forEach(r => {
      rulesContainer.appendChild(createEl('div', {
        style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }
      }, [
        createEl('span', { textContent: `Day ${r.dayOfWeek || 'Mon'}: ${r.startTime} - ${r.endTime}` }),
        createEl('span', { style: { color: 'var(--success-color)', fontWeight: '700' }, textContent: `-${r.discountPercentage}% off` })
      ]));
    });
  }
  container.appendChild(rulesContainer);

  container.appendChild(createEl('h4', { textContent: 'SMS Automations Rules' }));
  container.appendChild(createEl('p', {
    style: { fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4', marginTop: '8px' }
  }, [
    document.createTextNode('Trigger event: '),
    createEl('strong', { textContent: 'booking_created' }),
    createEl('br'),
    document.createTextNode('Template: Hello [Client], your booking for [Service] is confirmed!')
  ]));
}

// --- 14. GLOBAL SETTINGS ---

function generateTelemetryReport() {
  showToast('Report generation not yet implemented.', 'info');
}

// --- 15. INLINE SCRIPT FUNCTIONS (safe tab switching) ---

window.switchSocialTab = function(tabId) {
  const panels = document.querySelectorAll('.social-tab-panel');
  panels.forEach(p => p.style.display = 'none');
  const target = document.getElementById(`social-tab-${tabId}`);
  if (target) target.style.display = 'block';

  const btns = document.querySelectorAll('#view-social .tab-row button');
  btns.forEach(b => b.classList.remove('active'));
  // Find the clicked button by matching tabId
  btns.forEach(b => {
    if (b.textContent.toLowerCase().includes(tabId.replace('publisher', 'publisher').replace('inbox', 'moderation').replace('benchmarks', 'competitor'))) {
      b.classList.add('active');
    }
  });
};

window.switchTenantSubTab = function(tabId) {
  const panels = document.querySelectorAll('.tenant-panel-content');
  panels.forEach(p => p.style.display = 'none');
  const target = document.getElementById(`tenant-panel-${tabId}`);
  if (target) target.style.display = 'block';

  const btns = document.querySelectorAll('.tenant-workspace-layout .tab-btn');
  btns.forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`tenant-tab-${tabId}`);
  if (activeBtn) activeBtn.classList.add('active');
};

window.scheduleMockPost = function() {
  const text = document.getElementById('social-post-text').value.trim();
  const media = document.getElementById('social-post-media').value.trim();

  if (!text) {
    showToast('Please draft copy text for your campaign post.', 'error');
    return;
  }

  if (typeof KSSocialMockData !== 'undefined') {
    KSSocialMockData.scheduledPosts.push({
      id: `post-${Date.now()}`,
      platforms: ['instagram', 'twitter'],
      content: text,
      mediaType: media ? 'image' : 'none',
      mediaUrl: media || '',
      scheduleDate: new Date(Date.now() + 86400000 * 2).toISOString(),
      status: 'scheduled'
    });
    document.getElementById('social-post-text').value = '';
    renderSocialDashboard();
    showToast('Campaign post added to queue (mock — social publishing not connected).', 'info');
  }
};

window.generateAICopy = function() {
  const postText = document.getElementById('social-post-text');
  if (postText) {
    postText.value = 'Transform your routine with our premium wellness packages. Designed to rejuvenate and elevate. Book your session now! ✨💆‍♀️';
    const mockupCaption = document.getElementById('mockup-caption');
    if (mockupCaption) mockupCaption.textContent = postText.value;
  }
  showToast('AI copy generated (mock — AI integration not connected).', 'info');
};

// Live preview bindings
document.addEventListener('DOMContentLoaded', () => {
  const postText = document.getElementById('social-post-text');
  const postMedia = document.getElementById('social-post-media');

  postText?.addEventListener('input', (e) => {
    const caption = document.getElementById('mockup-caption');
    if (caption) caption.textContent = e.target.value || 'Your caption copy will render here...';
  });

  postMedia?.addEventListener('input', (e) => {
    const img = document.getElementById('mockup-img');
    if (img) img.src = e.target.value || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80';
  });
});
