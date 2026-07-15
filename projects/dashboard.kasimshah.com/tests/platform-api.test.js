const meRoute = require('../api/platform/me');
const workspacesListRoute = require('../api/platform/workspaces');
const workspacesIdRoute = require('../api/platform/workspaces/[id]');
const utils = require('../api/_utils');

jest.mock('../api/_utils', () => ({
  requireAuth: jest.fn(),
  requirePlatformRole: jest.fn(),
  validateBody: jest.fn(),
  validateUUID: jest.fn(),
  rejectUnknownFields: jest.fn(),
  errorResponse: jest.fn((res, status, code, message) => res.status(status).json({ error: { code, message } })),
  handleCors: jest.fn(() => false)
}));

describe('Platform API Routes', () => {
  let req, res;
  
  beforeEach(() => {
    req = { method: 'GET', query: {}, body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn()
    };
    jest.clearAllMocks();
    utils.validateUUID.mockReturnValue(true);
    utils.validateBody.mockReturnValue({ valid: true });
    utils.rejectUnknownFields.mockReturnValue({ valid: true });
  });

  describe('GET /api/platform/me', () => {
    it('returns 401 unauthenticated', async () => {
      utils.requireAuth.mockResolvedValue({ error: 'UNAUTHORIZED', status: 401 });
      await meRoute(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('PATCH /api/platform/workspaces/[id]', () => {
    const mockSupabase = {
      rpc: jest.fn()
    };

    beforeEach(() => {
      req.method = 'PATCH';
      req.query.id = 'workspace-123';
      req.body.action = 'activate';
      utils.requireAuth.mockResolvedValue({ user: { id: 'u1' }, supabase: mockSupabase });
    });

    it('customer -> 403', async () => {
      utils.requirePlatformRole.mockResolvedValue({ error: 'FORBIDDEN', status: 403 });
      await workspacesIdRoute(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('invalid UUID -> 400', async () => {
      utils.validateUUID.mockReturnValue(false);
      await workspacesIdRoute(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('unknown request field -> 400', async () => {
      utils.requirePlatformRole.mockResolvedValue({ platformRole: 'platform_owner' });
      utils.rejectUnknownFields.mockReturnValue({ valid: false, unknown: ['foo'] });
      await workspacesIdRoute(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('admin archive -> 403', async () => {
      utils.requirePlatformRole.mockResolvedValue({ platformRole: 'platform_admin' });
      req.body.action = 'archive';
      await workspacesIdRoute(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: { code: 'FORBIDDEN', message: expect.any(String) } });
    });

    it('owner archive -> permitted', async () => {
      utils.requirePlatformRole.mockResolvedValue({ platformRole: 'platform_owner' });
      req.body.action = 'archive';
      mockSupabase.rpc.mockResolvedValue({ error: null });
      
      await workspacesIdRoute(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('archive_workspace', { p_workspace_id: 'workspace-123' });
    });

    it('invalid transition -> 409', async () => {
      utils.requirePlatformRole.mockResolvedValue({ platformRole: 'platform_admin' });
      req.body.action = 'activate';
      mockSupabase.rpc.mockResolvedValue({ error: { message: 'Cannot activate workspace with status: archived' } });
      
      await workspacesIdRoute(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: { code: 'INVALID_WORKSPACE_STATE', message: expect.any(String) } });
    });

    it('unexpected database failure -> 500', async () => {
      utils.requirePlatformRole.mockResolvedValue({ platformRole: 'platform_admin' });
      req.body.action = 'activate';
      mockSupabase.rpc.mockResolvedValue({ error: { message: 'Unknown connection error' } });
      
      await workspacesIdRoute(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /api/platform/workspaces', () => {
    const mockSupabase = {
      rpc: jest.fn(),
      from: jest.fn().mockReturnThis(),
      select: jest.fn()
    };

    beforeEach(() => {
      req.method = 'GET';
      utils.requireAuth.mockResolvedValue({ user: { id: 'u1' }, supabase: mockSupabase });
    });

    it('support list responses contain no sensitive fields', async () => {
      utils.requirePlatformRole.mockResolvedValue({ platformRole: 'platform_support' });
      mockSupabase.rpc.mockResolvedValue({
        data: [{ id: 'w1', name: 'WS1', slug: 'ws-1', module: 'website', enabled: true }]
      });

      await workspacesListRoute(req, res);
      
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_support_workspace_summaries');
      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0];
      const ws = data.workspaces[0];
      
      expect(ws).toHaveProperty('id', 'w1');
      expect(ws).not.toHaveProperty('metadata');
      expect(ws).not.toHaveProperty('customer_email');
      expect(ws.modules[0]).toHaveProperty('module', 'website');
    });
  });

  describe('POST /api/platform/workspaces', () => {
    const mockSupabase = { rpc: jest.fn() };

    beforeEach(() => {
      req.method = 'POST';
      req.body = {
        name: 'Bare Beauty',
        slug: 'bare-beauty',
        customer_name: 'Customer',
        customer_email: 'customer@example.com',
        modules: ['website', 'booking']
      };
      utils.requireAuth.mockResolvedValue({ user: { id: 'u1' }, supabase: mockSupabase });
      utils.requirePlatformRole.mockResolvedValue({ platformRole: 'platform_owner' });
    });

    it('maps the RPC already-taken exception to a safe 409 conflict', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Slug "bare-beauty" is already taken' } });

      await workspacesListRoute(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: 'CONFLICT', message: 'A workspace with this slug already exists' }
      });
    });
  });
});
