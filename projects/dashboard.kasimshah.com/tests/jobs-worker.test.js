const mockCreateClient = jest.fn();

jest.mock('../api/_utils', () => ({
  createSupabaseServiceClient: (...args) => mockCreateClient(...args),
  errorResponse: (res, status, code, message) => res.status(status).json({ error: { code, message } }),
}));
jest.mock('../api/_providers', () => ({ executeProviderJob: jest.fn() }));
jest.mock('../api/_crypto', () => ({ decryptCredentials: jest.fn() }));

const handler = require('../api/jobs/run');

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('integration job worker scheduling', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JOB_RUNNER_SECRET: 'j'.repeat(32),
      CRON_SECRET: 'c'.repeat(32),
    };
    mockCreateClient.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  test('accepts a Vercel GET cron authenticated with CRON_SECRET', async () => {
    const res = response();
    await handler({ method: 'GET', headers: { authorization: `Bearer ${'c'.repeat(32)}` } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ claimed: 0, outcomes: [] });
  });

  test('accepts a manual POST scheduler authenticated with JOB_RUNNER_SECRET', async () => {
    const res = response();
    await handler({ method: 'POST', headers: { authorization: `Bearer ${'j'.repeat(32)}` } }, res);
    expect(res.statusCode).toBe(200);
  });

  test('rejects unsupported methods and invalid credentials', async () => {
    let res = response();
    await handler({ method: 'PUT', headers: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, POST');

    res = response();
    await handler({ method: 'GET', headers: { authorization: 'Bearer wrong' } }, res);
    expect(res.statusCode).toBe(401);
  });
});
