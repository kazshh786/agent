const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Paths relative to workspace root
const WORKSPACE_DIR = path.resolve(__dirname, '..');
const PROJECTS_DIR = path.join(WORKSPACE_DIR, 'projects');

// Serve static admin files
app.use('/admin', express.static(path.join(PROJECTS_DIR, 'kasimshah.com', 'admin')));

// Serve project files for visual preview & asset loading
app.use('/projects', express.static(PROJECTS_DIR));

// Helper: Run shell/git command asynchronously
function runGitCommand(cmd, cwd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Git command failed: ${cmd}`, error);
        resolve({ success: false, error: stderr || error.message });
      } else {
        resolve({ success: true, output: stdout.trim() });
      }
    });
  });
}

// Helper: Recursively copy a directory
function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  if (fs.lstatSync(source).isDirectory()) {
    const files = fs.readdirSync(source);
    files.forEach((file) => {
      const curSource = path.join(source, file);
      const curTarget = path.join(target, file);

      if (fs.lstatSync(curSource).isDirectory()) {
        // Exclude system files and build caches
        if (file !== '.wrangler' && file !== 'node_modules' && file !== '.git') {
          copyFolderRecursiveSync(curSource, curTarget);
        }
      } else {
        fs.copyFileSync(curSource, curTarget);
      }
    });
  }
}

// Helper: Update CSS variables inside a style.css file
function updateCssVariablesInFile(cssPath, colors, shapes) {
  if (!fs.existsSync(cssPath)) return;
  let content = fs.readFileSync(cssPath, 'utf8');

  // Match the standard 60-30-10 custom properties
  if (colors) {
    if (colors['--color-primary']) {
      content = content.replace(/(--color-primary\s*:\s*)[^;\n]+/g, `$1${colors['--color-primary']}`);
    }
    if (colors['--color-secondary']) {
      content = content.replace(/(--color-secondary\s*:\s*)[^;\n]+/g, `$1${colors['--color-secondary']}`);
    }
    if (colors['--color-accent']) {
      content = content.replace(/(--color-accent\s*:\s*)[^;\n]+/g, `$1${colors['--color-accent']}`);
    }

    // Material 3 mappings
    for (const [key, val] of Object.entries(colors)) {
      if (key.startsWith('--md-sys-')) {
        const regex = new RegExp(`(${key}\\s*:\\s*)[^;\\n]+`, 'g');
        content = content.replace(regex, `$1${val}`);
      }
    }
  }

  // Update shape/corner radius tokens
  if (shapes) {
    for (const [key, val] of Object.entries(shapes)) {
      const regex = new RegExp(`(${key}\\s*:\\s*)[^;\\n]+`, 'g');
      content = content.replace(regex, `$1${val}`);
    }
  }

  fs.writeFileSync(cssPath, content, 'utf8');
}

// API: Get List of Active Projects
app.get('/api/projects', (req, res) => {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) {
      return res.json([]);
    }

    const folders = fs.readdirSync(PROJECTS_DIR);
    const projectsList = [];

    folders.forEach((folder) => {
      const folderPath = path.join(PROJECTS_DIR, folder);
      if (!fs.lstatSync(folderPath).isDirectory()) return;
      if (folder === 'client-template' || folder === 'intake-form') return; // Skip helper templates

      const sitemapPath = path.join(folderPath, 'sitemap.json');
      const themePath = path.join(folderPath, 'theme.json');
      const clientDataPath = path.join(folderPath, 'client_data.json');

      const projectData = {
        name: folder,
        hasSitemap: fs.existsSync(sitemapPath),
        hasTheme: fs.existsSync(themePath),
        hasClientData: fs.existsSync(clientDataPath),
        pages: [],
        theme: {},
        clientData: {}
      };

      if (projectData.hasSitemap) {
        try {
          const sitemapRaw = fs.readFileSync(sitemapPath, 'utf8');
          const parsed = JSON.parse(sitemapRaw);
          projectData.pages = parsed.pages || (parsed.categories ? Object.values(parsed.categories).flat() : []);
        } catch (e) {
          console.error(`Error reading sitemap for ${folder}`, e);
        }
      }

      if (projectData.hasTheme) {
        try {
          const themeRaw = fs.readFileSync(themePath, 'utf8');
          projectData.theme = JSON.parse(themeRaw).theme || {};
        } catch (e) {
          console.error(`Error reading theme for ${folder}`, e);
        }
      }

      if (projectData.hasClientData) {
        try {
          const dataRaw = fs.readFileSync(clientDataPath, 'utf8');
          projectData.clientData = JSON.parse(dataRaw);
        } catch (e) {
          console.error(`Error reading client data for ${folder}`, e);
        }
      }

      projectsList.push(projectData);
    });

    res.json(projectsList);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read projects catalog', details: err.message });
  }
});

// API: Create a New Project (Website Instance)
app.post('/api/projects', (req, res) => {
  const { name, industry, bottleneck, salesProcess, brandColor, goals } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  const targetFolder = path.join(PROJECTS_DIR, name);
  if (fs.existsSync(targetFolder)) {
    return res.status(400).json({ error: `Project '${name}' already exists` });
  }

  try {
    // We use "projects/KS Studio" as our high-performance baseline structure template
    const templateSource = path.join(PROJECTS_DIR, 'KS Studio');
    
    // Copy template recursively
    copyFolderRecursiveSync(templateSource, targetFolder);

    // Customize client_data.json
    const clientData = {
      client_name: name,
      brand_color: brandColor || '#D4AF37',
      industry: industry || 'Professional Services',
      revenue_bottleneck: bottleneck || 'conversion',
      sales_process: salesProcess || 'sales_call',
      conversion_goals: goals || [
        "Increase customer engagement",
        "Minimize layout/booking friction",
        "Deliver clear digital authority value stacks"
      ]
    };
    fs.writeFileSync(path.join(targetFolder, 'client_data.json'), JSON.stringify(clientData, null, 2), 'utf8');

    // Customize theme.json colors based on selected brandColor
    const themePath = path.join(targetFolder, 'theme.json');
    if (fs.existsSync(themePath)) {
      const themeRaw = fs.readFileSync(themePath, 'utf8');
      const themeConfig = JSON.parse(themeRaw);
      if (themeConfig.theme && themeConfig.theme.colors) {
        // Set accent colors
        themeConfig.theme.colors['--md-sys-color-primary'] = brandColor || '#D4AF37';
        fs.writeFileSync(themePath, JSON.stringify(themeConfig, null, 2), 'utf8');
      }
    }

    // Update the cloned style.css with the initial selected colors
    const cssPath = path.join(targetFolder, 'css', 'style.css');
    if (fs.existsSync(cssPath)) {
      updateCssVariablesInFile(cssPath, {
        '--color-accent': brandColor || '#D4AF37',
        '--md-sys-color-primary': brandColor || '#D4AF37'
      }, null);
    }

    // Git commit the creation of the new site
    runGitCommand('git status --porcelain', WORKSPACE_DIR)
      .then((status) => {
        const relativeProjectPath = path.join('projects', name).replace(/\\/g, '/');
        runGitCommand(`git add "${relativeProjectPath}"`, WORKSPACE_DIR)
          .then(() => {
            runGitCommand(`git commit -m "Visual Editor: spin up new website instance '${name}'"`, WORKSPACE_DIR);
          });
      });

    res.json({ success: true, message: `Project '${name}' created successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create new website project', details: err.message });
  }
});

// API: Get Specific Page (HTML) or Asset Config
app.get('/api/project/:name/file', (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path; // e.g. "index.html" or "theme.json"

  if (!filePath) {
    return res.status(400).json({ error: 'File path query parameter is required' });
  }

  const fullPath = path.join(PROJECTS_DIR, name, filePath);

  // Security check to prevent traversing outside projects folder
  if (!fullPath.startsWith(PROJECTS_DIR)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const data = fs.readFileSync(fullPath, 'utf8');
    res.send(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file', details: err.message });
  }
});

// API: Save Page HTML or Configuration File
app.post('/api/project/:name/file', (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path;
  const { content } = req.body;

  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'File path and text content are required' });
  }

  const projectDir = path.join(PROJECTS_DIR, name);
  const fullPath = path.join(projectDir, filePath);

  if (!fullPath.startsWith(PROJECTS_DIR)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    // Create backup before writing
    if (fs.existsSync(fullPath)) {
      const backupDir = path.join(projectDir, '_backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `${path.basename(filePath)}.${timestamp}.bak`);
      fs.copyFileSync(fullPath, backupPath);
    }

    fs.writeFileSync(fullPath, content, 'utf8');

    // If we are saving theme.json, sync those colors/shapes directly into style.css
    if (filePath === 'theme.json') {
      const themeData = JSON.parse(content).theme || {};
      const cssPath = path.join(projectDir, 'css', 'style.css');
      if (fs.existsSync(cssPath)) {
        // Map theme colors to general design system classes
        const colors = themeData.colors || {};
        // Map brand/accent to basic design tokens
        if (colors['--md-sys-color-primary']) {
          colors['--color-accent'] = colors['--md-sys-color-primary'];
        }
        if (colors['--md-sys-color-background']) {
          colors['--color-primary'] = colors['--md-sys-color-background'];
        }
        if (colors['--md-sys-color-on-background']) {
          colors['--color-secondary'] = colors['--md-sys-color-on-background'];
        }
        
        updateCssVariablesInFile(cssPath, colors, themeData.shape_tokens);
      }
    }

    // Git commit updates automatically
    const relativeFilePath = path.join('projects', name, filePath).replace(/\\/g, '/');
    runGitCommand(`git add "${relativeFilePath}"`, WORKSPACE_DIR)
      .then((addRes) => {
        if (addRes.success) {
          runGitCommand(`git commit -m "Visual Editor: update ${filePath} in ${name}"`, WORKSPACE_DIR);
        }
      });

    res.json({ success: true, message: `File '${filePath}' saved (with automatic backup and Git commit).` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write file', details: err.message });
  }
});

// API: Get Page History (Both local file backups & Git commits log)
app.get('/api/project/:name/history', async (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path; // e.g. "index.html"

  if (!filePath) {
    return res.status(400).json({ error: 'File path query parameter is required' });
  }

  const projectDir = path.join(PROJECTS_DIR, name);
  const backupsDir = path.join(projectDir, '_backups');
  const relativeFilePath = path.join('projects', name, filePath).replace(/\\/g, '/');

  const history = {
    backups: [],
    gitCommits: []
  };

  // 1. Gather backup files from _backups directory
  if (fs.existsSync(backupsDir)) {
    try {
      const files = fs.readdirSync(backupsDir);
      files.forEach((file) => {
        if (file.startsWith(path.basename(filePath)) && file.endsWith('.bak')) {
          const stats = fs.statSync(path.join(backupsDir, file));
          
          // Parse timestamp from name: filename.2026-07-10T05-04-37-000Z.bak
          const parts = file.split('.');
          const rawTime = parts[parts.length - 2] || '';
          const label = rawTime ? rawTime.replace(/-/g, ':') : stats.mtime.toLocaleString();

          history.backups.push({
            filename: file,
            size: stats.size,
            time: stats.mtime,
            timestampLabel: label
          });
        }
      });
      // Sort backups newest first
      history.backups.sort((a, b) => b.time - a.time);
    } catch (err) {
      console.error('Error listing backups', err);
    }
  }

  // 2. Gather git commits for this file
  try {
    const gitRes = await runGitCommand(`git log -n 15 --pretty=format:"%h|%an|%ar|%s" -- "${relativeFilePath}"`, WORKSPACE_DIR);
    if (gitRes.success && gitRes.output) {
      history.gitCommits = gitRes.output.split('\n').map((line) => {
        const [hash, author, date, message] = line.split('|');
        return { hash, author, date, message };
      });
    }
  } catch (err) {
    console.error('Git log command failed', err);
  }

  res.json(history);
});

// API: Restore a Page from Backup
app.post('/api/project/:name/restore', (req, res) => {
  const { name } = req.params;
  const { file, backupFile } = req.body;

  if (!file || !backupFile) {
    return res.status(400).json({ error: 'File path and backup filename are required' });
  }

  const projectDir = path.join(PROJECTS_DIR, name);
  const backupPath = path.join(projectDir, '_backups', backupFile);
  const activePath = path.join(projectDir, file);

  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: `Backup file '${backupFile}' not found` });
  }

  try {
    // Copy backup back to active location
    fs.copyFileSync(backupPath, activePath);

    // Commit restore action in Git
    const relativeFilePath = path.join('projects', name, file).replace(/\\/g, '/');
    runGitCommand(`git add "${relativeFilePath}"`, WORKSPACE_DIR)
      .then((addRes) => {
        if (addRes.success) {
          runGitCommand(`git commit -m "Visual Editor: restored '${file}' from backup '${backupFile}'"`, WORKSPACE_DIR);
        }
      });

    res.json({ success: true, message: `Successfully restored '${file}' to previous version.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore backup version', details: err.message });
  }
});

// API: Push Committed Git Changes
app.post('/api/project/:name/git-push', async (req, res) => {
  try {
    const pushRes = await runGitCommand('git push', WORKSPACE_DIR);
    if (pushRes.success) {
      res.json({ success: true, message: 'Successfully pushed all changes to remote Git repository!' });
    } else {
      res.status(500).json({ 
        error: 'Git push failed. Ensure remote repository tracking is configured.', 
        details: pushRes.error 
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to run git push', details: err.message });
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` Kasim Shah Website Engine Control Panel Active!`);
  console.log(` Dashboard URL: http://localhost:${PORT}/admin/index.html`);
  console.log(`======================================================\n`);
});
