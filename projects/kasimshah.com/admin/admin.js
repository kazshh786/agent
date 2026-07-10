/**
 * Kasim Shah Agency Control Panel - Dashboard JS
 */

const API_BASE = ''; // Same-origin relative paths

// Toast notification helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) {
    const div = document.createElement('div');
    div.id = 'toastContainer';
    div.className = 'toast-container';
    document.body.appendChild(div);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : '⚠️'}</span>
    <div>${message}</div>
  `;

  document.getElementById('toastContainer').appendChild(toast);

  // Auto-remove toast after 4 seconds
  setTimeout(() => {
    toast.style.transition = 'all 0.5s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// Fetch and render projects catalog
async function loadProjects() {
  const grid = document.getElementById('projectsGrid');
  if (!grid) return;

  grid.innerHTML = '<div style="color: var(--color-muted); font-family: var(--font-serif); font-style: italic;">Retrieving digital assets catalog...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/projects`);
    if (!res.ok) throw new Error('API server returned an error');
    
    const projects = await res.json();
    grid.innerHTML = '';

    if (projects.length === 0) {
      grid.innerHTML = '<div style="color: var(--color-muted); font-family: var(--font-serif); font-style: italic;">No custom websites registered in the control panel. Create one using the generator wizard above.</div>';
      return;
    }

    // Update global stat counters
    const activeCountEl = document.getElementById('statActiveCount');
    if (activeCountEl) activeCountEl.innerText = projects.length;

    projects.forEach((proj) => {
      const card = document.createElement('div');
      card.className = 'project-card';

      // Assemble theme preview colors
      const themeColors = proj.theme.colors || {};
      const accentColor = themeColors['--md-sys-color-primary'] || '#D4AF37';
      const bgColor = themeColors['--md-sys-color-background'] || '#0A0A0A';
      const surfaceColor = themeColors['--md-sys-color-surface'] || '#121212';
      const txtColor = themeColors['--md-sys-color-on-surface'] || '#F5F5F7';

      // Build pages HTML links preview
      const pagesCount = proj.pages ? proj.pages.length : 0;
      const vibe = proj.theme.vibe || 'High-Conversion';

      card.innerHTML = `
        <div class="project-meta">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <h3 class="project-title">${proj.name}</h3>
            <span class="badge" style="font-size: 0.65rem;">${vibe}</span>
          </div>
          <div class="project-desc">
            "${proj.clientData.industry || 'Bespoke Campaign Interface'}" &mdash; Solving ${proj.clientData.revenue_bottleneck || 'funnel leak'}
          </div>
          
          <div style="margin: 16px 0;">
            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--color-muted); margin-bottom: 6px; letter-spacing: 1px;">Branding Theme Preview</div>
            <div class="project-themes-preview">
              <span class="color-dot" style="background-color: ${accentColor};" title="Primary Accent (10%)"></span>
              <span class="color-dot" style="background-color: ${bgColor};" title="Canvas Background (60%)"></span>
              <span class="color-dot" style="background-color: ${surfaceColor};" title="Card Surface (30%)"></span>
              <span class="color-dot" style="background-color: ${txtColor};" title="Secondary Text"></span>
              <span style="font-size: 0.8rem; color: var(--color-muted); margin-left: 4px;">${accentColor}</span>
            </div>
          </div>
          
          <div style="font-size: 0.85rem; color: var(--color-muted);">
            Pages Index: <strong>${pagesCount} views</strong> | Status: <span style="color: var(--color-success);">● Operational</span>
          </div>
        </div>

        <div class="project-actions">
          <a href="editor.html?project=${encodeURIComponent(proj.name)}" class="btn btn-primary" style="flex: 1; text-align: center; text-transform: uppercase;">
            Visual Editor
          </a>
          <a href="/projects/${encodeURIComponent(proj.name)}/index.html" target="_blank" class="btn btn-secondary" title="View live draft site">
            Launch ↗
          </a>
        </div>
      `;
      grid.appendChild(card);
    });

  } catch (err) {
    grid.innerHTML = `<div style="color: var(--color-error); font-weight: 500;">Failed to fetch active instances: ${err.message}. Please verify the Express API server is active on terminal.</div>`;
    showToast('Failed to load websites catalog.', 'error');
  }
}

// Handle Modal Actions
function toggleCreateModal(show = true) {
  const modal = document.getElementById('createModal');
  if (modal) {
    modal.style.display = show ? 'flex' : 'none';
  }
}

// Submit website creation intake form
async function handleCreateWebsite(e) {
  e.preventDefault();

  const submitBtn = document.getElementById('submitNewProjBtn');
  const originalText = submitBtn.innerText;
  submitBtn.innerText = 'COMPILING WEB ENGINE RUNTIME...';
  submitBtn.disabled = true;

  const name = document.getElementById('newProjName').value.trim();
  const industry = document.getElementById('newProjIndustry').value;
  const bottleneck = document.getElementById('newProjBottleneck').value;
  const salesProcess = document.getElementById('newProjSalesProcess').value;
  const brandColor = document.getElementById('newProjColor').value;

  try {
    const response = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        industry,
        bottleneck,
        salesProcess,
        brandColor,
        goals: [
          `Frictionless booking flow targeting the ${bottleneck} bottleneck.`,
          `High-conversion editorial framework optimized for ${industry} services.`,
          `Value-stack architecture synchronized with a ${salesProcess === 'sales_call' ? 'discovery call' : 'direct diary reservation'} model.`
        ]
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to generate website');

    showToast(`Successfully spun up '${name}' website!`, 'success');
    toggleCreateModal(false);
    
    // Reset form
    document.getElementById('createWebsiteForm').reset();
    
    // Reload website list
    loadProjects();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.innerText = originalText;
    submitBtn.disabled = false;
  }
}

// Initial binding
document.addEventListener('DOMContentLoaded', () => {
  loadProjects();

  const openBtn = document.getElementById('openCreateModalBtn');
  const closeBtn = document.getElementById('closeCreateModalBtn');
  const cancelBtn = document.getElementById('cancelCreateModalBtn');
  const form = document.getElementById('createWebsiteForm');

  if (openBtn) openBtn.addEventListener('click', () => toggleCreateModal(true));
  if (closeBtn) closeBtn.addEventListener('click', () => toggleCreateModal(false));
  if (cancelBtn) cancelBtn.addEventListener('click', () => toggleCreateModal(false));
  if (form) form.addEventListener('submit', handleCreateWebsite);
});
