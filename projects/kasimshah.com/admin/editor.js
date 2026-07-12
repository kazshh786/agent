/**
 * Kasim Shah Agency Control Panel - GUI Editor JS
 */

const API_BASE = ''; // Same-origin relative paths

let currentProject = '';
let currentPageFile = 'index.html';
let projectData = null;
let editableElementsMap = {}; // Maps sidebar input ID to iframe elements

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

  // Load history log or brief if selected
  if (tabName === 'history') {
    loadVersionHistory();
  } else if (tabName === 'brief' && currentProject) {
    loadClientBriefData();
  }
}

// Implement Data Synchronization Loops for client form management
async function loadClientBriefData() {
  try {
    const response = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/file?path=copy_brief.json`);
    if (response.ok) {
      const serverPayload = await response.json();
      document.getElementById('brief-biz-name').value = serverPayload.businessName || '';
      document.getElementById('brief-services').value = serverPayload.services || '';
      document.getElementById('brief-pain-points').value = serverPayload.painPoints || '';
      document.getElementById('brief-address').value = serverPayload.address || '';
      document.getElementById('brief-lat').value = serverPayload.geoCoordinates?.latitude || '';
      document.getElementById('brief-lon').value = serverPayload.geoCoordinates?.longitude || '';
      document.getElementById('brief-radius').value = serverPayload.serviceRadius || '';
      document.getElementById('brief-author').value = serverPayload.authorMeta || '';
      document.getElementById('brief-proof').value = serverPayload.provenTrackRecord || '';
    }
  } catch (err) {
    console.error("Dossier parsing connection reset:", err);
    showToast("Failed to sync brief data from server", "error");
  }
}

async function saveClientBrief(event) {
  event.preventDefault();
  const compiledBrief = {
    businessName: document.getElementById('brief-biz-name').value,
    services: document.getElementById('brief-services').value,
    painPoints: document.getElementById('brief-pain-points').value,
    address: document.getElementById('brief-address').value,
    geoCoordinates: {
      latitude: parseFloat(document.getElementById('brief-lat').value) || 0,
      longitude: parseFloat(document.getElementById('brief-lon').value) || 0
    },
    serviceRadius: document.getElementById('brief-radius').value,
    authorMeta: document.getElementById('brief-author').value,
    provenTrackRecord: document.getElementById('brief-proof').value
  };

  try {
    showToast("Saving and compiling strategy brief...", "info");
    const syncResponse = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/file?path=copy_brief.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: JSON.stringify(compiledBrief, null, 2) })
    });
    if (syncResponse.ok) {
      showToast("✨ Client Strategy Brief written and synced successfully!", "success");
    } else {
      throw new Error("Failed to save copy brief");
    }
  } catch (err) {
    console.error("Dossier writing pipeline failed:", err);
    showToast("System error tracking brief updates to server disk storage", "error");
  }
}

// Set iframe viewport simulation
function setViewport(size) {
  document.querySelectorAll('.viewport-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`viewport-${size}-btn`).classList.add('active');

  const wrapper = document.getElementById('previewIframeWrapper');
  wrapper.className = `preview-iframe-wrapper ${size}`;
}

// Refresh visual preview canvas iframe contents
function reloadPreviewCanvas() {
  const iframe = document.getElementById('previewIframe');
  if (iframe) {
    showToast('Reloading visual canvas...', 'info');
    iframe.contentWindow.location.reload();
  }
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

  // Load booking link
  const clientData = projectData.clientData || {};
  document.getElementById('editorBookingLink').value = clientData.booking_link || '';

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
  
  editableElementsMap = {};
  const toolbar = document.getElementById('floatingToolbar');
  if (toolbar) toolbar.style.display = 'none';

  // Listen for DOM content load inside the iframe
  iframe.onload = () => {
    setupIframeVisualEditing();
  };

  iframe.src = `/projects/${currentProject}/${file}?t=${Date.now()}`;
}

// Pre-process DOM: Wrap loose text node segments in generic span blocks
function wrapRawTextNodesInSpans(root) {
  const doc = root.ownerDocument;
  if (!doc) return;

  function walk(node) {
    if (!node || node.nodeType !== 1) return;

    const tag = node.tagName.toLowerCase();
    // Skip scripts, styles, metadata
    if (['script', 'style', 'iframe', 'select', 'head', 'noscript', 'option', 'textarea', 'input', 'meta', 'link'].includes(tag)) {
      return;
    }

    // Convert childNodes to array to prevent mutation issues
    const childNodes = Array.from(node.childNodes);
    let hasChildElements = false;
    for (let i = 0; i < childNodes.length; i++) {
      if (childNodes[i].nodeType === 1) {
        hasChildElements = true;
        break;
      }
    }

    if (hasChildElements) {
      childNodes.forEach(child => {
        if (child.nodeType === 3) { // TEXT_NODE
          const val = child.nodeValue;
          if (val && val.trim().length > 0) {
            const span = doc.createElement('span');
            span.className = 'editor-wrapped-text';
            span.textContent = val;
            node.replaceChild(span, child);
          }
        }
      });
    }

    // Process remaining children
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i]);
      }
    }
  }

  walk(root);
}

// Walk DOM tree recursively to find all text-containing nodes and images
function discoverEditableElements(root) {
  // First, check if the document contains any explicitly tagged data-editable elements
  const doc = root.ownerDocument || document;
  const hasTaggedElements = doc.querySelectorAll('[data-editable="true"]').length > 0;

  if (hasTaggedElements) {
    // If tagged, return only tagged elements, images, and material icons inside this root
    return Array.from(root.querySelectorAll('[data-editable="true"], img, .material-icons'));
  }

  // Fallback to recursive tree traversal for legacy or untagged pages
  const nodes = [];
  
  function walk(node) {
    if (!node || node.nodeType !== 1) return;

    const tag = node.tagName.toLowerCase();
    
    // Skip scripts, metadata, controls, templates, and injected editors
    if (['script', 'style', 'iframe', 'select', 'head', 'noscript', 'option', 'meta', 'link', 'textarea', 'input'].includes(tag) || node.id === 'editor-helper-styles') {
      return;
    }

    // Explicitly allow images
    if (tag === 'img') {
      nodes.push(node);
      return;
    }

    // Explicitly allow icons
    if (node.classList && node.classList.contains('material-icons')) {
      nodes.push(node);
      return;
    }

    // Check direct children for text node components
    let hasDirectText = false;
    if (node.childNodes && node.childNodes.length > 0) {
      for (let i = 0; i < node.childNodes.length; i++) {
        const child = node.childNodes[i];
        if (child.nodeType === 3) { // TEXT_NODE
          const val = child.nodeValue.trim();
          if (val.length > 0) {
            hasDirectText = true;
            break;
          }
        }
      }
    }

    const isStandardEditableTag = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'md-filled-button', 'md-outlined-button', 'md-text-button', 'li', 'span', 'small', 'label', 'td', 'th'].includes(tag);
    const isWrapper = ['body', 'section', 'main', 'header', 'footer', 'article', 'aside', 'div', 'ul', 'ol', 'table', 'tbody', 'thead', 'tr'].includes(tag);

    if (hasDirectText || (isStandardEditableTag && node.innerText && node.innerText.trim().length > 0)) {
      if (isWrapper) {
        // If it's a div/section wrapper, only edit it if it has no child headings, paragraphs, lists, etc.
        const hasSubLayout = node.querySelector('div, p, section, article, h1, h2, h3, h4, h5, h6, table, ul, ol, li, span, a, md-filled-button, md-outlined-button, md-text-button');
        if (!hasSubLayout) {
          nodes.push(node);
        }
      } else {
        nodes.push(node);
      }
    }

    // Process children
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i]);
      }
    }
  }

  walk(root);
  return nodes;
}

// Discovers top-level layout sections inside the iframe document
function getVisualSections(iframeDoc) {
  let sections = [];
  
  // Find main wrapper element or body
  const wrapper = iframeDoc.getElementById('wrapper') || iframeDoc.getElementById('app') || iframeDoc.querySelector('main') || iframeDoc.body;
  
  if (wrapper) {
    const children = Array.from(wrapper.children);
    children.forEach(child => {
      const tag = child.tagName.toLowerCase();
      // Skip non-layout script, style, meta tags
      if (['script', 'style', 'noscript', 'iframe', 'meta', 'link', 'textarea', 'input', 'select'].includes(tag)) return;
      sections.push(child);
    });
  }

  // Fallback to querySelectorAll if no children are found
  if (sections.length === 0) {
    sections = Array.from(iframeDoc.querySelectorAll('section, header, footer'));
  }
  
  return sections;
}

// Set up event listeners and hover styles inside preview iframe
function setupIframeVisualEditing() {
  const iframe = document.getElementById('previewIframe');
  const iframeDoc = iframe.contentWindow.document;

  if (!iframeDoc) return;

  // Pre-process DOM: Wrap loose text node segments in spans to ensure 100% click-to-edit canvas parity
  try {
    wrapRawTextNodesInSpans(iframeDoc.body);
  } catch (err) {
    console.error('Failed to pre-process iframe DOM text node wrappers', err);
  }

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
    [contenteditable="true"]:focus {
      outline: 2px solid #D4AF37 !important;
      outline-offset: -1px !important;
      background-color: rgba(212, 175, 55, 0.1) !important;
    }
  `;
  iframeDoc.head.appendChild(helperStyle);

  // 2. Discover and tag editable elements
  const inspectorForm = document.getElementById('inspectorFormContainer');
  inspectorForm.innerHTML = '';

  // Look for sections to structure our sidebar inspector accordion
  const sections = getVisualSections(iframeDoc);
  
  if (sections.length === 0) {
    // Fallback if there are no section tags (just container divs)
    sections.push(iframeDoc.body);
  }

  sections.forEach((section, secIdx) => {
    // Find all potential editable nodes inside this section
    const textNodes = discoverEditableElements(section);
    
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

    // Render Repeating Grid Cards Manager for Repeating Content (Services, FAQs, reviews)
    const isServices = section.className.toLowerCase().includes('services') || section.id.toLowerCase().includes('services');
    const isTestimonials = section.className.toLowerCase().includes('testimonials') || section.className.toLowerCase().includes('reviews') || section.id.toLowerCase().includes('testimonials') || section.id.toLowerCase().includes('reviews');
    const isFaq = section.className.toLowerCase().includes('faq') || section.id.toLowerCase().includes('faq');

    const repeatCards = Array.from(section.querySelectorAll('.service-card, .testimonial-card, .faq-item, .card, [class*="card"]'));

    if (repeatCards.length > 0 && (isServices || isTestimonials || isFaq)) {
      const repeaterContainer = document.createElement('div');
      repeaterContainer.className = 'repeating-items-container';
      
      repeatCards.forEach((cardNode, cardIdx) => {
        const cardTitle = `${isServices ? 'Service' : isTestimonials ? 'Review' : 'FAQ'} Card #${cardIdx + 1}`;
        const cardId = `repeating-sec-${secIdx}-card-${cardIdx}`;
        
        const cardTexts = Array.from(cardNode.querySelectorAll('h3, h4, h5, p, span.material-icons'));
        
        const cardItem = document.createElement('div');
        cardItem.className = 'repeating-item-card';
        
        let cardHtml = `
          <div class="repeating-item-card-header">
            <span>${cardTitle}</span>
            <button type="button" class="repeating-item-card-remove" onclick="removeRepeatingItem('${secIdx}', ${cardIdx})" style="background:transparent; border:none; color:var(--color-error); cursor:pointer; display:flex; align-items:center;" title="Delete Card">
              <span class="material-icons" style="font-size:1.05rem;">delete</span>
            </button>
          </div>
        `;
        
        cardTexts.forEach((tNode, tIdx) => {
          const tTag = tNode.tagName.toLowerCase();
          const tText = tNode.innerText ? tNode.innerText.trim() : '';
          const inpId = `${cardId}-text-${tIdx}`;
          
          editableElementsMap[inpId] = tNode;

          // Bind hover triggers to repeat card nodes
          tNode.addEventListener('mouseover', (e) => {
            e.stopPropagation();
            if (!tNode.classList.contains('editor-active-outline')) {
              tNode.classList.add('editor-hover-outline');
            }
          });
          
          tNode.addEventListener('mouseout', (e) => {
            e.stopPropagation();
            tNode.classList.remove('editor-hover-outline');
          });

          // Bind visual selection click triggers
          tNode.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Clear other outlines
            iframeDoc.querySelectorAll('.editor-active-outline').forEach(el => {
              el.classList.remove('editor-active-outline');
              el.contentEditable = "false";
            });

            tNode.classList.add('editor-active-outline');

            const isIcon = tNode.classList.contains('material-icons');
            if (!isIcon) {
              tNode.contentEditable = "true";
              tNode.focus();

              // Programmatically place blinking caret cursor at the end of the text
              try {
                const iframeWindow = iframe.contentWindow;
                const sel = iframeWindow.getSelection();
                const range = iframeDoc.createRange();
                range.selectNodeContents(tNode);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
              } catch (err) {
                console.error('Failed to set caret cursor on repeater', err);
              }

              // Sync text back to sidebar input in real-time
              tNode.addEventListener('input', () => {
                const sidebarInput = document.getElementById(inpId);
                if (sidebarInput) {
                  sidebarInput.value = tNode.innerText || tNode.textContent;
                }
                const statusEl = document.getElementById('editorStatusText');
                if (statusEl) {
                  statusEl.innerText = 'Page modified inline. Save pending...';
                  statusEl.style.color = 'var(--color-accent)';
                }
              });

              tNode.addEventListener('blur', () => {
                tNode.contentEditable = "false";
              }, { once: true });
            }

            // Sync with sidebar panel focus and scrolling
            const sidebarInput = document.getElementById(inpId);
            if (sidebarInput) {
              switchTab('content');
              // Make sure its parent accordion section is expanded
              accContent.style.display = 'block';
              accContent.classList.add('active');
              accHeader.querySelector('.material-icons').innerText = 'expand_more';

              setTimeout(() => {
                const container = document.getElementById('editorSidebarContent');
                const topPos = sidebarInput.offsetTop - container.offsetTop - (container.clientHeight / 2) + (sidebarInput.clientHeight / 2);
                container.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
                
                if (isIcon) {
                  sidebarInput.focus({ preventScroll: true });
                }
              }, 100);
            }

            showFloatingToolbar(tNode, inpId);
          });
          
          if (tNode.classList.contains('material-icons')) {
            cardHtml += `
              <div class="form-group" style="margin-bottom:6px;">
                <label style="font-size:0.65rem; color:var(--color-muted); display:block; margin-bottom:2px;">Icon Name</label>
                <input type="text" id="${inpId}" class="form-control" value="${tText}" style="font-size:0.75rem; padding:6px 10px; min-height:28px;" oninput="updateIconText('${inpId}', this.value)">
              </div>
            `;
          } else if (tTag === 'p') {
            cardHtml += `
              <div class="form-group" style="margin-bottom:6px;">
                <label style="font-size:0.65rem; color:var(--color-muted); display:block; margin-bottom:2px;">Description Copy</label>
                <textarea id="${inpId}" class="form-control" rows="2" style="font-size:0.75rem; padding:6px 10px; min-height:48px;" oninput="updateCardText('${inpId}', this.value)">${tText}</textarea>
              </div>
            `;
          } else {
            cardHtml += `
              <div class="form-group" style="margin-bottom:6px;">
                <label style="font-size:0.65rem; color:var(--color-muted); display:block; margin-bottom:2px;">Heading / Title</label>
                <input type="text" id="${inpId}" class="form-control" value="${tText}" style="font-size:0.75rem; padding:6px 10px; min-height:28px;" oninput="updateCardText('${inpId}', this.value)">
              </div>
            `;
          }
        });
        
        cardItem.innerHTML = cardHtml;
        repeaterContainer.appendChild(cardItem);
      });
      
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn btn-secondary';
      addBtn.style.width = '100%';
      addBtn.style.marginTop = '12px';
      addBtn.style.minHeight = '36px';
      addBtn.style.fontSize = '0.8rem';
      addBtn.innerHTML = `<span class="material-icons" style="font-size:0.95rem; vertical-align:middle; margin-right:4px;">add</span> Add Card Item`;
      addBtn.onclick = () => addRepeatingItem(secIdx);
      
      accContent.appendChild(repeaterContainer);
      accContent.appendChild(addBtn);
      return;
    }

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
      
      editableElementsMap[inputId] = node;

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
        
        // Remove outline and disable contenteditable on other active nodes
        iframeDoc.querySelectorAll('.editor-active-outline').forEach(el => {
          el.classList.remove('editor-active-outline');
          el.contentEditable = "false";
        });
        
        // Add outline to clicked node
        node.classList.add('editor-active-outline');

        const isIcon = node.classList.contains('material-icons');
        const isImg = node.tagName.toLowerCase() === 'img';
        
        if (!isIcon && !isImg) {
          node.contentEditable = "true";
          node.focus();

          // Programmatically place caret cursor at the end of the text
          try {
            const iframeWindow = iframe.contentWindow;
            const sel = iframeWindow.getSelection();
            const range = iframeDoc.createRange();
            range.selectNodeContents(node);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (err) {
            console.error('Failed to set caret cursor', err);
          }
          
          // Sync text back to sidebar input in real-time
          node.addEventListener('input', () => {
            const sidebarInput = document.getElementById(inputId);
            if (sidebarInput) {
              sidebarInput.value = node.innerText || node.textContent;
            }
            const statusEl = document.getElementById('editorStatusText');
            if (statusEl) {
              statusEl.innerText = 'Page modified inline. Save pending...';
              statusEl.style.color = 'var(--color-accent)';
            }
          });

          // Disable editing on blur
          node.addEventListener('blur', () => {
            node.contentEditable = "false";
          }, { once: true });
        }

        // Focus matching input card in sidebar
        const sidebarInput = document.getElementById(inputId);
        if (sidebarInput) {
          switchTab('content');
          accContent.classList.add('active');
          accHeader.querySelector('.material-icons').innerText = 'expand_more';
          
          setTimeout(() => {
            const container = document.getElementById('editorSidebarContent');
            const topPos = sidebarInput.offsetTop - container.offsetTop - (container.clientHeight / 2) + (sidebarInput.clientHeight / 2);
            container.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
            
            // Only focus sidebar input if it is an icon or image (to avoid stealing keyboard focus from inline cursor!)
            if (isIcon || isImg) {
              sidebarInput.focus({ preventScroll: true });
            }
          }, 100);
        }

        // Show absolute-positioned floating context toolbar
        showFloatingToolbar(node, inputId);
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

  // 3. Dismiss active visual selection outlines and hide toolbar on canvas background click
  iframeDoc.addEventListener('click', (e) => {
    if (!e.target.closest('h1, h2, h3, h4, h5, h6, p, md-filled-button, md-outlined-button, md-text-button, a, img, .material-icons')) {
      iframeDoc.querySelectorAll('.editor-active-outline').forEach(el => {
        el.classList.remove('editor-active-outline');
        el.contentEditable = "false";
      });
      const toolbar = document.getElementById('floatingToolbar');
      if (toolbar) toolbar.style.display = 'none';
    }
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
    docClone.querySelectorAll('.editor-hover-outline, .editor-active-outline, [contenteditable]').forEach(el => {
      el.classList.remove('editor-hover-outline', 'editor-active-outline');
      el.removeAttribute('contenteditable');
    });
    docClone.querySelectorAll('.editor-wrapped-text').forEach(span => {
      const textNode = docClone.createTextNode(span.textContent);
      span.parentNode.replaceChild(textNode, span);
    });

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
    
    // Remove outlines & contenteditables
    docClone.querySelectorAll('.editor-hover-outline, .editor-active-outline, [contenteditable]').forEach(el => {
      el.classList.remove('editor-hover-outline', 'editor-active-outline');
      el.removeAttribute('contenteditable');
    });
    
    // Remove editor script/style tags
    const helperStyle = docClone.querySelector('#editor-helper-styles');
    if (helperStyle) helperStyle.remove();

    // Unwrap visual text node wrapper spans
    docClone.querySelectorAll('.editor-wrapped-text').forEach(span => {
      const textNode = docClone.createTextNode(span.textContent);
      span.parentNode.replaceChild(textNode, span);
    });

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

// --- FLOATING CONTEXT TOOLBAR CONTROLLER & HELPER ACTIONS ---

function showFloatingToolbar(node, inputId) {
  const toolbar = document.getElementById('floatingToolbar');
  if (!toolbar) return;

  const nodeTag = node.tagName.toLowerCase();
  const isIcon = node.classList.contains('material-icons');
  const isImg = nodeTag === 'img';
  const isButton = nodeTag === 'md-filled-button' || nodeTag === 'md-outlined-button' || nodeTag === 'md-text-button' || nodeTag === 'a';

  let html = '';

  if (isImg) {
    const currentSrc = node.getAttribute('src') || '';
    const currentAlt = node.getAttribute('alt') || '';
    html = `
      <button class="floating-toolbar-btn" onclick="triggerFileInput('${inputId}')" title="Upload Local File">
        <span class="material-icons">upload_file</span>
      </button>
      <button class="floating-toolbar-btn" onclick="triggerAiImage('${inputId}')" title="✨ AI Generate/Stock Image">
        <span class="material-icons">auto_awesome</span>
      </button>
      <input type="text" class="floating-toolbar-input" id="toolbar-img-src" placeholder="Image URL..." value="${currentSrc}" style="width: 140px;" onchange="updateImageSrc('${inputId}', this.value)">
      <input type="text" class="floating-toolbar-input" id="toolbar-img-alt" placeholder="Alt text..." value="${currentAlt}" style="width: 90px;" onchange="updateImageAlt('${inputId}', this.value)">
    `;
  } else if (isIcon) {
    const iconName = node.innerText ? node.innerText.trim() : '';
    html = `
      <span style="font-size:0.75rem; color:var(--color-accent); font-weight:600; margin-right:4px;">Icon:</span>
      <input type="text" class="floating-toolbar-input" id="toolbar-icon-name" placeholder="Search icon..." value="${iconName}" style="width: 100px;" oninput="updateIconText('${inputId}', this.value)">
      <button class="floating-toolbar-btn" onclick="openIconSearch('${inputId}')" title="Browse Icon Set">
        <span class="material-icons">search</span>
      </button>
    `;
  } else {
    // Text elements & Link Buttons
    html = `
      <button class="floating-toolbar-btn" onclick="applyInlineStyle('bold')" title="Bold">
        <span class="material-icons">format_bold</span>
      </button>
      <button class="floating-toolbar-btn" onclick="applyInlineStyle('italic')" title="Italic">
        <span class="material-icons">format_italic</span>
      </button>
    `;

    if (isButton) {
      const linkHref = node.getAttribute('href') || node.getAttribute('onclick') || '';
      let cleanLink = linkHref;
      if (cleanLink.includes("window.location.href='")) {
        cleanLink = cleanLink.split("window.location.href='")[1].replace("'", "");
      }
      const isCustomLink = !['index.html', 'about.html', 'services.html', 'qualification.html', ''].includes(cleanLink);

      html += `
        <div class="floating-toolbar-divider"></div>
        <select class="floating-toolbar-input" onchange="updateButtonDest('${inputId}', this.value)" style="width: 100px;">
          <option value="">Link page...</option>
          <option value="index.html" ${cleanLink === 'index.html' ? 'selected' : ''}>Home Page</option>
          <option value="about.html" ${cleanLink === 'about.html' ? 'selected' : ''}>About Page</option>
          <option value="services.html" ${cleanLink === 'services.html' ? 'selected' : ''}>Services Page</option>
          <option value="qualification.html" ${cleanLink === 'qualification.html' ? 'selected' : ''}>Booking Form</option>
          <option value="custom" ${isCustomLink ? 'selected' : ''}>Custom URL...</option>
        </select>
        <input type="text" class="floating-toolbar-input" id="toolbar-custom-link" placeholder="Custom URL..." value="${cleanLink}" style="width: 110px; display: ${isCustomLink ? 'inline-block' : 'none'};" onchange="updateButtonDest('${inputId}', this.value)">
      `;
    }

    // AI Copywriter Integration
    html += `
      <div class="floating-toolbar-divider"></div>
      <button class="floating-toolbar-btn" onclick="toggleAiMenu()" title="✨ AI Copywriter" id="ai-assistant-btn" style="position: relative;">
        <span class="material-icons" style="color: #D4AF37;">auto_awesome</span>
      </button>
      <div id="aiToolbarDropdown" style="display: none; position: absolute; bottom: 100%; right: 0; margin-bottom: 6px; background-color: #161618; border: 1px solid #D4AF37; border-radius: 4px; padding: 4px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); z-index: 10002; flex-direction: column; width: 140px; gap: 2px;">
        <button class="tab-btn" style="text-align: left; font-size: 0.7rem; padding: 6px 10px; border-bottom: none; width: 100%; text-transform:none; letter-spacing:0;" onclick="triggerAiRewrite('${inputId}', 'Shorter')">Make Shorter</button>
        <button class="tab-btn" style="text-align: left; font-size: 0.7rem; padding: 6px 10px; border-bottom: none; width: 100%; text-transform:none; letter-spacing:0;" onclick="triggerAiRewrite('${inputId}', 'Longer')">Make Longer</button>
        <button class="tab-btn" style="text-align: left; font-size: 0.7rem; padding: 6px 10px; border-bottom: none; width: 100%; text-transform:none; letter-spacing:0;" onclick="triggerAiRewrite('${inputId}', 'More Luxury')">More Luxury</button>
        <button class="tab-btn" style="text-align: left; font-size: 0.7rem; padding: 6px 10px; border-bottom: none; width: 100%; text-transform:none; letter-spacing:0;" onclick="triggerAiRewrite('${inputId}', 'More Professional')">More Clinical/Pro</button>
        <button class="tab-btn" style="text-align: left; font-size: 0.7rem; padding: 6px 10px; border-bottom: none; width: 100%; text-transform:none; letter-spacing:0;" onclick="triggerAiRewrite('${inputId}', 'More Friendly')">More Friendly</button>
        <button class="tab-btn" style="text-align: left; font-size: 0.7rem; padding: 6px 10px; border-bottom: none; width: 100%; text-transform:none; letter-spacing:0;" onclick="triggerAiRewrite('${inputId}', 'Improve SEO Headline')">Improve SEO Copy</button>
      </div>
    `;
  }

  toolbar.innerHTML = html;

  const iframe = document.getElementById('previewIframe');
  const iframeRect = iframe.getBoundingClientRect();
  const rect = node.getBoundingClientRect();

  toolbar.style.opacity = '0';
  toolbar.style.display = 'flex';

  setTimeout(() => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    const topPos = rect.top + iframeRect.top + scrollTop - toolbar.offsetHeight - 10;
    const leftPos = rect.left + iframeRect.left + scrollLeft + (rect.width / 2) - (toolbar.offsetWidth / 2);

    toolbar.style.top = `${Math.max(10, topPos)}px`;
    toolbar.style.left = `${Math.max(10, leftPos)}px`;
    toolbar.style.opacity = '1';
  }, 0);
}

function triggerFileInput(inputId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      showToast('Uploading replacing image asset...', 'info');
      try {
        const filename = `images/img_${Date.now()}.${file.name.split('.').pop()}`;
        const res = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: filename, content: reader.result })
        });
        if (!res.ok) throw new Error('Failed to upload image file');

        const data = await res.json();
        const el = editableElementsMap[inputId];
        if (el) {
          el.setAttribute('src', data.url);
          const sidebarInp = document.getElementById(inputId);
          if (sidebarInp) sidebarInp.value = data.url;
        }

        showToast('Image replaced successfully!', 'success');
        if (el) showFloatingToolbar(el, inputId);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function triggerAiImage(inputId) {
  const promptText = prompt('Enter a prompt to search or generate image (e.g. dental clinic office interior, smiling client):');
  if (!promptText) return;

  showToast('Generating/Searching matching assets...', 'info');
  try {
    const res = await fetch(`${API_BASE}/api/ai/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText })
    });
    if (!res.ok) throw new Error('AI asset load error');
    const data = await res.json();

    const el = editableElementsMap[inputId];
    if (el) {
      el.setAttribute('src', data.url);
      const sidebarInp = document.getElementById(inputId);
      if (sidebarInp) sidebarInp.value = data.url;
      showFloatingToolbar(el, inputId);
    }
    showToast('AI Image applied successfully!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateImageSrc(inputId, val) {
  const el = editableElementsMap[inputId];
  if (el) {
    el.setAttribute('src', val);
    const sidebarInp = document.getElementById(inputId);
    if (sidebarInp) sidebarInp.value = val;
  }
}

function updateImageAlt(inputId, val) {
  const el = editableElementsMap[inputId];
  if (el) {
    el.setAttribute('alt', val);
    const sidebarAlt = document.getElementById(`${inputId}-alt`);
    if (sidebarAlt) sidebarAlt.value = val;
  }
}

function updateIconText(inputId, val) {
  const el = editableElementsMap[inputId];
  if (el) {
    el.innerText = val;
    const sidebarInp = document.getElementById(inputId);
    if (sidebarInp) sidebarInp.value = val;
  }
}

function openIconSearch(inputId) {
  const icon = prompt('Type any Material Icon name (e.g. speed, dental, medical, check, info, home):');
  if (icon) {
    updateIconText(inputId, icon.toLowerCase().trim());
  }
}

function updateButtonDest(inputId, val) {
  const customInput = document.getElementById('toolbar-custom-link');
  if (val === 'custom') {
    if (customInput) {
      customInput.style.display = 'inline-block';
      customInput.focus();
    }
    return;
  }

  const el = editableElementsMap[inputId];
  if (el) {
    let dest = val;
    if (val === 'qualification.html' && projectData.clientData && projectData.clientData.booking_link) {
      dest = projectData.clientData.booking_link;
    }

    if (el.hasAttribute('onclick')) {
      el.setAttribute('onclick', `window.location.href='${dest}'`);
    } else {
      el.setAttribute('href', dest);
    }

    const sidebarLink = document.getElementById(`${inputId}-link`);
    if (sidebarLink) sidebarLink.value = dest;
  }
}

function applyInlineStyle(cmd) {
  const iframe = document.getElementById('previewIframe');
  iframe.contentWindow.document.execCommand(cmd, false, null);
}

function toggleAiMenu() {
  const dropdown = document.getElementById('aiToolbarDropdown');
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
  }
}

async function triggerAiRewrite(inputId, commandName) {
  const dropdown = document.getElementById('aiToolbarDropdown');
  if (dropdown) dropdown.style.display = 'none';

  const el = editableElementsMap[inputId];
  if (!el) return;

  const originalText = el.innerText || el.textContent || '';
  const resolvedHtmlTagContext = el.tagName || 'P';
  
  // Extract max layout container bounds or calculate length safety bounds
  const spatialCeiling = parseInt(el.getAttribute('data-max-chars'), 10) || 
                          (originalText.length > 0 ? Math.ceil(originalText.length * 1.3) : 400);
  
  const referenceWordCountValue = originalText.split(/\s+/).filter(Boolean).length || 20;

  showToast(`Running conversion AI framework '${commandName}'...`, 'info');

  try {
    const res = await fetch(`${API_BASE}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: currentProject,
        styleAction: commandName,
        currentText: originalText,
        elementContext: resolvedHtmlTagContext,
        spatialGuardrails: {
          maxCharsAllowed: spatialCeiling,
          targetWordCount: referenceWordCountValue
        }
      })
    });
    if (!res.ok) throw new Error('AI service error');
    const data = await res.json();

    const outputText = data.compiledEliteText || data.text || '';
    el.innerText = outputText;

    // Synchronize title tag if rewriting H1
    if (resolvedHtmlTagContext === 'H1') {
      const iframe = document.getElementById('previewIframe');
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (iframeDoc) {
        const pageTitle = iframeDoc.querySelector('title');
        if (pageTitle) {
          pageTitle.innerText = `${outputText} | ${projectData ? projectData.client_name : currentProject}`;
        }
      }
    }

    const sidebarInp = document.getElementById(inputId);
    if (sidebarInp) sidebarInp.value = outputText;

    showToast('AI copywriting generated and applied!', 'success');
    showFloatingToolbar(el, inputId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- CARD REPEATING GRID MANAGER ACTIONS ---

function addRepeatingItem(secIdx) {
  const iframe = document.getElementById('previewIframe');
  const iframeDoc = iframe.contentWindow.document;
  const sections = getVisualSections(iframeDoc);
  const section = sections[secIdx];
  if (!section) return;

  const repeatCards = Array.from(section.querySelectorAll('.service-card, .testimonial-card, .faq-item, .card, [class*="card"]'));
  if (repeatCards.length === 0) return;

  const clone = repeatCards[0].cloneNode(true);
  
  clone.querySelectorAll('h3, h4, h5, p').forEach(el => {
    if (el.tagName.toLowerCase() === 'p') {
      el.innerText = 'New item description text goes here.';
    } else {
      el.innerText = 'New Card Item';
    }
  });
  
  repeatCards[0].parentElement.appendChild(clone);
  
  document.getElementById('statusIndicator').innerText = 'Unsaved modifications on canvas.';
  document.getElementById('statusIndicator').style.color = 'var(--color-accent)';

  setupIframeVisualEditing();
  showToast('New card item appended successfully!', 'success');
}

function removeRepeatingItem(secIdx, cardIdx) {
  const iframe = document.getElementById('previewIframe');
  const iframeDoc = iframe.contentWindow.document;
  const sections = getVisualSections(iframeDoc);
  const section = sections[secIdx];
  if (!section) return;

  const repeatCards = Array.from(section.querySelectorAll('.service-card, .testimonial-card, .faq-item, .card, [class*="card"]'));
  if (repeatCards.length <= 1) {
    showToast('Cannot delete the last remaining item. Visual grid requires at least one template card.', 'error');
    return;
  }

  repeatCards[cardIdx].remove();

  document.getElementById('statusIndicator').innerText = 'Unsaved modifications on canvas.';
  document.getElementById('statusIndicator').style.color = 'var(--color-accent)';

  setupIframeVisualEditing();
  showToast('Card item deleted successfully!', 'success');
}

function updateCardText(inpId, val) {
  const el = editableElementsMap[inpId];
  if (el) {
    el.innerText = val;
    document.getElementById('statusIndicator').innerText = 'Unsaved modifications on canvas.';
    document.getElementById('statusIndicator').style.color = 'var(--color-accent)';
  }
}

// Save global booking link configuration and rewrite all CTAs on all pages
async function saveBookingLink() {
  const input = document.getElementById('editorBookingLink');
  const newLink = input.value.trim();
  
  showToast('Updating booking redirects across all pages...', 'info');

  try {
    // 1. Fetch client_data.json
    const dataRes = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/file?path=client_data.json`);
    if (!dataRes.ok) throw new Error('Failed to read client data config');
    const clientData = await dataRes.json();

    const oldLink = clientData.booking_link || 'qualification.html';
    
    // Update memory & config
    clientData.booking_link = newLink;
    projectData.clientData.booking_link = newLink;

    // 2. Fetch sitemap.json to get pages index
    const sitemapRes = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/file?path=sitemap.json`);
    if (!sitemapRes.ok) throw new Error('Failed to load sitemap pages index');
    const sitemap = await sitemapRes.json();
    const pages = sitemap.pages || [];

    // Unique list of all site views to update
    const filesToUpdate = ['index.html', ...pages.map(p => p.file)];
    const uniqueFiles = [...new Set(filesToUpdate)];

    // 3. Update occurrences on all pages
    for (const file of uniqueFiles) {
      try {
        const fileRes = await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/file?path=${encodeURIComponent(file)}`);
        if (!fileRes.ok) continue;
        
        let html = await fileRes.text();
        
        if (newLink) {
          if (oldLink && oldLink !== 'qualification.html') {
            const escapedOld = oldLink.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            const regexHref = new RegExp(`href="${escapedOld}"`, 'g');
            const regexOnclick = new RegExp(`window\\.location\\.href='${escapedOld}'`, 'g');
            html = html.replace(regexHref, `href="${newLink}"`);
            html = html.replace(regexOnclick, `window.location.href='${newLink}'`);
          } else {
            html = html.replace(/href="qualification\.html"/g, `href="${newLink}"`);
            html = html.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${newLink}'"`);
            html = html.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${newLink}'`);
          }
        } else {
          // If clearing, revert back to qualification.html
          const escapedOld = oldLink.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regexHref = new RegExp(`href="${escapedOld}"`, 'g');
          const regexOnclick = new RegExp(`window\\.location\\.href='${escapedOld}'`, 'g');
          html = html.replace(regexHref, `href="qualification.html"`);
          html = html.replace(regexOnclick, `window.location.href='qualification.html'`);
        }

        // Save customized page
        await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/file?path=${encodeURIComponent(file)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: html })
        });
      } catch (e) {
        console.error(`Failed to update booking redirects on ${file}`, e);
      }
    }

    // 4. Save updated client_data.json configuration
    await fetch(`${API_BASE}/api/project/${encodeURIComponent(currentProject)}/file?path=client_data.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: JSON.stringify(clientData, null, 2) })
    });

    showToast('All page call-to-actions successfully updated!', 'success');
    
    // Refresh visual iframe canvas preview
    const iframe = document.getElementById('previewIframe');
    if (iframe) iframe.contentWindow.location.reload();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Initialise
document.addEventListener('DOMContentLoaded', () => {
  initEditor();
});
