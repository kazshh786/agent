const compileRoute = require('../api/website-engine/compile');
const utils = require('../api/_utils');

jest.mock('../api/_utils', () => ({
  requireAuth: jest.fn(),
  requireWorkspaceRole: jest.fn(),
  validateBody: jest.fn(),
  writeAuditLog: jest.fn(),
  errorResponse: jest.fn((res, status, code, message) => res.status(status).json({ error: { code, message } })),
  generateCorrelationId: jest.fn(() => 'test-correlation-id'),
  handleCors: jest.fn(() => false)
}));

describe('Website Engine Proxy', () => {
  let req, res;
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    req = { 
      method: 'POST', 
      headers: { 'x-workspace-id': 'ws-1' },
      body: { projectName: 'test-project', templateName: 'luxe' } 
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      end: jest.fn()
    };
    
    utils.requireAuth.mockResolvedValue({ user: { id: 'u1' }, supabase: {} });
    utils.requireWorkspaceRole.mockResolvedValue({ member: { role: 'admin' } });
    utils.validateBody.mockReturnValue({ valid: true });
    
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('Returns 503 when WEBSITE_ENGINE_API_URL is not configured', async () => {
    delete process.env.WEBSITE_ENGINE_API_URL;
    process.env.WEBSITE_ENGINE_API_TOKEN = 'secret';
    
    await compileRoute(req, res);
    
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'ENGINE_UNAVAILABLE' })
    }));
  });

  it('Validates projectName format to prevent path traversal', async () => {
    process.env.WEBSITE_ENGINE_API_URL = 'http://engine';
    process.env.WEBSITE_ENGINE_API_TOKEN = 'secret';
    req.body.projectName = '../../etc/passwd';
    
    await compileRoute(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'VALIDATION_ERROR' })
    }));
  });

  it('Returns actual error when engine returns 4xx/5xx', async () => {
    process.env.WEBSITE_ENGINE_API_URL = 'http://engine';
    process.env.WEBSITE_ENGINE_API_TOKEN = 'secret';
    
    global.fetch.mockResolvedValue({
      ok: false,
      status: 422,
      json: jest.fn().mockResolvedValue({ error: 'Template not found' })
    });
    
    await compileRoute(req, res);
    
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'ENGINE_ERROR' })
    }));
  });

  it('Returns success when engine responds 200', async () => {
    process.env.WEBSITE_ENGINE_API_URL = 'http://engine';
    process.env.WEBSITE_ENGINE_API_TOKEN = 'secret';
    
    const mockResponse = { success: true, url: 'http://test.com' };
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(mockResponse)
    });
    
    await compileRoute(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockResponse);
  });
});
