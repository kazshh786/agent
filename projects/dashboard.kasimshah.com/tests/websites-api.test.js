const mockRequireAuth = jest.fn();
const mockRequireActiveWorkspace = jest.fn();
const mockRequireWebsiteWrite = jest.fn();

jest.mock('../api/_utils', () => ({
  requireAuth: (...args) => mockRequireAuth(...args),
  requireActiveWorkspace: (...args) => mockRequireActiveWorkspace(...args),
  validateUUID: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || ''),
  rejectUnknownFields: (body, allowed) => ({ valid: Object.keys(body || {}).every(key => allowed.includes(key)) }),
  errorResponse: (res, status, code, message) => res.status(status).json({ error: { code, message } }),
  handleCors: () => false,
}));

jest.mock('../api/_website', () => ({
  requireWebsiteWrite: (...args) => mockRequireWebsiteWrite(...args),
  requireWebsiteRead: jest.fn(),
  bookingReadiness: jest.fn(),
}));

const handler = require('../api/websites');
const WS = '123e4567-e89b-12d3-a456-426614174000';

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function request(overrides = {}) {
  return { method: 'POST', headers: {}, body: {
    workspaceId: WS, name: 'Client Website', templateName: 'editorial-luxe',
    primaryDomain: 'client.example.com', paymentMode: 'customer_choice', ...overrides,
  } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireWebsiteWrite.mockResolvedValue({ role: 'editor' });
  mockRequireActiveWorkspace.mockResolvedValue({ status: 'active' });
});

test('creates a booking-first website only through the atomic RPC', async () => {
  const rpc = jest.fn().mockResolvedValue({ data: 'site-id', error: null });
  mockRequireAuth.mockResolvedValue({ user: { id: 'user-id' }, supabase: { rpc } });
  const res = response();
  await handler(request(), res);
  expect(res.statusCode).toBe(201);
  expect(rpc).toHaveBeenCalledWith('create_booking_first_website', expect.objectContaining({
    p_workspace_id: WS, p_primary_domain: 'client.example.com', p_payment_mode: 'customer_choice',
  }));
  expect(res.body.website).toEqual(expect.objectContaining({ bookingPath: '/book', bookingProvider: 'ks_os' }));
});

test('blocks site creation while a workspace is suspended', async () => {
  const rpc = jest.fn();
  mockRequireAuth.mockResolvedValue({ user: { id: 'user-id' }, supabase: { rpc } });
  mockRequireActiveWorkspace.mockResolvedValue({ error: { code: 'WORKSPACE_SUSPENDED', message: 'Workspace is suspended' }, status: 403 });
  const res = response();
  await handler(request(), res);
  expect(res.statusCode).toBe(403);
  expect(res.body.error.code).toBe('WORKSPACE_SUSPENDED');
  expect(rpc).not.toHaveBeenCalled();
});

test('rejects malformed domains before the database call', async () => {
  const rpc = jest.fn();
  mockRequireAuth.mockResolvedValue({ user: { id: 'user-id' }, supabase: { rpc } });
  const res = response();
  await handler(request({ primaryDomain: 'https://client.example.com/book' }), res);
  expect(res.statusCode).toBe(400);
  expect(rpc).not.toHaveBeenCalled();

  const anotherRes = response();
  await handler(request({ primaryDomain: 'client..example.com' }), anotherRes);
  expect(anotherRes.statusCode).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
