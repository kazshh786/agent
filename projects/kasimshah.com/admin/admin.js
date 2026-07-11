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

        <div class="project-actions" style="display: flex; gap: 8px;">
          <a href="editor.html?project=${encodeURIComponent(proj.name)}" class="btn btn-primary" style="flex: 1; text-align: center; text-transform: uppercase; font-size: 0.8rem; padding: 10px 16px;">
            Visual Editor
          </a>
          <a href="/projects/${encodeURIComponent(proj.name)}/index.html" target="_blank" class="btn btn-secondary" title="View live draft site" style="font-size: 0.8rem; padding: 10px 16px;">
            Launch ↗
          </a>
          ${proj.name.toLowerCase() !== 'kasimshah.com' ? `
            <button class="btn btn-secondary btn-delete" data-project="${proj.name}" title="Delete site and start again" style="color: #cf6679; border-color: rgba(207, 102, 121, 0.3); font-size: 0.8rem; padding: 10px 16px;">
              Delete
            </button>
          ` : ''}
        </div>
      `;
      grid.appendChild(card);
    });

  } catch (err) {
    grid.innerHTML = `<div style="color: var(--color-error); font-weight: 500;">Failed to fetch active instances: ${err.message}. Please verify the Express API server is active on terminal.</div>`;
    showToast('Failed to load websites catalog.', 'error');
  }
}

// Fetch and load templates list from templates/ folder
async function loadTemplates() {
  const select = document.getElementById('newProjTemplate');
  if (!select) return;

  try {
    const res = await fetch(`${API_BASE}/api/templates`);
    if (!res.ok) throw new Error('Failed to fetch templates');
    const templates = await res.json();
    
    select.innerHTML = '';
    templates.forEach((tpl) => {
      const opt = document.createElement('option');
      opt.value = tpl;
      // Format display name: editorial-luxe -> Editorial Luxe
      const displayName = tpl.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      opt.innerText = displayName;
      select.appendChild(opt);
    });
  } catch (e) {
    console.error('Error loading templates', e);
    // Add default fallback
    select.innerHTML = '<option value="editorial-luxe">Editorial Luxe</option>';
  }
}

// Reload templates options list dynamically
async function reloadTemplatesList() {
  showToast('Scanning templates folder for new themes...', 'info');
  await loadTemplates();
  showToast('Template options list updated!', 'success');
}

// Add dynamic service input field
function addServiceInput() {
  const container = document.getElementById('servicesInputsContainer');
  const div = document.createElement('div');
  div.style.display = 'flex';
  div.style.gap = '8px';
  div.innerHTML = `
    <input type="text" class="form-control service-name-input" placeholder="e.g. Root Canal Treatment" required>
    <button type="button" class="btn btn-secondary" onclick="this.parentElement.remove()" style="min-height:42px; padding: 0 16px; color: var(--color-error); border-color: var(--color-error);">&times;</button>
  `;
  container.appendChild(div);
}

// Helper: Read file input as base64 string
function readFileAsBase64(fileInput) {
  return new Promise((resolve) => {
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      resolve(null);
      return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

// Handle Modal Actions
function toggleCreateModal(show = true) {
  const modal = document.getElementById('createModal');
  if (modal) {
    modal.style.display = show ? 'flex' : 'none';
    if (show) {
      loadTemplates();
    }
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
  const templateName = document.getElementById('newProjTemplate').value;
  const industry = document.getElementById('newProjIndustry').value;
  const bottleneck = document.getElementById('newProjBottleneck').value;
  const bookingLink = document.getElementById('newProjBookingLink').value.trim();
  const pageSize = document.getElementById('newProjPageSize').value;
  const brandColor = document.getElementById('newProjColor').value;
  const vibe = document.getElementById('newProjVibe').value;
  const tone = document.getElementById('newProjTone').value;
  const logoText = document.getElementById('newProjLogoText').value.trim();

  // Read images as base64
  const logoImgInput = document.getElementById('newProjLogoImg');
  const heroImgInput = document.getElementById('newProjHeroImg');

  // Gather services from dynamic input list
  const services = [];
  document.querySelectorAll('.service-name-input').forEach((input) => {
    const val = input.value.trim();
    if (val) services.push(val);
  });

  try {
    const logoImgBase64 = await readFileAsBase64(logoImgInput);
    const heroImgBase64 = await readFileAsBase64(heroImgInput);

    const response = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        templateName,
        industry,
        bottleneck,
        bookingLink,
        pageSize,
        salesProcess: 'diary_booking', // Bound from previous requirements
        brandColor,
        vibe,
        tone,
        logoText,
        logoImg: logoImgBase64,
        heroImg: heroImgBase64,
        services,
        goals: [
          `Frictionless booking flow targeting the ${bottleneck} bottleneck.`,
          `High-conversion ${vibe} framework optimized for ${industry} services.`,
          `Value-stack architecture written in a ${tone} copywriting tone.`
        ]
      })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to generate website');

    showToast(`Successfully spun up '${name}' website!`, 'success');
    toggleCreateModal(false);
    
    // Reset form & services container
    document.getElementById('createWebsiteForm').reset();
    document.getElementById('servicesInputsContainer').innerHTML = `
      <div style="display: flex; gap: 8px;">
        <input type="text" class="form-control service-name-input" placeholder="e.g. Dental Implants" required>
        <button type="button" class="btn btn-secondary" onclick="this.parentElement.remove()" style="min-height:42px; padding: 0 16px; color: var(--color-error); border-color: var(--color-error);">&times;</button>
      </div>
    `;
    
    // Reload website list
    loadProjects();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.innerText = originalText;
    submitBtn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadProjects();

  const grid = document.getElementById('projectsGrid');
  if (grid) {
    grid.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.btn-delete');
      if (!deleteBtn) return;

      const projectName = deleteBtn.getAttribute('data-project');
      if (!projectName) return;

      const confirmed = confirm(`Are you sure you want to permanently delete the website project "${projectName}"? This will delete all its HTML files, styles, and configurations so you can start again. This action cannot be undone.`);
      if (!confirmed) return;

      deleteBtn.disabled = true;
      deleteBtn.innerText = 'Deleting...';

      try {
        const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(projectName)}`, {
          method: 'DELETE'
        });
        const data = await res.json();

        if (res.ok && data.success) {
          showToast(`Website "${projectName}" deleted successfully.`, 'success');
          await loadProjects();
        } else {
          throw new Error(data.error || 'Failed to delete project');
        }
      } catch (err) {
        showToast(err.message, 'error');
        deleteBtn.disabled = false;
        deleteBtn.innerText = 'Delete';
      }
    });
  }

  const openBtn = document.getElementById('openCreateModalBtn');
  const closeBtn = document.getElementById('closeCreateModalBtn');
  const cancelBtn = document.getElementById('cancelCreateModalBtn');
  const form = document.getElementById('createWebsiteForm');

  if (openBtn) openBtn.addEventListener('click', () => {
    toggleCreateModal(true);
    // Reset preview to default on open
    updateThemePreviewImage('Luxury/Editorial');
  });
  if (closeBtn) closeBtn.addEventListener('click', () => toggleCreateModal(false));
  if (cancelBtn) cancelBtn.addEventListener('click', () => toggleCreateModal(false));
  if (form) form.addEventListener('submit', handleCreateWebsite);
});

// Update the theme preview graphic based on chosen Vibe selector
function updateThemePreviewImage(vibeValue) {
  const img = document.getElementById('themeVibePreviewImg');
  if (!img) return;

  img.style.opacity = '0.3';
  setTimeout(() => {
    if (vibeValue === 'Luxury/Editorial') {
      img.src = 'editorial_luxe_preview.jpg';
      img.alt = 'Editorial Luxe Preview';
    } else if (vibeValue === 'Tech Sleek') {
      img.src = 'tech_sleek_preview.jpg';
      img.alt = 'Tech Sleek Preview';
    } else if (vibeValue === 'Boutique Warm') {
      img.src = 'boutique_warm_preview.jpg';
      img.alt = 'Boutique Warm Preview';
    }
    img.style.opacity = '1';
  }, 150);
}
