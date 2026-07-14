const { requireAuth } = require('../api/_utils');
const { createClient } = require('@supabase/supabase-js');

// Mock supabase client
const mockSupabase = {
  auth: {
    getUser: jest.fn()
  }
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabase)
}));

describe('Auth Middleware', () => {
  let req;
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV, SUPABASE_URL: 'http://localhost', SUPABASE_ANON_KEY: 'test-key' };
    req = { headers: {} };
    jest.clearAllMocks();
  });
  
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns 401 when no Authorization header', async () => {
    const result = await requireAuth(req);
    expect(result.status).toBe(401);
    expect(result.error).toBe('UNAUTHORIZED');
  });

  it('returns 401 when token is invalid', async () => {
    req.headers.authorization = 'Bearer invalid_token';
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('Invalid JWT') });

    const result = await requireAuth(req);
    expect(result.status).toBe(401);
    expect(result.error).toBe('UNAUTHORIZED');
  });

  it('returns user object when token is valid', async () => {
    req.headers.authorization = 'Bearer valid_token';
    const mockUser = { id: 'user-1', email: 'test@example.com' };
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: mockUser }, error: null });

    const result = await requireAuth(req);
    expect(result.user).toEqual(mockUser);
    expect(result.supabase).toBeDefined();
  });

  it('handles expired session gracefully', async () => {
    req.headers.authorization = 'Bearer expired_token';
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('Session expired') });

    const result = await requireAuth(req);
    expect(result.status).toBe(401);
    expect(result.error).toBe('UNAUTHORIZED');
  });
});
