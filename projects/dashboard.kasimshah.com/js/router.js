(function initRouter(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KSRouter = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function routerFactory() {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const AGENCY_VIEWS = new Set(['overview', 'customers', 'provision', 'websites', 'integrations', 'jobs', 'subscriptions', 'audit', 'settings']);
  const CUSTOMER_VIEWS = new Set(['overview', 'website', 'analytics', 'contacts', 'email', 'social', 'booking', 'automations', 'team', 'settings']);

  function firstWorkspaceId(identity) {
    return identity.workspaces?.[0]?.id || null;
  }

  function defaultRoute(identity) {
    if (identity.permittedModes?.includes('agency')) return '#/agency/overview';
    const workspaceId = firstWorkspaceId(identity);
    if (identity.permittedModes?.includes('customer') && workspaceId) {
      return `#/workspace/${workspaceId}/overview`;
    }
    return null;
  }

  function resolveRoute(hash, identity) {
    const fallback = defaultRoute(identity);
    const path = String(hash || '').replace(/^#/, '');
    const parts = path.split('/').filter(Boolean);
    if (!parts.length) return { redirect: fallback, unassigned: !fallback };

    if (parts[0] === 'agency') {
      if (!identity.permittedModes?.includes('agency')) return { redirect: fallback, unassigned: !fallback };
      const viewId = parts[1] || 'overview';
      if (!AGENCY_VIEWS.has(viewId) || parts.length > 2) return { redirect: '#/agency/overview' };
      return { mode: 'agency', viewId, workspaceId: null };
    }

    if (parts[0] === 'workspace') {
      if (!identity.permittedModes?.includes('customer')) return { redirect: fallback, unassigned: !fallback };
      const workspaceId = parts[1];
      const viewId = parts[2] || 'overview';
      if (!UUID_RE.test(workspaceId || '')) return { redirect: fallback, unassigned: !fallback };
      const memberships = identity.workspaceMemberships || identity.workspaces || [];
      if (!memberships.some(workspace => workspace.id === workspaceId)) return { redirect: fallback, unassigned: !fallback };
      if (!CUSTOMER_VIEWS.has(viewId) || parts.length > 3) {
        return { redirect: `#/workspace/${workspaceId}/overview` };
      }
      return { mode: 'customer', viewId, workspaceId };
    }

    return { redirect: fallback, unassigned: !fallback };
  }

  function applyViewAccessibility(documentRef, target, mode, viewId) {
    if (!documentRef || !target) return;
    const links = documentRef.querySelectorAll('.nav-item, .nav-item-customer');
    links.forEach(link => {
      link.removeAttribute('aria-current');
      link.classList.remove('active');
    });
    let activeLink = documentRef.querySelector(`a[href="#/${mode}/${viewId}"]`);
    if (!activeLink && mode === 'customer') {
      activeLink = documentRef.querySelector(`a[href^="#/workspace/"][href$="/${viewId}"]`);
    }
    if (!activeLink) activeLink = documentRef.querySelector(`a[data-view="${viewId}"]`);
    if (activeLink) {
      activeLink.setAttribute('aria-current', 'page');
      activeLink.classList.add('active');
    }
    const heading = target.querySelector('h1');
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
  }

  return { UUID_RE, defaultRoute, resolveRoute, applyViewAccessibility };
}));
