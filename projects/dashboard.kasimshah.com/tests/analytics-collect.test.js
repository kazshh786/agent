const mockCreateServiceClient = jest.fn();

jest.mock('../api/_utils', () => ({
  createSupabaseServiceClient: (...args) => mockCreateServiceClient(...args),
  rejectUnknownFields: (body, allowed) => ({
    valid: Object.keys(body || {}).every(key => allowed.includes(key)),
  }),
  errorResponse: (res, status, code, message) => res.status(status).json({ error: { code, message } }),
}));

const collect = require('../api/analytics/collect');

const SITE_KEY = '10000000-0000-4000-8000-000000000001';
const EVENT_ID = '10000000-0000-4000-8000-000000000002';
const SESSION_ID = '10000000-0000-4000-8000-000000000003';

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

function serviceClient(insertError = null) {
  const insert = jest.fn().mockResolvedValue({ error: insertError });
  const single = jest.fn().mockResolvedValue({
    data: { id: 'site-id', workspace_id: 'workspace-id', primary_domain: 'client.example.com' },
    error: null,
  });
  const eq = jest.fn().mockReturnValue({ single });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn(table => table === 'website_sites' ? { select } : { insert });
  return { client: { from }, insert };
}

function validRequest(overrides = {}) {
  return {
    method: 'POST',
    headers: { origin: 'https://client.example.com', referer: 'https://client.example.com/book' },
    body: {
      siteKey: SITE_KEY,
      eventId: EVENT_ID,
      sessionId: SESSION_ID,
      eventName: 'booking_confirmed',
      occurredAt: new Date().toISOString(),
      path: '/book',
      ...overrides,
    },
  };
}

beforeEach(() => jest.clearAllMocks());

test('accepts a same-domain event and stores only allowlisted metadata', async () => {
  const db = serviceClient();
  mockCreateServiceClient.mockReturnValue(db.client);
  const res = response();
  await collect(validRequest({ metadata: { serviceId: 'svc-1', email: 'must-not-be-stored' } }), res);
  expect(res.statusCode).toBe(202);
  expect(res.headers['Access-Control-Allow-Origin']).toBe('https://client.example.com');
  expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({
    event_name: 'booking_confirmed', path: '/book', metadata: { serviceId: 'svc-1' },
  }));
  expect(JSON.stringify(db.insert.mock.calls)).not.toContain('must-not-be-stored');
});

test('rejects a forged site origin before writing', async () => {
  const db = serviceClient();
  mockCreateServiceClient.mockReturnValue(db.client);
  const res = response();
  const req = validRequest();
  req.headers.origin = 'https://attacker.example';
  await collect(req, res);
  expect(res.statusCode).toBe(403);
  expect(res.body.error.code).toBe('ORIGIN_DENIED');
  expect(db.insert).not.toHaveBeenCalled();
});

test('rejects query-bearing paths and unknown top-level fields', async () => {
  let db = serviceClient();
  mockCreateServiceClient.mockReturnValue(db.client);
  let res = response();
  await collect(validRequest({ path: '/book?email=private@example.com' }), res);
  expect(res.body.error.code).toBe('INVALID_PATH');

  db = serviceClient();
  mockCreateServiceClient.mockReturnValue(db.client);
  res = response();
  await collect(validRequest({ email: 'private@example.com' }), res);
  expect(res.body.error.code).toBe('INVALID_EVENT');
  expect(db.insert).not.toHaveBeenCalled();
});

test('treats a duplicate event id as an idempotent accepted delivery', async () => {
  const db = serviceClient({ code: '23505' });
  mockCreateServiceClient.mockReturnValue(db.client);
  const res = response();
  await collect(validRequest(), res);
  expect(res.statusCode).toBe(202);
  expect(res.body).toEqual({ accepted: true });
});
