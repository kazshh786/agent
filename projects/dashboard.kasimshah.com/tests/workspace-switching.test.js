const projectsRoute = require('../api/projects');
const utils = require('../api/_utils');

jest.mock('../api/_utils', () => ({
  createSupabaseServerClient: jest.fn(),
  requireAuth: jest.fn(),
  requireWorkspaceMember: jest.fn(),
  requireWorkspaceRole: jest.fn(),
  errorResponse: jest.fn((res, status, code, message) => res.status(status).json({ error: { code, message } })),
  handleCors: jest.fn(() => false)
}));

describe('Workspace Switching & Isolation', () => {
  let req, res;

  beforeEach(() => {
    req = { method: 'GET', headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      end: jest.fn()
    };
    jest.clearAllMocks();
  });

  it('User can only access workspaces they belong to', async () => {
    req.headers['x-workspace-id'] = 'ws-1';
    utils.requireAuth.mockResolvedValue({ user: { id: 'u1' }, supabase: {} });
    utils.requireWorkspaceMember.mockResolvedValue({ status: 403, error: 'FORBIDDEN' });

    await projectsRoute(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace' } });
  });

  it('Missing workspace ID returns error', async () => {
    utils.requireAuth.mockResolvedValue({ user: { id: 'u1' }, supabase: {} });
    
    await projectsRoute(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: { code: 'VALIDATION_ERROR', message: 'X-Workspace-Id header is required' } });
  });

  it('Valid workspace allows access and returns scoped data', async () => {
    req.headers['x-workspace-id'] = 'ws-1';
    
    const mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [{ id: 'proj1' }], error: null })
    };
    
    utils.requireAuth.mockResolvedValue({ user: { id: 'u1' }, supabase: mockSupabase });
    utils.requireWorkspaceMember.mockResolvedValue({ member: { role: 'admin' } });

    await projectsRoute(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ projects: [{ id: 'proj1' }] });
    // Verify query was scoped to workspace
    expect(mockSupabase.eq).toHaveBeenCalledWith('workspace_id', 'ws-1');
  });
});
