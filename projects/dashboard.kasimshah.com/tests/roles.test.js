const { requireWorkspaceRole } = require('../api/_utils');

describe('Workspace Roles Middleware', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn()
    };
  });

  it('Owner can access owner-restricted operations', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { role: 'owner' }, error: null });
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', 'workspace-1', ['owner']);
    expect(result.member.role).toBe('owner');
  });

  it('Admin can access admin-restricted operations', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { role: 'admin' }, error: null });
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', 'workspace-1', ['owner', 'admin']);
    expect(result.member.role).toBe('admin');
  });

  it('Editor can access editor-restricted operations', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { role: 'editor' }, error: null });
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', 'workspace-1', ['owner', 'admin', 'editor']);
    expect(result.member.role).toBe('editor');
  });

  it('Viewer CANNOT write (rejected with 403)', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null });
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', 'workspace-1', ['owner', 'admin', 'editor']);
    expect(result.status).toBe(403);
    expect(result.error).toBe('FORBIDDEN');
  });

  it('Viewer CAN read', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null });
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', 'workspace-1', ['owner', 'admin', 'editor', 'viewer']);
    expect(result.member.role).toBe('viewer');
  });

  it('Editor CANNOT delete projects (rejected with 403)', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { role: 'editor' }, error: null });
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', 'workspace-1', ['owner', 'admin']);
    expect(result.status).toBe(403);
    expect(result.error).toBe('FORBIDDEN');
  });
});
