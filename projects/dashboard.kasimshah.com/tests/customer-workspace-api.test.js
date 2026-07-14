const mockRequireAuth = jest.fn();
const mockRequireMembership = jest.fn();

jest.mock('../api/_utils.js', () => ({
  handleCors: () => false,
  requireAuth: (...args) => mockRequireAuth(...args),
  requireWorkspaceMembership: (...args) => mockRequireMembership(...args),
  validateUUID: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || ''),
  errorResponse: (res, status, code, message) => res.status(status).json({ error: { code, message } })
}));

const handler = require('../api/customer/workspaces/[id].js');
const WS = '123e4567-e89b-12d3-a456-426614174000';

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function supabaseFor({ workspace, modules = [], workspaceError = null, modulesError = null }) {
  return {
    from(table) {
      const result = table === 'workspaces' ? { data: workspace, error: workspaceError } : { data: modules, error: modulesError };
      const terminal = table === 'workspaces' ? { single: async () => result } : Promise.resolve(result);
      return { select: () => ({ eq: () => terminal }) };
    }
  };
}

beforeEach(() => jest.clearAllMocks());

test('customer workspace endpoint enforces method and authentication', async () => {
  let res = response();
  await handler({ method: 'POST', query: {}, headers: {} }, res);
  expect(res.statusCode).toBe(405);

  res = response();
  mockRequireAuth.mockResolvedValue({ error: 'UNAUTHORIZED', status: 401 });
  await handler({ method: 'GET', query: { id: WS }, headers: {} }, res);
  expect(res.statusCode).toBe(401);
});

test('customer workspace endpoint rejects missing IDs and non-members', async () => {
  let res = response();
  await handler({ method: 'GET', query: {}, headers: {} }, res);
  expect(res.statusCode).toBe(400);

  res = response();
  mockRequireAuth.mockResolvedValue({ user: { id: 'user' }, supabase: {} });
  mockRequireMembership.mockResolvedValue({ error: { code: 'FORBIDDEN' }, status: 403 });
  await handler({ method: 'GET', query: { id: WS }, headers: {} }, res);
  expect(res.statusCode).toBe(404);
});

test('customer workspace endpoint returns only its public allowlist', async () => {
  const supabase = supabaseFor({
    workspace: { id: WS, name: 'Acme', slug: 'acme', status: 'active', owner_id: 'secret', customer_email: 'secret@example.com' },
    modules: [{ module_name: 'analytics', enabled: true, provider_token: 'secret' }]
  });
  mockRequireAuth.mockResolvedValue({ user: { id: 'user' }, supabase });
  mockRequireMembership.mockResolvedValue({ role: 'viewer' });
  const res = response();
  await handler({ method: 'GET', query: { id: WS }, headers: {} }, res);
  expect(res.statusCode).toBe(200);
  expect(Object.keys(res.body).sort()).toEqual(['id', 'modules', 'name', 'role', 'slug', 'status']);
  expect(res.body.owner_id).toBeUndefined();
  expect(res.body.customer_email).toBeUndefined();
  expect(res.body.modules).toEqual([{ module_name: 'analytics', enabled: true }]);
});

test('customer workspace endpoint returns a safe database error', async () => {
  const supabase = supabaseFor({ workspace: { id: WS, name: 'Acme', slug: 'acme', status: 'active' }, modulesError: { message: 'database secret' } });
  mockRequireAuth.mockResolvedValue({ user: { id: 'user' }, supabase });
  mockRequireMembership.mockResolvedValue({ role: 'owner' });
  const res = response();
  await handler({ method: 'GET', query: { id: WS }, headers: {} }, res);
  expect(res.statusCode).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('database secret');
});
