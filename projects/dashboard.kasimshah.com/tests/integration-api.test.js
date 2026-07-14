const mockRequireAuth = jest.fn();
const mockRequirePlatformRole = jest.fn();
const mockRequireWorkspaceRole = jest.fn();
const mockRequireEnabledModule = jest.fn();

jest.mock('../api/_utils.js', () => ({
  requireAuth: (...args) => mockRequireAuth(...args),
  requirePlatformRole: (...args) => mockRequirePlatformRole(...args),
  requireWorkspaceRole: (...args) => mockRequireWorkspaceRole(...args),
  requireEnabledModule: (...args) => mockRequireEnabledModule(...args),
  validateUUID: value => /^[0-9a-f-]{36}$/i.test(value || ''),
  rejectUnknownFields: (body, allowed) => ({ valid: Object.keys(body || {}).every(key => allowed.includes(key)) }),
  errorResponse: (res, status, code, message) => res.status(status).json({ error: { code, message } }),
  handleCors: () => false,
}));

const handler = require('../api/integrations');
const WS = '123e4567-e89b-12d3-a456-426614174000';
function response() { return { statusCode: 200, body: null, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

beforeEach(() => {
  jest.clearAllMocks();
  process.env.INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
});
afterAll(() => delete process.env.INTEGRATION_ENCRYPTION_KEY);

test('integration API encrypts credentials and queues an idempotent test', async () => {
  const rpc = jest.fn().mockResolvedValueOnce({ data: 'connection-id', error: null }).mockResolvedValueOnce({ data: 'job-id', error: null });
  mockRequireAuth.mockResolvedValue({ user: { id: 'platform-user' }, supabase: { rpc } });
  mockRequirePlatformRole.mockResolvedValue({ platformRole: 'platform_owner' });
  mockRequireEnabledModule.mockResolvedValue({ enabled: true });
  const res = response();
  await handler({ method: 'POST', headers: {}, body: {
    workspaceId: WS, provider: 'ks_os', displayName: 'KS OS', externalAccountId: 'tenant-1',
    configuration: {}, credentials: { serviceToken: 'raw-secret-token' }
  } }, res);
  expect(res.statusCode).toBe(202);
  const connectionArgs = rpc.mock.calls[0][1];
  expect(connectionArgs.p_ciphertext).not.toContain('raw-secret-token');
  expect(JSON.stringify(rpc.mock.calls)).not.toContain('raw-secret-token');
  expect(rpc.mock.calls[1][0]).toBe('enqueue_integration_job');
});

test('integration API rejects disabled modules and unsupported public configuration', async () => {
  mockRequireAuth.mockResolvedValue({ user: { id: 'platform-user' }, supabase: {} });
  mockRequirePlatformRole.mockResolvedValue({ platformRole: 'platform_owner' });
  mockRequireEnabledModule.mockResolvedValue({ error: { code: 'MODULE_DISABLED' }, status: 403 });
  let res = response();
  const request = { method: 'POST', headers: {}, body: { workspaceId: WS, provider: 'ks_os', configuration: {}, credentials: { serviceToken: 'long-secret-token' } } };
  await handler(request, res);
  expect(res.body.error.code).toBe('MODULE_DISABLED');

  mockRequireEnabledModule.mockResolvedValue({ enabled: true });
  res = response();
  await handler({ ...request, body: { ...request.body, configuration: { serviceToken: 'must-not-be-public' } } }, res);
  expect(res.body.error.code).toBe('INVALID_CONFIGURATION');
});

test('integration API denies users without platform or workspace management roles', async () => {
  mockRequireAuth.mockResolvedValue({ user: { id: 'viewer' }, supabase: {} });
  mockRequirePlatformRole.mockResolvedValue({ error: 'FORBIDDEN', status: 403 });
  mockRequireWorkspaceRole.mockResolvedValue({ error: { code: 'FORBIDDEN' }, status: 403 });
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { workspaceId: WS } }, res);
  expect(res.statusCode).toBe(403);
});
