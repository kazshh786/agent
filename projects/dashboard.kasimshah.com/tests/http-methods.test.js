const healthRoute = require('../api/health');
const meRoute = require('../api/me');
const workspacesRoute = require('../api/workspaces');
const projectsRoute = require('../api/projects');
const compileRoute = require('../api/website-engine/compile');
const utils = require('../api/_utils');

jest.mock('../api/_utils', () => ({
  handleCors: jest.fn(() => false),
  errorResponse: jest.fn((res, status, code, message) => {
    res.status(status).json({ error: { code, message } });
  })
}));

describe('HTTP Methods Restrictions', () => {
  let req, res;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      end: jest.fn()
    };
    jest.clearAllMocks();
  });

  it('PUT on /api/health returns 405', async () => {
    req.method = 'PUT';
    await healthRoute(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(res.status).toHaveBeenCalledWith(405);
    expect(utils.errorResponse).toHaveBeenCalledWith(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed');
  });

  it('DELETE on /api/me returns 405', async () => {
    req.method = 'DELETE';
    await meRoute(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(res.status).toHaveBeenCalledWith(405);
    expect(utils.errorResponse).toHaveBeenCalledWith(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET is allowed');
  });

  it('PATCH on /api/workspaces returns 405', async () => {
    req.method = 'PATCH';
    await workspacesRoute(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET, POST');
    expect(res.status).toHaveBeenCalledWith(405);
    expect(utils.errorResponse).toHaveBeenCalledWith(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are allowed');
  });

  it('PUT on /api/projects returns 405', async () => {
    req.method = 'PUT';
    await projectsRoute(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET, POST');
    expect(res.status).toHaveBeenCalledWith(405);
    expect(utils.errorResponse).toHaveBeenCalledWith(res, 405, 'METHOD_NOT_ALLOWED', 'Only GET and POST are allowed');
  });

  it('GET on /api/website-engine/compile returns 405', async () => {
    req.method = 'GET';
    await compileRoute(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
    expect(res.status).toHaveBeenCalledWith(405);
    expect(utils.errorResponse).toHaveBeenCalledWith(res, 405, 'METHOD_NOT_ALLOWED', 'Only POST is allowed');
  });
});
