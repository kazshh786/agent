const healthRoute = require('../api/health');
const meRoute = require('../api/me');
const utils = require('../api/_utils');

jest.mock('../api/_utils', () => ({
  createSupabaseServerClient: jest.fn(),
  createSupabaseServiceClient: jest.fn(),
  requireAuth: jest.fn(),
  requireWorkspaceMember: jest.fn(),
  requireWorkspaceRole: jest.fn(),
  validateBody: jest.fn(),
  writeAuditLog: jest.fn(),
  errorResponse: jest.fn((res, status, code, message) => res.status(status).json({ error: { code, message } })),
  generateCorrelationId: jest.fn(() => 'test-id'),
  handleCors: jest.fn(() => false)
}));

describe('API Routes', () => {
  let req, res;
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    req = { method: 'GET', headers: {}, body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      end: jest.fn()
    };
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('GET /api/health', () => {
    it('returns component status', async () => {
      process.env.WEBSITE_ENGINE_API_URL = 'http://test-engine';
      process.env.WEBSITE_ENGINE_API_TOKEN = 'engine-secret';
      process.env.WEBSITE_ENGINE_VERCEL_BYPASS_TOKEN = 'preview-bypass';
      process.env.KS_OS_API_URL = 'https://ks-os.example.com';
      process.env.KS_OS_SERVICE_TOKEN = 'ks-os-secret';
      process.env.KS_OS_VERCEL_BYPASS_TOKEN = 'ks-os-preview-bypass';
      // Mock service client
      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null })
      };
      utils.createSupabaseServiceClient.mockReturnValue(mockSupabase);
      
      // Mock global fetch for website engine check
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      await healthRoute(req, res);
      
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        status: 'healthy',
        components: expect.objectContaining({
          api: 'healthy',
          database: 'healthy',
          ksOS: 'healthy',
          websiteEngine: 'healthy'
        })
      }));
      expect(global.fetch).toHaveBeenCalledWith('http://test-engine/api/templates', expect.objectContaining({
        headers: {
          Authorization: 'Bearer engine-secret',
          'x-vercel-protection-bypass': 'preview-bypass'
        }
      }));
      expect(global.fetch).toHaveBeenCalledWith('https://ks-os.example.com/api/v1/service/health', expect.objectContaining({
        headers: {
          Authorization: 'Bearer ks-os-secret',
          'x-vercel-protection-bypass': 'ks-os-preview-bypass'
        }
      }));
    });
  });

  describe('GET /api/me', () => {
    it('requires auth and returns user profile', async () => {
      const mockUser = { id: 'u1', email: 'test@test.com' };
      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'u1', email: 'test@test.com', full_name: 'Test' } })
      };
      
      utils.requireAuth.mockResolvedValue({ user: mockUser, supabase: mockSupabase });
      
      // Also mock workspace fetch which uses eq
      mockSupabase.eq = jest.fn((field, val) => {
        if (field === 'id') return { single: jest.fn().mockResolvedValue({ data: { id: 'u1', email: 'test@test.com', full_name: 'Test' } }) };
        if (field === 'user_id') {
          // Could be for workspace_members (no single) or platform_users (with single)
          // We will return an object that acts as a promise (for workspace_members) AND has a single() method.
          const res = { data: [], error: null };
          res.single = jest.fn().mockResolvedValue({ data: null, error: null });
          res.then = (onFulfilled) => Promise.resolve({ data: [], error: null }).then(onFulfilled);
          return res;
        }
      });

      await meRoute(req, res);
      
      expect(utils.requireAuth).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        user: expect.objectContaining({ email: 'test@test.com' })
      }));
    });
  });
});
