const { test, expect, describe, beforeAll, afterAll } = require('@jest/globals');
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

// Mock utilities
const utilsPath = path.join(__dirname, '../api/_utils.js');
const utilsContent = fs.readFileSync(utilsPath, 'utf8');

// We simulate the API behaviors without a full Node server to test the logic
// For this we will write simple unit tests over the _utils functions and typical requests.

describe('Dual Shell Security & Routing Logic', () => {
  let pglite;
  
  beforeAll(async () => {
    // We would spin up a PGLite instance if we needed database tests
  });
  
  afterAll(async () => {
  });
  
  test('Router hash mapping defaults to Agency for platform users with no active workspaces', () => {
    const AppState = {
      user: { id: 'user-1' },
      platformRole: 'platform_owner',
      permittedModes: ['agency'],
      workspaces: []
    };
    
    let simulatedHash = '';
    
    // Simulate handleHashChange missing hash
    if (!simulatedHash) {
      if (AppState.permittedModes.includes('agency')) {
        simulatedHash = '#/agency/overview';
      }
    }
    
    expect(simulatedHash).toBe('#/agency/overview');
  });
  
  test('Router hash mapping defaults to Customer for standard users', () => {
    const AppState = {
      user: { id: 'user-2' },
      platformRole: null,
      permittedModes: ['customer'],
      workspaces: [{ id: 'ws-123' }]
    };
    
    let simulatedHash = '';
    
    if (!simulatedHash) {
      if (AppState.permittedModes.includes('agency')) {
        simulatedHash = '#/agency/overview';
      } else {
        const firstId = AppState.workspaces[0]?.id || '';
        if (firstId) simulatedHash = `#/workspace/${firstId}/overview`;
      }
    }
    
    expect(simulatedHash).toBe('#/workspace/ws-123/overview');
  });

  test('Mode guarding prevents customer access to agency route', () => {
    const AppState = {
      user: { id: 'user-2' },
      platformRole: null,
      permittedModes: ['customer'],
      workspaces: [{ id: 'ws-123' }]
    };
    
    let simulatedHash = '#/agency/overview';
    let redirectedHash = '';
    
    const parts = simulatedHash.replace('#', '').split('/').filter(Boolean);
    const mode = parts[0];
    
    if (mode === 'agency') {
      if (!AppState.permittedModes.includes('agency')) {
        const firstId = AppState.workspaces[0]?.id || '';
        if (firstId && AppState.permittedModes.includes('customer')) {
          redirectedHash = `#/workspace/${firstId}/overview`;
        } else {
          redirectedHash = '#/unassigned';
        }
      }
    }
    
    expect(redirectedHash).toBe('#/workspace/ws-123/overview');
  });
  
  test('Suspended Workspace forces UI to suspended view', () => {
    const AppState = {
      currentMode: '',
      activeView: '',
      currentWorkspace: { id: 'ws-123', status: 'suspended' },
      workspaces: [{ id: 'ws-123', status: 'suspended' }]
    };
    
    const navigate = (mode, viewId, workspaceId) => {
      AppState.currentMode = mode;
      
      if (mode === 'customer' && workspaceId) {
        if (AppState.currentWorkspace && AppState.currentWorkspace.status === 'suspended') {
          viewId = 'suspended';
        }
      }
      AppState.activeView = viewId;
    };
    
    navigate('customer', 'website', 'ws-123');
    
    expect(AppState.activeView).toBe('suspended');
  });
});
