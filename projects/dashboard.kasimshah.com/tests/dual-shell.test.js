/** @jest-environment jsdom */
const { resolveRoute, defaultRoute, applyViewAccessibility } = require('../js/router.js');
const { requireActiveWorkspace, requireEnabledModule, requireWorkspaceRole, requireWorkspaceMembership } = require('../api/_utils.js');

const WS1 = '123e4567-e89b-12d3-a456-426614174000';
const WS2 = '223e4567-e89b-12d3-a456-426614174000';
const customer = { permittedModes: ['customer'], workspaces: [{ id: WS1 }], workspaceMemberships: [{ id: WS1 }] };

function singleResult(data, error = null) {
  return { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data, error }) }), single: async () => ({ data, error }) }) }) }) };
}

describe('production hash router', () => {
  test('selects agency, customer and unassigned defaults', () => {
    expect(defaultRoute({ permittedModes: ['agency'], workspaces: [] })).toBe('#/agency/overview');
    expect(defaultRoute(customer)).toBe(`#/workspace/${WS1}/overview`);
    expect(defaultRoute({ permittedModes: [], workspaces: [] })).toBeNull();
  });

  test('parses authorized routes', () => {
    expect(resolveRoute('#/agency/customers', { permittedModes: ['agency'], workspaces: [] })).toEqual({ mode: 'agency', viewId: 'customers', workspaceId: null });
    expect(resolveRoute(`#/workspace/${WS1}/analytics`, customer)).toEqual({ mode: 'customer', viewId: 'analytics', workspaceId: WS1 });
  });

  test.each([
    ['malformed UUID', '#/workspace/not-a-uuid/overview'],
    ['another workspace', `#/workspace/${WS2}/overview`],
    ['unknown view', `#/workspace/${WS1}/unknown`]
  ])('rejects %s', (_label, hash) => {
    expect(resolveRoute(hash, customer).redirect).toBe(`#/workspace/${WS1}/overview`);
  });

  test('customer cannot enter agency mode', () => {
    expect(resolveRoute('#/agency/audit', customer).redirect).toBe(`#/workspace/${WS1}/overview`);
  });

  test('platform role without membership cannot enter customer mode', () => {
    const agencyOnly = { permittedModes: ['agency'], workspaces: [], workspaceMemberships: [] };
    expect(resolveRoute(`#/workspace/${WS1}/overview`, agencyOnly).redirect).toBe('#/agency/overview');
  });

  test('unknown top-level routes use a safe fallback', () => {
    expect(resolveRoute('#/anything', customer).redirect).toBe(`#/workspace/${WS1}/overview`);
  });

  test('applies real focus and aria-current behavior', () => {
    document.body.innerHTML = `
      <a class="nav-item" href="#/agency/overview" aria-current="page">Agency</a>
      <a class="nav-item-customer" href="#/workspace/${WS1}/analytics">Analytics</a>
      <section id="target"><h1>Analytics</h1></section>`;
    const target = document.getElementById('target');
    applyViewAccessibility(document, target, 'customer', 'analytics');
    const links = document.querySelectorAll('a');
    expect(document.activeElement).toBe(target.querySelector('h1'));
    expect(links[0].hasAttribute('aria-current')).toBe(false);
    expect(links[1].getAttribute('aria-current')).toBe('page');
  });
});

describe('production workspace guards', () => {
  test('membership rejects invalid UUID and missing membership', async () => {
    expect((await requireWorkspaceMembership({}, 'user', 'invalid')).error.code).toBe('INVALID_UUID');
    const missing = singleResult(null, { message: 'not found' });
    expect((await requireWorkspaceMembership(missing, 'user', WS1)).status).toBe(403);
  });

  test.each([
    ['suspended', 'WORKSPACE_SUSPENDED', 403],
    ['archived', 'WORKSPACE_ARCHIVED', 403],
    ['provisioning', 'WORKSPACE_PROVISIONING', 409],
    ['failed', 'WORKSPACE_FAILED', 409]
  ])('maps %s lifecycle accurately', async (status, code, httpStatus) => {
    const result = await requireActiveWorkspace(singleResult({ status }), WS1);
    expect(result.error.code).toBe(code);
    expect(result.status).toBe(httpStatus);
  });

  test('disabled module returns MODULE_DISABLED', async () => {
    const result = await requireEnabledModule(singleResult({ enabled: false }), WS1, 'analytics');
    expect(result.error.code).toBe('MODULE_DISABLED');
    expect(result.status).toBe(403);
  });

  test('viewer is rejected from owner/admin operations', async () => {
    const result = await requireWorkspaceRole(singleResult({ role: 'viewer' }), 'user', WS1, ['owner', 'admin']);
    expect(result.error.code).toBe('FORBIDDEN');
  });
});
