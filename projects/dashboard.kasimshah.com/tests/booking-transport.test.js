const { callKsOs } = require('../api/_booking');

describe('KS OS staging transport', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' }),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    delete global.fetch;
  });

  test('adds the optional Vercel protection bypass without replacing KS OS auth', async () => {
    process.env.KS_OS_VERCEL_BYPASS_TOKEN = 'preview-bypass';

    const result = await callKsOs(
      { apiUrl: 'https://booking.example.com', serviceToken: 'service-secret' },
      '/api/v1/service/health'
    );

    expect(result).toEqual({ ok: true, status: 200, body: { status: 'ok' } });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://booking.example.com/api/v1/service/health',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer service-secret',
          'x-vercel-protection-bypass': 'preview-bypass',
        }),
      })
    );
  });

  test('does not send a bypass header when staging protection is disabled', async () => {
    delete process.env.KS_OS_VERCEL_BYPASS_TOKEN;

    await callKsOs(
      { apiUrl: 'https://booking.example.com', serviceToken: 'service-secret' },
      '/api/v1/service/health'
    );

    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer service-secret');
    expect(headers).not.toHaveProperty('x-vercel-protection-bypass');
  });
});
