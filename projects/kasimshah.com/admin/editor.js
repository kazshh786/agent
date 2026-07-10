/**
 * Kasim Shah Agency Control Panel - GUI Editor JS
 */

const API_BASE = ''; // Same-origin relative paths

let currentProject = '';
let currentPageFile = 'index.html';
let projectData = null;
let editableElementsMap = []; // Maps sidebar input ID to iframe elements

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
currentProject = urlParams.get('project');

if (!currentProject) {
  alert('No project specified. Redirecting back to dashboard.');
  window.location.href = 'index.html';
}

// Toast notification helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : '⚠️'}</span>
    <div>${message}</div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'all 0.5s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

// Switch Sidebar tabs
function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-btn-${tabName}`).classList.add('active');

  document.querySelectorAll('.tab-panel-section').forEach(panel => panel.style.display = 'none');
  document.getElementById(`panel-${tabName}`).style.display = 'block';

  // Load history log if tab is selected
  if (tabName === 'history') {
    loadVersionHistory();
  }
}

// Set iframe viewport simulation
function setViewport(size) {
  document.querySelectorAll('.viewport-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`viewport-${size}-btn`).classList.add('active');

  const wrapper = document.getElementById('previewIframeWrapper');
  wrapper.className = `preview-iframe-wrapper ${size}`;
}

// Load configurations and pages sitemap
async function initEditor() {
  document.getElementById('projectNameHeading').innerText = currentProject;
  document.getElementById('editor-project-badge').innerText = currentProject;

  try {
    const res = await fetch(`${API_BASE}/api/projects`);
    if (!res.ok) throw new Error('Failed to retrieve active projects');
    const projects = await res.json();
    
    projectData = projects.find(p => p.name === currentProject);
    if (!projectData) throw new Error(`Project ${currentProject} not found`);

    // Load sitemap
    renderSitemapList();

    // Load theme details in Sidebar Theme panel
    initThemePanel();

    // Load default page in preview
    loadPageInPreview(currentPageFile);

  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Render the pages catalog list inside Pages Tab
function renderSitemapList() {
  const container = document.getElementById('pagesTreeList');
  container.innerHTML = '';

  if (!projectData.pages || projectData.pages.length === 0) {
    container.innerHTML = '<div style="color: var(--color-muted); font-size: 0.9rem;">No sitemap entries.</div>';
    return;
  }

  projectData.pages.forEach((page) => {
    const div = document.createElement('div');
    div.className = `page-list-item ${page.file === currentPageFile ? 'active' : ''}`;
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="material-icons" style="font-size: 1.1rem; color: var(--color-accent);">article</span>
        <span>${page.name}</span>
      </div>
      <div class="meta-info">${page.file}</div>
    `;

    div.addEventListener('click', () => {
      document.querySelectorAll('.page-list-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      loadPageInPreview(page.file);
    });

    container.appendChild(div);
  });
}

// Initialise inputs inside branding/theme tab
function initThemePanel() {
  const theme = projectData.theme || {};
  const colors = theme.colors || {};
  const shapes = theme.shape_tokens || {};

  // Vibes
  if (theme.vibe) {
    document.getElementById('themeVibe').value = theme.vibe;
  }

  // Primary Accent Color Picker
  const accent = colors['--md-sys-color-primary'] || '#D4AF37';
  document.getElementById('themeAccentColor').value = accent;
  document.getElementById('hex-accent').innerText = accent.toUpperCase();

  // Background
  const bg = colors['--md-sys-color-background'] || '#0A0A0A';
  document.getElementById('themeBgColor').value = bg;
  document.getElementById('hex-bg').innerText = bg.toUpperCase();

  // Surface
  const surface = colors['--md-sys-color-surface'] || '#121212';
  document.getElementById('themeSurfaceColor').value = surface;
  document.getElementById('hex-surface').innerText = surface.toUpperCase();

  // Text
  const txt = colors['--md-sys-color-on-surface'] || '#F5F5F7';
  document.getElementById('themeTxtColor').value = txt;
  document.getElementById('hex-text').innerText = txt.toUpperCase();

  // Corner radius shape range slider
  const radius = shapes['--md-sys-shape-corner-medium'] || '0px';
  const pxVal = parseInt(radius) || 0;
  document.getElementById('themeRadiusRange').value = pxVal;
  updateRadiusLabel(pxVal);
}

// Update color value labels on theme inputs
function updateThemeColor(cssVar, colorVal) {
  let labelId = '';
  if (cssVar === '--md-sys-color-primary') labelId = 'hex-accent';
  if (cssVar === '--md-sys-color-background') labelId = 'hex-bg';
  if (cssVar === '--md-sys-color-surface') labelId = 'hex-surface';
  if (cssVar === '--md-sys-color-on-surface') labelId = 'hex-text';

  if (labelId) {
    document.getElementById(labelId).innerText = colorVal.toUpperCase();
  }

  // Live update theme inside Iframe preview document immediately
  const iframe = document.getElementById('previewIframe');
  const iframeDoc = iframe.contentWindow.document;
  if (iframeDoc && iframeDoc.documentElement) {
    iframeDoc.documentElement.style.setProperty(cssVar, colorVal);
    // Sync main design properties as well
    if (cssVar === '--md-sys-color-primary') iframeDoc.documentElement.style.setProperty('--color-accent', colorVal);
    if (cssVar === '--md-sys-color-background') iframeDoc.documentElement.style.setProperty('--color-primary', colorVal);
    if (cssVar === '--md-sys-color-on-surface') iframeDoc.documentElement.style.setProperty('--color-secondary', colorVal);
    if (cssVar === '--md-sys-color-surface') iframeDoc.documentElement.style.setProperty('--color-dark-surface', colorVal);
  }

  document.getElementById('statusIndicator').innerText = 'Unsaved changes in theme color.';
  document.getElementById('statusIndicator').style.color = 'var(--color-accent)';
}

// Handle Theme Vibe Select
function handleThemeVibeChange() {
  const vibe = document.getElementById('themeVibe').value;
  const radiusSlider = document.getElementById('themeRadiusRange');

  if (vibe === 'Luxury/Editorial') {
    radiusSlider.value = 0;
    handleRadiusChange(0);
  } else if (vibe === 'Tech Sleek') {
    radiusSlider.value = 8;
    handleRadiusChange(8);
  } else if (vibe === 'Boutique Warm') {
    radiusSlider.value = 16;
    handleRadiusChange(16);
  }
}

// Update Corner radius range details
function handleRadiusChange(radiusVal) {
  updateRadiusLabel(radiusVal);

  const iframe = document.getElementById('previewIframe');
  const iframeDoc = iframe.contentWindow.document;
  if (iframeDoc && iframeDoc.documentElement) {
    const pxStr = `${radiusVal}px`;
    const shapeTokens = [
      '--md-sys-shape-corner-extra-small',
      '--md-sys-shape-corner-small',
      '--md-sys-shape-corner-medium',
      '--md-sys-shape-corner-large',
      '--md-sys-shape-corner-extra-large'
    ];
    shapeTokens.forEach((token) => {
      iframeDoc.documentElement.style.setProperty(token, pxStr);
    });

    // Sync style.css radius overrides
    iframeDoc.documentElement.style.setProperty('--radius-sm', `${Math.min(radiusVal, 4)}px`);
    iframeDoc.documentElement.style.setProperty('--radius-md', `${radiusVal}px`);
    iframeDoc.documentElement.style.setProperty('--radius-lg', `${radiusVal * 2}px`);
  }

  document.getElementById('statusIndicator').innerText = 'Unsaved changes in theme shapes.';
  document.getElementById('statusIndicator').style.color = 'var(--color-accent)';
}

function updateRadiusLabel(val) {
  const label = document.getElementById('radiusLabel');
  if (val === 0) {
    label.innerText = '0px (Flat Square)';
  } else if (val <= 8) {
    label.innerText = `${val}px (Modern Sleek)`;
  } else if (val <= 16) {
    label.innerText = `${val}px (Soft Curved)`;
  } else {
    label.innerText = `${val}px (High Rounded)`;
  }
}

// Load a specific HTML page into iframe preview
function loadPageInPreview(file) {
  currentPageFile = file;
  document.getElementById('editingPageLabel').innerText = `Page: ${file}`;
  document.getElementById('canvasActivePageLabel').innerText = `${file} (Preview)`;
  
  // Set preview link
  document.getElementById('externalPreviewLink').href = `/projects/${currentProject}/${file}`;

  const iframe = document.getElementById('previewIframe');
  
  // Reset maps
  editableElementsMap = [];

  // Listen for DOM content load inside the iframe
  iframe.onload = () => {
    setupIframeVisualEditing();
  };

  iframe.src = `/projects/${currentProject}/${file}?t=${Date.now()}`;
}

// Set up event listeners and hover styles inside preview iframe
function setupIframeVisualEditing() {
  const iframe = document.getElementById('previewIframe');
  const iframeDoc = iframe.contentWindow.document;

  if (!iframeDoc) return;

  // 1. Inject visual helper CSS rules
  const helperStyle = iframeDoc.createElement('style');
  helperStyle.id = 'editor-helper-styles';
  helperStyle.innerHTML = `
    .editor-hover-outline {
      outline: 2px dashed rgba(212, 175, 55, 0.75) !important;
      outline-offset: -1px !important;
      cursor: pointer !important;
    }
    .editor-active-outline {
      outline: 2px solid #D4AF37 !important;
      outline-offset: -1px !important;
    }
  `;
  iframeDoc.head.appendChild(helperStyle);

  // 2. Discover and tag editable elements
  const inspectorForm = document.getElementById('inspectorFormContainer');
  inspectorForm.innerHTML = '';

  // Look for sections to structure our sidebar inspector accordion
  const sections = Array.from(iframeDoc.querySelectorAll('section, header, footer'));
  
  if (sections.length === 0) {
    // Fallback if there are no section tags (just container divs)
    sections.push(iframeDoc.body);
  }

  sections.forEach((section, secIdx) => {
    // Find all potential editable nodes inside this section
    const textNodes = Array.from(section.querySelectorAll('h1, h2, h3, h4, h5, h6, p, md-filled-button, md-outlined-button, md-text-button, a, img, .material-icons'));
    
    if (textNodes.length === 0) return;

    // Get a title for this section
    let sectionTitle = `Section ${secIdx + 1}`;
    if (section.tagName.toLowerCase() === 'header') sectionTitle = 'Header Area';
    else if (section.tagName.toLowerCase() === 'footer') sectionTitle = 'Footer Area';
    else if (section.id) sectionTitle = `Section (${section.id})`;
    else if (section.className) {
      // Pick first class that isn't general 'section'
      const customClass = section.className.replace('section', '').trim().split(' ')[0];
      if (customClass) sectionTitle = `${customClass.charAt(0).toUpperCase() + customClass.slice(1)} Section`;
    }

    // Create Accordion Container for this section
    const accItem = document.createElement('div');
    accItem.className = 'accordion-item';

    const accHeader = document.createElement('div');
    accHeader.className = 'accordion-header';
    accHeader.innerHTML = `
      <span>${sectionTitle}</span>
      <span class="material-icons" style="font-size: 1.15rem;">expand_more</span>
    `;

    const accContent = document.createElement('div');
    accContent.className = 'accordion-content active'; // Open by default

    accHeader.addEventListener('click', () => {
      accContent.classList.toggle('active');
      const icon = accHeader.querySelector('.material-icons');
      icon.innerText = accContent.classList.contains('active') ? 'expand_more' : 'chevron_right';
    });

    accItem.appendChild(accHeader);
    accItem.appendChild(accContent);
    inspectorForm.appendChild(accItem);

    // Track active nodes to filter child buttons to avoid double listing
    textNodes.forEach((node, nodeIdx) => {
      // Skip empty or purely layout containers
      if (node.tagName.toLowerCase() === 'a' && node.querySelector('md-filled-button, md-outlined-button')) {
        return; // Ignore raw container links that wrap custom buttons
      }

      const nodeTag = node.tagName.toLowerCase();
      const nodeText = node.innerText ? node.innerText.trim() : '';

      // Skip elements that are empty (excluding images)
      if (nodeTag !== 'img' && !nodeText && !node.classList.contains('material-icons')) return;

      const inputId = `input-sec-${secIdx}-node-${nodeIdx}`;
      
      // Store reference
      editableElementsMap.push({
        id: inputId,
        element: node
      });

      // Bind iframe DOM triggers to highlight matching sidebar inputs
      node.addEventListener('mouseover', (e) => {
        e.stopPropagation();
        if (!node.classList.contains('editor-active-outline')) {
          node.classList.add('editor-hover-outline');
        }
      });

      node.addEventListener('mouseout', (e) => {
        e.stopPropagation();
        node.classList.remove('editor-hover-outline');
      });

      node.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Remove outline on all other nodes
        iframeDoc.querySelectorAll('.editor-active-outline').forEach(el => el.classList.remove('editor-active-outline'));
        
        // Add outline to clicked node
        node.classList.add('editor-active-outline');

        // Focus matching input card in sidebar
        const sidebarInput = document.getElementById(inputId);
        if (sidebarInput) {
          switchTab('content');
          // Open parent accordion if closed
          accContent.classList.add('active');
          accHeader.querySelector('.material-icons').innerText = 'expand_more';
          
          // Container-bounded scrolling: scrolls ONLY the sidebar element, avoiding window jumps!
          setTimeout(() => {
            const container = document.getElementById('editorSidebarContent');
            const topPos = sidebarInput.offsetTop - container.offsetTop - (container.clientHeight / 2) + (sidebarInput.clientHeight / 2);
            container.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
            
            // Focus input without triggering default browser window shifts
            sidebarInput.focus({ preventScroll: true });
          }, 100);
        }
      });

      // Render the sidebar editing control form element
      const formGroup = document.createElement('div');
      formGroup.className = 'form-group';
      formGroup.style.marginBottom = '16px';

      // Hovering sidebar control card will temporarily outline the preview element
      formGroup.addEventListener('mouseenter', () => {
        node.classList.add('editor-hover-outline');
      });
      formGroup.addEventListener('mouseleave', () => {
        node.classList.remove('editor-hover-outline');
      });

      // Build control inputs based on tag type
      let inputHtml = '';
      let labelText = '';

      if (node.classList.contains('material-icons')) {
        labelText = `Icon (${nodeText})`;
        inputHtml = `
          <input type="text" id="${inputId}" class="form-control" value="${nodeText}">
        `;
      } 
      else if (nodeTag === 'img') {
        const imgSrc = node.getAttribute('src') || '';
        const imgAlt = node.getAttribute('alt') || '';
        labelText = `Image Asset`;
        inputHtml = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <input type="text" id="${inputId}" class="form-control" placeholder="Image source URL" value="${imgSrc}">
            <input type="text" id="${inputId}-alt" class="form-control" placeholder="Alt text description" value="${imgAlt}" style="font-size: 0.8rem; padding: 8px 12px;">
          </div>
        `;
      } 
      else if (nodeTag === 'md-filled-button' || nodeTag === 'md-outlined-button' || nodeTag === 'md-text-button' || nodeTag === 'a') {
        const linkHref = node.getAttribute('href') || node.getAttribute('onclick') || '';
        let cleanLink = linkHref;
        // Strip JS redirect wrappers e.g. window.location.href='about.html'
        if (cleanLink.includes("window.location.href='")) {
          cleanLink = cleanLink.split("window.location.href='")[1].replace("'", "");
        }

        labelText = `${node.tagName.replace('MD-', '').toUpperCase()} Button`;
        inputHtml = `
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <input type="text" id="${inputId}" class="form-control" value="${nodeText}">
            <input type="text" id="${inputId}-link" class="form-control" placeholder="Button link destination (href)" value="${cleanLink}" style="font-size: 0.8rem; padding: 8px 12px;">
          </div>
        `;
      } 
      else if (nodeTag === 'p') {
        labelText = 'Paragraph text';
        inputHtml = `
          <textarea id="${inputId}" class="form-control" rows="3" style="resize: vertical; font-family: var(--font-serif);">${nodeText}</textarea>
        `;
      } 
      else {
        // Headings h1-h6
        labelText = node.tagName.toUpperCase();
        inputHtml = `
          <input type="text" id="${inputId}" class="form-control" value="${nodeText}" style="font-family: var(--font-serif); font-weight: 500;">
        `;
      }

      formGroup.innerHTML = `
        <label style="font-size: 0.7rem; color: var(--color-accent); display: flex; justify-content: space-between;">
          <span>${labelText}</span>
          <span style="font-size: 0.65rem; color: var(--color-muted);">${nodeTag}</span>
        </label>
        ${inputHtml}
      `;

      accContent.appendChild(formGroup);

      // Bind input events to update visual preview iframe in real-time!
      const mainInput = formGroup.querySelector(`#${inputId}`);
      if (mainInput) {
        mainInput.addEventListener('input', () => {
          if (nodeTag === 'img') {
            node.setAttribute('src', mainInput.value);
          } else if (node.classList.contains('material-icons')) {
            node.innerText = mainInput.value;
          } else {
            // Button label or heading text
            node.innerText = mainInput.value;
          }
          document.getElementById('statusIndicator').innerText = 'Unsaved modifications on canvas.';
          document.getElementById('statusIndicator').style.color = 'var(--color-accent)';
        });
      }

      // Bind button link or image alt triggers
      const secondaryInput = formGroup.querySelector(`#${inputId}-link`) || formGroup.querySelector(`#${inputId}-alt`);
      if (secondaryInput) {
        secondaryInput.addEventListener('input', () => {
          if (nodeTag === 'img') {
            node.setAttribute('alt', secondaryInput.value);
          } else {
            const dest = secondaryInput.value;
            node.setAttribute('href', dest);
            // Sync click redirections
            if (node.hasAttribute('onclick')) {
              node.setAttribute('onclick', `window.location.href='${dest}'`);
            }
          }
          document.getElementById('statusIndicator').innerText = 'Unsaved modifications on canvas.';
          document.getElementById('statusIndicator').style.color = 'var(--color-accent)';
        });
      }

    });
  });
}

// Fetch and render backup list and Git commits
async function loadVersionHistory() {
  const backupsGrid = document.getElementById('localBackupsList');
  const commitsGrid = document.getElementById('gitCommitsList');
  
  backupsGrid.innerHTML = '<div style="color: var(--color-muted); font-size: 0.8rem; font-style: italic;">Retrieving backups catalog...</div>';
  commitsGrid.innerHTML = '<div style="color: var(--color-muted); font-size: 0.8rem; font-style: italic;">Loading git commits logs...</div>';

  try {
    const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/history?path=${encodeURIComponent(currentPageFile)}`);
    if (!res.ok) throw new Error('API server returned history error');
    
    const history = await res.json();

    // 1. Render Local Backups list
    backupsGrid.innerHTML = '';
    if (!history.backups || history.backups.length === 0) {
      backupsGrid.innerHTML = '<div style="color: var(--color-muted); font-size: 0.8rem; font-style: italic;">No previous backups recorded. Click "Save Page" to create one.</div>';
    } else {
      history.backups.forEach((b) => {
        const sizeKb = (b.size / 1024).toFixed(1);
        const card = document.createElement('div');
        card.style.background = 'var(--color-dark-card)';
        card.style.border = '1px solid var(--color-dark-border)';
        card.style.padding = '12px 16px';
        card.style.display = 'flex';
        card.style.justifyContent = 'space-between';
        card.style.alignItems = 'center';
        
        card.innerHTML = `
          <div>
            <div style="font-size: 0.8rem; font-weight: 600; color: var(--color-secondary);">${b.timestampLabel}</div>
            <div style="font-size: 0.7rem; color: var(--color-muted); margin-top: 2px;">File Size: ${sizeKb} KB</div>
          </div>
          <button class="btn btn-secondary" style="min-height: 34px; padding: 0 12px; font-size: 0.75rem; border-radius: 0px;" onclick="restoreVersion('${b.filename}')">
            Restore
          </button>
        `;
        backupsGrid.appendChild(card);
      });
    }

    // 2. Render Git Commits list
    commitsGrid.innerHTML = '';
    if (!history.gitCommits || history.gitCommits.length === 0) {
      commitsGrid.innerHTML = '<div style="color: var(--color-muted); font-size: 0.8rem; font-style: italic;">No Git commits indexed for this page yet.</div>';
    } else {
      history.gitCommits.forEach((c) => {
        const card = document.createElement('div');
        card.style.background = 'rgba(255, 255, 255, 0.02)';
        card.style.border = '1px solid var(--color-dark-border)';
        card.style.padding = '12px';
        card.style.borderRadius = '0px';

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--color-accent); font-weight: 600; margin-bottom: 4px; font-family: monospace;">
            <span>Commit: ${c.hash}</span>
            <span style="color: var(--color-muted); font-weight: normal;">${c.date}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--color-secondary); margin-bottom: 4px; font-weight: 500;">
            "${c.message}"
          </div>
          <div style="font-size: 0.7rem; color: var(--color-muted);">
            Committed by: ${c.author}
          </div>
        `;
        commitsGrid.appendChild(card);
      });
    }

  } catch (err) {
    backupsGrid.innerHTML = `<div style="color: var(--color-error); font-size: 0.8rem;">History failed: ${err.message}</div>`;
    commitsGrid.innerHTML = `<div style="color: var(--color-error); font-size: 0.8rem;">History failed: ${err.message}</div>`;
  }
}

// Restore active HTML page from backup file
async function restoreVersion(backupFile) {
  if (!confirm(`Warning: Are you sure you want to restore '${currentPageFile}' to the version '${backupFile}'? Unsaved canvas changes will be overwritten.`)) {
    return;
  }

  const statusEl = document.getElementById('statusIndicator');
  statusEl.innerText = 'Restoring file version from disk backup...';
  statusEl.style.color = 'var(--color-accent)';

  try {
    const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: currentPageFile,
        backupFile: backupFile
      })
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Failed to restore file');

    showToast(`Restored page '${currentPageFile}' successfully!`, 'success');
    statusEl.innerText = 'All modifications synced locally.';
    statusEl.style.color = 'var(--color-muted)';

    // Reload visual editor preview
    loadPageInPreview(currentPageFile);
    loadVersionHistory();

  } catch (err) {
    showToast(err.message, 'error');
    statusEl.innerText = 'Restore failed.';
    statusEl.style.color = 'var(--color-error)';
  }
}

// Trigger remote Git push on the server
async function pushToGit() {
  const btn = document.getElementById('btn-git-push');
  const origText = btn.innerHTML;
  btn.innerHTML = '<span class="material-icons" style="font-size: 1.05rem; animation: spin 1s linear infinite;">sync</span> Pushing...';
  btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/git-push`, {
      method: 'POST'
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Git push failed');

    showToast('Pushed committed visual changes to remote Git successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

// Open Add New Page dialog modal
function triggerAddPageModal() {
  document.getElementById('addPageModal').style.display = 'flex';
}

function closeAddPageModal() {
  document.getElementById('addPageModal').style.display = 'none';
  document.getElementById('addPageForm').reset();
}

// Create a new sitemap page
async function handleAddPage(e) {
  e.preventDefault();

  const title = document.getElementById('newPageTitle').value.trim();
  let file = document.getElementById('newPageFile').value.trim();

  if (!file.endsWith('.html')) {
    file += '.html';
  }

  const submitBtn = document.getElementById('submitNewPageBtn');
  submitBtn.innerText = 'Creating file...';
  submitBtn.disabled = true;

  try {
    // 1. Generate new page by cloning existing active page content (to inherit header/footer shells)
    const activeIframe = document.getElementById('previewIframe');
    const iframeDoc = activeIframe.contentWindow.document;

    // Clone the active DOM and clean it
    const docClone = iframeDoc.documentElement.cloneNode(true);
    const helperStyles = docClone.querySelector('#editor-helper-styles');
    if (helperStyles) helperStyles.remove();
    docClone.querySelectorAll('.editor-hover-outline').forEach(el => el.classList.remove('editor-hover-outline'));
    docClone.querySelectorAll('.editor-active-outline').forEach(el => el.classList.remove('editor-active-outline'));

    // Strip internal body content to make it a blank page wrapper, keeping header and footer
    const mainEl = docClone.querySelector('main');
    if (mainEl) {
      mainEl.innerHTML = `
        <section class="section">
          <div class="container" style="padding: 80px 32px; text-align: center;">
            <h1 class="font-serif" style="margin-bottom: 24px;">${title}</h1>
            <p style="color: var(--color-muted); max-width: 600px; margin: 0 auto;">New conversion page generated via Kasim Shah control panel GUI. Customize content elements using the editor pane.</p>
          </div>
        </section>
      `;
    }

    const compiledHtml = '<!DOCTYPE html>\n' + docClone.outerHTML;

    // Save page HTML file
    const resFile = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/file?path=${encodeURIComponent(file)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: compiledHtml })
    });

    if (!resFile.ok) throw new Error('Failed to write new HTML page file to project folder');

    // 2. Update sitemap.json
    const updatedPages = [...projectData.pages, { file, name: title }];
    const sitemapRaw = JSON.stringify({ pages: updatedPages }, null, 2);

    const resSitemap = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/file?path=sitemap.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: sitemapRaw })
    });

    if (!resSitemap.ok) throw new Error('Failed to update project sitemap configuration');

    // Update local state
    projectData.pages = updatedPages;
    showToast(`Page '${title}' generated successfully!`, 'success');
    closeAddPageModal();
    renderSitemapList();
    loadPageInPreview(file);

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    submitBtn.innerText = 'Add Page';
    submitBtn.disabled = false;
  }
}

// Save all theme and HTML page layouts back to disk
async function saveAllChanges() {
  const saveBtn = document.getElementById('btn-save-page');
  const statusEl = document.getElementById('statusIndicator');
  
  saveBtn.innerHTML = '<span class="material-icons" style="font-size: 1.05rem; animation: spin 1s linear infinite;">sync</span> Saving...';
  saveBtn.disabled = true;
  statusEl.innerText = 'Writing configurations and HTML assets to disk...';

  try {
    const iframe = document.getElementById('previewIframe');
    const iframeDoc = iframe.contentWindow.document;

    if (!iframeDoc) throw new Error('Unable to read visual preview canvas');

    // 1. Serialize HTML Page (Strips visual builder injected classes)
    const docClone = iframeDoc.documentElement.cloneNode(true);
    
    // Remove outlines
    docClone.querySelectorAll('.editor-hover-outline').forEach(el => el.classList.remove('editor-hover-outline'));
    docClone.querySelectorAll('.editor-active-outline').forEach(el => el.classList.remove('editor-active-outline'));
    
    // Remove editor script/style tags
    const helperStyle = docClone.querySelector('#editor-helper-styles');
    if (helperStyle) helperStyle.remove();

    const cleanHtml = '<!DOCTYPE html>\n' + docClone.outerHTML;

    // Send save file request
    const resHtml = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/file?path=${encodeURIComponent(currentPageFile)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: cleanHtml })
    });

    if (!resHtml.ok) throw new Error(`Failed to save HTML page '${currentPageFile}'`);

    // 2. Serialize Theme Configurations (colors, shapes, vibes)
    const vibe = document.getElementById('themeVibe').value;
    const accent = document.getElementById('themeAccentColor').value;
    const bg = document.getElementById('themeBgColor').value;
    const surface = document.getElementById('themeSurfaceColor').value;
    const txt = document.getElementById('themeTxtColor').value;
    const radius = `${document.getElementById('themeRadiusRange').value}px`;

    const themeConfig = {
      theme: {
        vibe: vibe,
        colors: {
          '--md-sys-color-primary': accent,
          '--md-sys-color-on-primary': bg === '#0A0A0A' || bg === '#0F0F10' ? '#0F0F10' : '#FFFFFF',
          '--md-sys-color-primary-container': surface,
          '--md-sys-color-on-primary-container': txt,
          '--md-sys-color-surface': surface,
          '--md-sys-color-on-surface': txt,
          '--md-sys-color-on-surface-variant': '#8E8E93',
          '--md-sys-color-outline': '#2C2C2E',
          '--md-sys-color-background': bg,
          '--md-sys-color-on-background': txt,
          '--md-sys-color-surface-container': surface,
          '--md-sys-color-surface-container-high': surface
        },
        shape_tokens: {
          '--md-sys-shape-corner-extra-small': radius,
          '--md-sys-shape-corner-small': radius,
          '--md-sys-shape-corner-medium': radius,
          '--md-sys-shape-corner-large': radius,
          '--md-sys-shape-corner-extra-large': radius
        },
        elevation_tokens: {
          '--md-sys-elevation-level-0': 'none',
          '--md-sys-elevation-level-1': 'none',
          '--md-sys-elevation-level-2': 'none',
          '--md-sys-elevation-level-3': 'none',
          '--md-sys-elevation-level-4': 'none',
          '--md-sys-elevation-level-5': 'none'
        }
      }
    };

    const resTheme = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/file?path=theme.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: JSON.stringify(themeConfig, null, 2) })
    });

    if (!resTheme.ok) throw new Error('Failed to update brand theme config files');

    // Update active memory
    projectData.theme = themeConfig.theme;

    showToast('Changes saved, Git committed, and backup generated!', 'success');
    statusEl.innerText = 'All modifications synced locally.';
    statusEl.style.color = 'var(--color-muted)';

    // Update Version History log tab if active
    loadVersionHistory();

  } catch (err) {
    showToast(err.message, 'error');
    statusEl.innerText = 'Failed to publish changes.';
    statusEl.style.color = 'var(--color-error)';
  } finally {
    saveBtn.innerHTML = '<span class="material-icons" style="font-size: 1.05rem;">save</span> Save Page';
    saveBtn.disabled = false;
  }
}

// Spin Animation Keyframes injection for Git Push Sync spinner
const style = document.createElement('style');
style.innerHTML = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// Initialise
document.addEventListener('DOMContentLoaded', () => {
  initEditor();
});
