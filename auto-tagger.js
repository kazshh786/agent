const fs = require('fs');
const path = require('path');

const TARGET_DIRS = [
  path.join(__dirname, 'templates'),
  path.join(__dirname, 'projects')
];

// Helper: Recursively find HTML files, excluding 'admin' folders
function getHtmlFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat && stat.isDirectory()) {
      // Skip admin control panel folders
      if (file.toLowerCase() === 'admin' || file.startsWith('.')) return;
      results = results.concat(getHtmlFiles(fullPath));
    } else if (file.endsWith('.html')) {
      results.push(fullPath);
    }
  });

  return results;
}

// Helper: Inject data-editable="true" into tags
function injectDataEditable(html) {
  // Regex to match opening tags of common text elements: h1-h6, p, button, li, span, small, label, td, th
  const tagNames = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'button', 'li', 'span', 'small', 'label', 'td', 'th'];
  const tagsRegex = new RegExp(`<(${tagNames.join('|')})(?:\\s+([^>]*?))?>`, 'gi');

  let updatedHtml = html.replace(tagsRegex, (match, tag, attrs) => {
    // Skip if already tagged
    if (attrs && attrs.includes('data-editable')) {
      return match;
    }
    // Skip inline svg elements, scripts, or editor wrapped text
    if (attrs && (attrs.includes('class="material-icons"') || attrs.includes('class="editor-wrapped-text"'))) {
      return match;
    }
    // Rebuild tag
    const newAttrs = attrs ? ` ${attrs.trim()} data-editable="true"` : ' data-editable="true"';
    return `<${tag}${newAttrs}>`;
  });

  // Target leaf-like anchors (buttons, navigation menu links, inline links)
  // Skip structural anchors that wrap divs/sections, and links with no text or only icons
  const anchorRegex = /<(a)(?:\s+([^>]*?))?>/gi;
  updatedHtml = updatedHtml.replace(anchorRegex, (match, tag, attrs) => {
    if (attrs && attrs.includes('data-editable')) {
      return match;
    }
    // Only inject to button-like or inline text links
    if (attrs && (attrs.includes('btn') || attrs.includes('link') || attrs.includes('tf-btn') || attrs.includes('item-link'))) {
      const newAttrs = attrs ? ` ${attrs.trim()} data-editable="true"` : ' data-editable="true"';
      return `<${tag}${newAttrs}>`;
    }
    return match;
  });

  return updatedHtml;
}

// Main execution block
function run() {
  console.log('=== STARTING KS AUTO-INTEGRATOR AUTO-TAGGER ===');
  let totalTagged = 0;

  TARGET_DIRS.forEach(dir => {
    console.log(`Scanning folder: ${dir}...`);
    const files = getHtmlFiles(dir);

    files.forEach(file => {
      try {
        const originalContent = fs.readFileSync(file, 'utf8');
        const updatedContent = injectDataEditable(originalContent);

        if (originalContent !== updatedContent) {
          fs.writeFileSync(file, updatedContent, 'utf8');
          console.log(`✓ Tagged: ${path.relative(__dirname, file)}`);
          totalTagged++;
        }
      } catch (err) {
        console.error(`✕ Failed to tag: ${file}`, err);
      }
    });
  });

  console.log(`=== PIPELINE COMPLETE: ${totalTagged} FILES UPDATED ===`);
}

run();
