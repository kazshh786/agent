const { requireWorkspaceMember } = require('../api/_utils');

describe('Workspace Membership Middleware', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn()
    };
  });

  it('returns member when user is a workspace member', async () => {
    const mockMember = { role: 'admin' };
    mockSupabase.single.mockResolvedValueOnce({ data: mockMember, error: null });

    const result = await requireWorkspaceMember(mockSupabase, 'user-1', 'workspace-1');
    expect(result.member).toEqual(mockMember);
    expect(mockSupabase.from).toHaveBeenCalledWith('workspace_members');
  });

  it('returns 403 when user is NOT a member', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: new Error('Row not found') });

    const result = await requireWorkspaceMember(mockSupabase, 'user-1', 'workspace-2');
    expect(result.status).toBe(403);
    expect(result.error).toBe('FORBIDDEN');
  });

  it('returns 403 when workspace_id is missing/null', async () => {
    const result = await requireWorkspaceMember(mockSupabase, 'user-1', null);
    expect(result.status).toBe(403);
    expect(result.error).toBe('FORBIDDEN');
  });

  it('handles cross-workspace access rejection', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: null, error: new Error('Row not found') });

    const result = await requireWorkspaceMember(mockSupabase, 'user-1', 'workspace-b');
    expect(result.status).toBe(403);
    expect(result.error).toBe('FORBIDDEN');
  });
});
