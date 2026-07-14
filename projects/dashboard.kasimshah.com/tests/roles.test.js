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
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', '123e4567-e89b-12d3-a456-426614174000', ['owner']);
    expect(result.role).toBe('owner');
  });

  it('Admin can access admin-restricted operations', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { role: 'admin' }, error: null });
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', '123e4567-e89b-12d3-a456-426614174000', ['owner', 'admin']);
    expect(result.role).toBe('admin');
  });

  it('Editor can access editor-restricted operations', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { role: 'editor' }, error: null });
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', '123e4567-e89b-12d3-a456-426614174000', ['owner', 'admin', 'editor']);
    expect(result.role).toBe('editor');
  });

  it('Viewer CANNOT write (rejected with 403)', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null });
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', '123e4567-e89b-12d3-a456-426614174000', ['owner', 'admin', 'editor']);
    expect(result.status).toBe(403);
    expect(result.error.code).toBe('FORBIDDEN');
  });

  it('Viewer CAN read', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null });
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', '123e4567-e89b-12d3-a456-426614174000', ['owner', 'admin', 'editor', 'viewer']);
    expect(result.role).toBe('viewer');
  });

  it('Editor CANNOT delete projects (rejected with 403)', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { role: 'editor' }, error: null });
    const result = await requireWorkspaceRole(mockSupabase, 'user-1', '123e4567-e89b-12d3-a456-426614174000', ['owner', 'admin']);
    expect(result.status).toBe(403);
    expect(result.error.code).toBe('FORBIDDEN');
  });
});
