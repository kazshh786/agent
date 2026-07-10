const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Env credentials for serverless cloud integration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'kazshh786/agent';
const WORKSPACE_DIR = path.resolve(__dirname, '..');
const PROJECTS_DIR = path.join(WORKSPACE_DIR, 'projects');
const TEMPLATES_DIR = path.join(WORKSPACE_DIR, 'templates');

// Native HTTPS Helper for API calls (Zero-Dependencies)
function makeHttpsRequest(url, method, headers, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'User-Agent': 'Antigravity-Engine-Dashboard'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null,
            rawBody: data
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            body: null,
            rawBody: data
          });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper: Run shell/git command locally
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

// Helper: Recursively copy a directory (Local only)
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
        if (file !== '.wrangler' && file !== 'node_modules' && file !== '.git') {
          copyFolderRecursiveSync(curSource, curTarget);
        }
      } else {
        fs.copyFileSync(curSource, curTarget);
      }
    });
  }
}

// Helper: Update CSS variables inside a style.css file (Local only)
function updateCssVariablesInFile(cssPath, colors, shapes) {
  if (!fs.existsSync(cssPath)) return;
  let content = fs.readFileSync(cssPath, 'utf8');

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

    for (const [key, val] of Object.entries(colors)) {
      if (key.startsWith('--md-sys-')) {
        const regex = new RegExp(`(${key}\\s*:\\s*)[^;\\n]+`, 'g');
        content = content.replace(regex, `$1${val}`);
      }
    }
  }

  if (shapes) {
    for (const [key, val] of Object.entries(shapes)) {
      const regex = new RegExp(`(${key}\\s*:\\s*)[^;\\n]+`, 'g');
      content = content.replace(regex, `$1${val}`);
    }
  }

  fs.writeFileSync(cssPath, content, 'utf8');
}

// Helper: Save Base64 Image to disk (Local only)
function saveBase64Image(projectDir, base64Data, defaultName) {
  if (!base64Data) return null;
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) return null;

  const ext = matches[1].split('/')[1] || 'png';
  const buffer = Buffer.from(matches[2], 'base64');
  const filename = `${defaultName}.${ext}`;
  const imagesDir = path.join(projectDir, 'images');
  
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(imagesDir, filename), buffer);
  return `images/${filename}`;
}

// Helper: Save File to Git or Local disk (Dual-Mode)
async function saveFileToGitOrLocal(projectName, relativeFilePath, content) {
  const repoFilePath = `projects/${projectName}/${relativeFilePath}`.replace(/\\/g, '/');
  
  if (GITHUB_TOKEN) {
    // Write via GitHub Contents API
    const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
    
    // Get file current SHA to overwrite
    let sha = null;
    const getRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'GET', headers);
    if (getRes.status === 200 && getRes.body) {
      sha = getRes.body.sha;
      
      // Auto-backup file
      if (relativeFilePath.endsWith('.html') || relativeFilePath.endsWith('.json')) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `projects/${projectName}/_backups/${path.basename(relativeFilePath)}.${timestamp}.bak`;
        await makeHttpsRequest(
          `https://api.github.com/repos/${GITHUB_REPO}/contents/${backupPath}`,
          'PUT',
          headers,
          {
            message: `Visual Editor: backup ${relativeFilePath} in ${projectName}`,
            content: getRes.body.content // Re-commit the same base64
          }
        );
      }
    }

    const base64Content = Buffer.from(content).toString('base64');
    const body = {
      message: `Visual Editor: update ${relativeFilePath} in ${projectName}`,
      content: base64Content
    };
    if (sha) body.sha = sha;

    const putRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'PUT', headers, body);
    if (putRes.status !== 200 && putRes.status !== 201) {
      throw new Error(`GitHub API write failed for ${repoFilePath}. Status: ${putRes.status}`);
    }
  } else {
    // Write locally
    const fullPath = path.join(PROJECTS_DIR, projectName, relativeFilePath);
    const projectDir = path.join(PROJECTS_DIR, projectName);
    
    if (fs.existsSync(fullPath)) {
      const backupDir = path.join(projectDir, '_backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `${path.basename(relativeFilePath)}.${timestamp}.bak`);
      fs.copyFileSync(fullPath, backupPath);
    }

    fs.writeFileSync(fullPath, content, 'utf8');

    // Local git commit
    const relativeFilePathNormalized = path.join('projects', projectName, relativeFilePath).replace(/\\/g, '/');
    runGitCommand(`git add "${relativeFilePathNormalized}"`, WORKSPACE_DIR)
      .then((addRes) => {
        if (addRes.success) {
          runGitCommand(`git commit -m "Visual Editor: update ${relativeFilePath} in ${projectName}"`, WORKSPACE_DIR);
        }
      });
  }
}

// Helper: Deploy Site to Cloudflare Pages & Provision custom domain DNS record
async function deployToCloudflarePagesAndDns(projectName, domainSlug) {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;

  if (!apiToken || !accountId) {
    console.log('[Cloudflare] Credentials not configured. Skipping Pages deployment.');
    return { success: false, reason: 'Credentials not configured' };
  }

  const headers = { 'Authorization': `Bearer ${apiToken}` };
  const pagesProjectName = `ks-${domainSlug}`;
  const subdomain = `${domainSlug}.kasimshah.com`;

  console.log(`[Cloudflare] Spawning Pages project '${pagesProjectName}'...`);

  // Step 1: Create Pages Project connected to GitHub repo subdirectory
  const createPayload = {
    name: pagesProjectName,
    production_branch: 'main',
    source: {
      type: 'github',
      config: {
        owner: 'kazshh786',
        repo_name: 'agent',
        production_branch: 'main',
        root_dir: `projects/${projectName}`,
        deployments_enabled: true
      }
    }
  };

  const projectRes = await makeHttpsRequest(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`,
    'POST',
    headers,
    createPayload
  );

  console.log(`[Cloudflare] Pages project status: ${projectRes.status}`);

  // Step 2: Add CNAME Record to DNS Zone (if Zone ID is set)
  if (zoneId) {
    console.log(`[Cloudflare] Creating CNAME record for ${subdomain} -> ${pagesProjectName}.pages.dev`);
    const dnsPayload = {
      type: 'CNAME',
      name: subdomain,
      content: `${pagesProjectName}.pages.dev`,
      ttl: 1,
      proxied: true
    };

    const dnsRes = await makeHttpsRequest(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      'POST',
      headers,
      dnsPayload
    );
    console.log(`[Cloudflare] DNS CNAME status: ${dnsRes.status}`);
  }

  // Step 3: Add Custom Domain mapping on the Pages Project
  console.log(`[Cloudflare] Binding custom domain ${subdomain} on Pages project`);
  const domainRes = await makeHttpsRequest(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${pagesProjectName}/domains`,
    'POST',
    headers,
    { name: subdomain }
  );
  console.log(`[Cloudflare] Custom domain mapping status: ${domainRes.status}`);

  return { success: true };
}

// ------------------------------------------------------------
// API ROUTING
// ------------------------------------------------------------

// Serve client site preview dynamically in cloud from GitHub (Overriding static serve on Vercel)
app.get('/projects/:name/:file*', async (req, res, next) => {
  if (!GITHUB_TOKEN) {
    return next(); // Fallback to local static serve
  }

  const { name, file } = req.params;
  const pathParts = req.params[0] ? file + req.params[0] : file;
  const repoFilePath = `projects/${name}/${pathParts}`.replace(/\\/g, '/');
  
  const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };

  try {
    const result = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'GET', headers);
    if (result.status === 200 && result.body) {
      const ext = path.extname(repoFilePath).toLowerCase();
      let mimeType = 'text/plain';
      if (ext === '.html') mimeType = 'text/html';
      else if (ext === '.css') mimeType = 'text/css';
      else if (ext === '.js') mimeType = 'application/javascript';
      else if (ext === '.json') mimeType = 'application/json';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.svg') mimeType = 'image/svg+xml';

      res.setHeader('Content-Type', mimeType);
      const buffer = Buffer.from(result.body.content, 'base64');
      res.send(buffer);
    } else {
      res.status(404).send('Preview file not found in GitHub repository');
    }
  } catch (err) {
    res.status(500).send(`GitHub connection error: ${err.message}`);
  }
});

// Serve static admin files (local only)
app.use('/admin', express.static(path.join(PROJECTS_DIR, 'kasimshah.com', 'admin')));

// Serve project files for visual preview & asset loading (local fallback)
app.use('/projects', express.static(PROJECTS_DIR));

// API: Get List of Available Website Templates
app.get('/api/templates', async (req, res) => {
  if (GITHUB_TOKEN) {
    try {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const apiRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/templates`, 'GET', headers);
      if (apiRes.status === 200 && Array.isArray(apiRes.body)) {
        const folders = apiRes.body.filter(i => i.type === 'dir').map(i => i.name);
        return res.json(folders);
      }
      return res.json(['editorial-luxe']);
    } catch (e) {
      return res.json(['editorial-luxe']);
    }
  }

  try {
    if (!fs.existsSync(TEMPLATES_DIR)) {
      return res.json(['editorial-luxe']);
    }
    const folders = fs.readdirSync(TEMPLATES_DIR).filter((file) => {
      return fs.lstatSync(path.join(TEMPLATES_DIR, file)).isDirectory();
    });
    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read templates directory', details: err.message });
  }
});

// API: Get List of Active Projects
app.get('/api/projects', async (req, res) => {
  if (GITHUB_TOKEN) {
    try {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const listRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/projects`, 'GET', headers);
      if (listRes.status !== 200) {
        return res.json([]);
      }

      const projectsList = [];
      const folders = listRes.body.filter(item => item.type === 'dir' && item.name !== 'client-template' && item.name !== 'intake-form');

      await Promise.all(folders.map(async (folder) => {
        const name = folder.name;
        const projectData = {
          name,
          hasSitemap: false,
          hasTheme: false,
          hasClientData: false,
          pages: [],
          theme: {},
          clientData: {}
        };

        try {
          const [sitemapRes, themeRes, dataRes] = await Promise.all([
            makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/projects/${name}/sitemap.json`, 'GET', headers),
            makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/projects/${name}/theme.json`, 'GET', headers),
            makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/projects/${name}/client_data.json`, 'GET', headers)
          ]);

          if (sitemapRes.status === 200 && sitemapRes.body && sitemapRes.body.content) {
            projectData.hasSitemap = true;
            const raw = Buffer.from(sitemapRes.body.content, 'base64').toString('utf8');
            const parsed = JSON.parse(raw);
            projectData.pages = parsed.pages || (parsed.categories ? Object.values(parsed.categories).flat() : []);
          }

          if (themeRes.status === 200 && themeRes.body && themeRes.body.content) {
            projectData.hasTheme = true;
            const raw = Buffer.from(themeRes.body.content, 'base64').toString('utf8');
            projectData.theme = JSON.parse(raw).theme || {};
          }

          if (dataRes.status === 200 && dataRes.body && dataRes.body.content) {
            projectData.hasClientData = true;
            const raw = Buffer.from(dataRes.body.content, 'base64').toString('utf8');
            projectData.clientData = JSON.parse(raw);
          }

          projectsList.push(projectData);
        } catch (e) {
          console.error(`Error loading configs from github for ${name}`, e);
        }
      }));

      return res.json(projectsList);
    } catch (err) {
      return res.status(500).json({ error: 'GitHub projects fetch failed', details: err.message });
    }
  }

  // Local filesystem scan
  try {
    if (!fs.existsSync(PROJECTS_DIR)) {
      return res.json([]);
    }

    const folders = fs.readdirSync(PROJECTS_DIR);
    const projectsList = [];

    folders.forEach((folder) => {
      const folderPath = path.join(PROJECTS_DIR, folder);
      if (!fs.lstatSync(folderPath).isDirectory()) return;
      if (folder === 'client-template' || folder === 'intake-form') return;

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

// API: Create a New Project (Website Instance from Template)
app.post('/api/projects', async (req, res) => {
  const { 
    name, 
    templateName, 
    industry, 
    bottleneck, 
    salesProcess, 
    brandColor, 
    vibe, 
    tone, 
    logoText, 
    logoImg, 
    heroImg, 
    services,
    bookingLink,
    pageSize
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Project name is required' });
  }

  // Slugified domain name e.g. "boutique-dental"
  const domainSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

  if (GITHUB_TOKEN) {
    // CLOUD MODE (GitHub Contents API generation)
    try {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const selectedTemplate = templateName || 'editorial-luxe';
      
      // 1. Fetch all template files from GitHub recursively
      const tempRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/templates/${selectedTemplate}`, 'GET', headers);
      if (tempRes.status !== 200) {
        return res.status(404).json({ error: `Template '${selectedTemplate}' not found on GitHub` });
      }

      const filesToCopy = [];
      async function findFiles(dirPath) {
        const res = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${dirPath}`, 'GET', headers);
        if (res.status === 200 && Array.isArray(res.body)) {
          for (const item of res.body) {
            if (item.type === 'dir') {
              await findFiles(item.path);
            } else {
              filesToCopy.push(item);
            }
          }
        }
      }
      
      await findFiles(`templates/${selectedTemplate}`);

      // 2. Clone/Commit files to projects/projectName on GitHub
      const pagesList = [];
      let serviceSingleHtml = '';

      for (const file of filesToCopy) {
        const fileContentRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${file.path}`, 'GET', headers);
        if (fileContentRes.status === 200 && fileContentRes.body) {
          let content = Buffer.from(fileContentRes.body.content, 'base64').toString('utf8');
          const relativeFilePath = file.path.replace(`templates/${selectedTemplate}/`, '');

          if (relativeFilePath === 'service-single.html') {
            serviceSingleHtml = content;
            continue;
          }

          const targetFilePath = `projects/${name}/${relativeFilePath}`.replace(/\\/g, '/');

          // Customize logos and booking links
          if (relativeFilePath.endsWith('.html')) {
            if (logoText) {
              content = content.replace(/KS <span>STUDIO<\/span>/g, logoText);
              content = content.replace(/KS <span>STUDIO<\/span>/gi, logoText);
              content = content.replace(/KS STUDIO/g, logoText.replace(/<\/?span>/g, ''));
              content = content.replace(/\[Logo Text\]/g, logoText);
            }

            if (bookingLink) {
              content = content.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
              content = content.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
              content = content.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
            }
          }

          if (relativeFilePath === 'sitemap.json') {
            pagesList.push(...JSON.parse(content).pages || []);
          }

          const base64Content = Buffer.from(content).toString('base64');
          await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${targetFilePath}`, 'PUT', headers, {
            message: `Visual Editor: copy ${relativeFilePath} from template`,
            content: base64Content
          });
        }
      }

      // 3. Process dynamic services subpages & localized SEO pages
      if (serviceSingleHtml && Array.isArray(services) && services.length > 0) {
        // Standard service pages
        for (const serviceName of services) {
          const slug = 'service-' + serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
          const filename = `${slug}.html`;
          const targetPath = `projects/${name}/${filename}`;

          let pageHtml = serviceSingleHtml
            .replace(/\[Service Name\]/g, serviceName)
            .replace(/\[Logo Text\]/g, logoText || name);

          if (bookingLink) {
            pageHtml = pageHtml.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
            pageHtml = pageHtml.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
            pageHtml = pageHtml.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
          }

          await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${targetPath}`, 'PUT', headers, {
            message: `Visual Editor: generate service subpage '${serviceName}'`,
            content: Buffer.from(pageHtml).toString('base64')
          });

          pagesList.push({ file: filename, name: serviceName, type: 'service_single' });
        }

        // Localized SEO pages if size budget is 20 or 30
        const targetSize = parseInt(pageSize, 10) || 10;
        if (targetSize > 10) {
          const additionalPagesNeeded = targetSize - 10;
          const cities = [
            "London", "Manchester", "Birmingham", "Leeds", "Glasgow",
            "Bristol", "Liverpool", "Newcastle", "Sheffield", "Edinburgh",
            "Belfast", "Leicester", "Coventry", "Nottingham", "Cardiff"
          ];
          
          let count = 0;
          let cityIndex = 0;
          
          while (count < additionalPagesNeeded && cityIndex < cities.length) {
            for (let i = 0; i < services.length; i++) {
              if (count >= additionalPagesNeeded || cityIndex >= cities.length) break;
              
              const serviceName = services[i];
              const city = cities[cityIndex];
              const slug = 'service-' + serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + city.toLowerCase();
              const filename = `${slug}.html`;
              const targetPath = `projects/${name}/${filename}`;

              let pageHtml = serviceSingleHtml
                .replace(/\[Service Name\]/g, `${serviceName} in ${city}`)
                .replace(/\[Logo Text\]/g, logoText || name);

              if (bookingLink) {
                pageHtml = pageHtml.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
                pageHtml = pageHtml.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
                pageHtml = pageHtml.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
              }

              await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${targetPath}`, 'PUT', headers, {
                message: `Visual Editor: generate localized service subpage '${serviceName} (${city})'`,
                content: Buffer.from(pageHtml).toString('base64')
              });

              pagesList.push({ file: filename, name: `${serviceName} (${city})`, type: 'service_local_seo' });
              count++;
            }
            cityIndex++;
          }
        }
      }

      // Update sitemap.json on GitHub
      const sitemapPath = `projects/${name}/sitemap.json`;
      const sitemapBody = { pages: pagesList };
      let sitemapSha = null;
      const getSitemap = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${sitemapPath}`, 'GET', headers);
      if (getSitemap.status === 200 && getSitemap.body) sitemapSha = getSitemap.body.sha;

      await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${sitemapPath}`, 'PUT', headers, {
        message: 'Visual Editor: update sitemap with dynamic services',
        content: Buffer.from(JSON.stringify(sitemapBody, null, 2)).toString('base64'),
        sha: sitemapSha
      });

      // Update theme config on GitHub
      const themePath = `projects/${name}/theme.json`;
      let themeSha = null;
      const getTheme = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${themePath}`, 'GET', headers);
      if (getTheme.status === 200 && getTheme.body) {
        themeSha = getTheme.body.sha;
        const themeConfig = JSON.parse(Buffer.from(getTheme.body.content, 'base64').toString('utf8'));
        if (themeConfig.theme) {
          themeConfig.theme.vibe = vibe || 'Luxury/Editorial';
          if (themeConfig.theme.colors) {
            themeConfig.theme.colors['--md-sys-color-primary'] = brandColor || '#D4AF37';
          }
          await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${themePath}`, 'PUT', headers, {
            message: 'Visual Editor: update theme variables',
            content: Buffer.from(JSON.stringify(themeConfig, null, 2)).toString('base64'),
            sha: themeSha
          });
        }
      }

      // Create client_data.json on GitHub
      const clientData = {
        client_name: name,
        brand_color: brandColor || '#D4AF37',
        industry: industry || 'Professional Services',
        revenue_bottleneck: bottleneck || 'conversion',
        sales_process: salesProcess || 'sales_call',
        tone_of_voice: tone || 'Sophisticated/Editorial',
        services: services || [],
        booking_link: bookingLink || '',
        page_size: pageSize || '10'
      };
      await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/projects/${name}/client_data.json`, 'PUT', headers, {
        message: 'Visual Editor: write client data configurations',
        content: Buffer.from(JSON.stringify(clientData, null, 2)).toString('base64')
      });

      // Trigger Cloudflare Pages deployment and DNS provisioning asynchronously
      deployToCloudflarePagesAndDns(name, domainSlug);

      return res.json({ success: true, message: `Project '${name}' successfully generated in GitHub and queued for Cloudflare Pages auto-deploys.` });
    } catch (err) {
      return res.status(500).json({ error: 'GitHub site compiler failed', details: err.message });
    }
  }

  // LOCAL DEVELOPMENT MODE (Filesystem site generation)
  const targetFolder = path.join(PROJECTS_DIR, name);
  if (fs.existsSync(targetFolder)) {
    return res.status(400).json({ error: `Project '${name}' already exists` });
  }

  try {
    const selectedTemplate = templateName || 'editorial-luxe';
    const templateSource = path.join(TEMPLATES_DIR, selectedTemplate);
    
    if (!fs.existsSync(templateSource)) {
      return res.status(404).json({ error: `Template '${selectedTemplate}' not found on local disk` });
    }
    
    copyFolderRecursiveSync(templateSource, targetFolder);

    const logoImgPath = saveBase64Image(targetFolder, logoImg, 'logo_uploaded');
    const heroImgPath = saveBase64Image(targetFolder, heroImg, 'hero_uploaded');

    const clientData = {
      client_name: name,
      brand_color: brandColor || '#D4AF37',
      industry: industry || 'Professional Services',
      revenue_bottleneck: bottleneck || 'conversion',
      sales_process: salesProcess || 'sales_call',
      tone_of_voice: tone || 'Sophisticated/Editorial',
      services: services || [],
      booking_link: bookingLink || '',
      page_size: pageSize || '10',
      conversion_goals: [
        `Frictionless booking flow targeting the ${bottleneck} bottleneck.`,
        `High-conversion ${vibe} framework optimized for ${industry} services.`,
        `Value-stack architecture written in a ${tone} copywriting tone.`
      ]
    };
    fs.writeFileSync(path.join(targetFolder, 'client_data.json'), JSON.stringify(clientData, null, 2), 'utf8');

    const sitemapPath = path.join(targetFolder, 'sitemap.json');
    let pagesList = [];
    if (fs.existsSync(sitemapPath)) {
      try {
        const raw = fs.readFileSync(sitemapPath, 'utf8');
        pagesList = JSON.parse(raw).pages || [];
      } catch (e) {
        console.error(e);
      }
    }

    const serviceTemplatePath = path.join(targetFolder, 'service-single.html');
    if (fs.existsSync(serviceTemplatePath) && Array.isArray(services) && services.length > 0) {
      const templateHtml = fs.readFileSync(serviceTemplatePath, 'utf8');

      // Generate standard service pages
      services.forEach((serviceName) => {
        const slug = 'service-' + serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
        const filename = `${slug}.html`;
        const serviceFileSavePath = path.join(targetFolder, filename);

        let pageHtml = templateHtml
          .replace(/\[Service Name\]/g, serviceName)
          .replace(/\[Logo Text\]/g, logoText || name);

        if (bookingLink) {
          pageHtml = pageHtml.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
          pageHtml = pageHtml.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
          pageHtml = pageHtml.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
        }
        
        fs.writeFileSync(serviceFileSavePath, pageHtml, 'utf8');
        pagesList.push({ file: filename, name: serviceName, type: 'service_single' });
      });

      // Generate localized SEO pages if size budget is 20 or 30
      const targetSize = parseInt(pageSize, 10) || 10;
      if (targetSize > 10) {
        const additionalPagesNeeded = targetSize - 10;
        const cities = [
          "London", "Manchester", "Birmingham", "Leeds", "Glasgow",
          "Bristol", "Liverpool", "Newcastle", "Sheffield", "Edinburgh",
          "Belfast", "Leicester", "Coventry", "Nottingham", "Cardiff"
        ];
        
        let count = 0;
        let cityIndex = 0;
        
        while (count < additionalPagesNeeded && cityIndex < cities.length) {
          for (let i = 0; i < services.length; i++) {
            if (count >= additionalPagesNeeded || cityIndex >= cities.length) break;
            
            const serviceName = services[i];
            const city = cities[cityIndex];
            const slug = 'service-' + serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') + '-' + city.toLowerCase();
            const filename = `${slug}.html`;
            const serviceFileSavePath = path.join(targetFolder, filename);

            let pageHtml = templateHtml
              .replace(/\[Service Name\]/g, `${serviceName} in ${city}`)
              .replace(/\[Logo Text\]/g, logoText || name);

            if (bookingLink) {
              pageHtml = pageHtml.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
              pageHtml = pageHtml.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
              pageHtml = pageHtml.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
            }
            
            fs.writeFileSync(serviceFileSavePath, pageHtml, 'utf8');
            pagesList.push({ file: filename, name: `${serviceName} (${city})`, type: 'service_local_seo' });
            count++;
          }
          cityIndex++;
        }
      }

      fs.rmSync(serviceTemplatePath, { force: true });
      pagesList = pagesList.filter(p => p.file !== 'service-single.html');
    }

    fs.writeFileSync(sitemapPath, JSON.stringify({ pages: pagesList }, null, 2), 'utf8');

    const projectFiles = fs.readdirSync(targetFolder);
    projectFiles.forEach((file) => {
      const filePath = path.join(targetFolder, file);
      if (fs.lstatSync(filePath).isFile() && file.endsWith('.html')) {
        let htmlContent = fs.readFileSync(filePath, 'utf8');
        
        if (logoText) {
          htmlContent = htmlContent.replace(/KS <span>STUDIO<\/span>/g, logoText);
          htmlContent = htmlContent.replace(/KS <span>STUDIO<\/span>/gi, logoText);
          htmlContent = htmlContent.replace(/KS STUDIO/g, logoText.replace(/<\/?span>/g, ''));
          htmlContent = htmlContent.replace(/\[Logo Text\]/g, logoText);
        }

        if (bookingLink) {
          htmlContent = htmlContent.replace(/href="qualification\.html"/g, `href="${bookingLink}"`);
          htmlContent = htmlContent.replace(/onclick="window\.location\.href='qualification\.html'"/g, `onclick="window.location.href='${bookingLink}'"`);
          htmlContent = htmlContent.replace(/window\.location\.href='qualification\.html'/g, `window.location.href='${bookingLink}'`);
        }

        if (logoImgPath) {
          const logoImgTag = `<img src="${logoImgPath}" alt="${name} Logo" style="max-height: 40px; width: auto; vertical-align: middle;">`;
          htmlContent = htmlContent.replace(/(id="header-logo"[^>]*>)[^<]*(<\/a>)/g, `$1${logoImgTag}$2`);
        }

        if (file === 'index.html' && heroImgPath) {
          htmlContent = htmlContent.replace(/(class="hero-img"[^>]*src=")[^"]*(")/g, `$1${heroImgPath}$2`);
          htmlContent = htmlContent.replace(/(class="split-side-panel"[^>]*background:\s*url\()[^)]*(\))/g, `$1../../${heroImgPath}$2`);
        }

        fs.writeFileSync(filePath, htmlContent, 'utf8');
      }
    });

    const themePath = path.join(targetFolder, 'theme.json');
    if (fs.existsSync(themePath)) {
      const themeRaw = fs.readFileSync(themePath, 'utf8');
      const themeConfig = JSON.parse(themeRaw);
      
      if (themeConfig.theme) {
        themeConfig.theme.vibe = vibe || 'Luxury/Editorial';
        if (themeConfig.theme.colors) {
          themeConfig.theme.colors['--md-sys-color-primary'] = brandColor || '#D4AF37';
        }
        fs.writeFileSync(themePath, JSON.stringify(themeConfig, null, 2), 'utf8');
      }
    }

    const cssPath = path.join(targetFolder, 'css', 'style.css');
    if (cssPath) {
      const radius = vibe === 'Luxury/Editorial' ? '0px' : vibe === 'Tech Sleek' ? '8px' : '16px';
      updateCssVariablesInFile(cssPath, {
        '--color-accent': brandColor || '#D4AF37',
        '--md-sys-color-primary': brandColor || '#D4AF37'
      }, {
        '--md-sys-shape-corner-extra-small': radius,
        '--md-sys-shape-corner-small': radius,
        '--md-sys-shape-corner-medium': radius,
        '--md-sys-shape-corner-large': radius,
        '--md-sys-shape-corner-extra-large': radius,
        '--radius-sm': radius === '0px' ? '0px' : '4px',
        '--radius-md': radius,
        '--radius-lg': radius === '0px' ? '0px' : '16px'
      });
    }

    // Git commit creation
    const relativeProjectPath = path.join('projects', name).replace(/\\/g, '/');
    runGitCommand(`git add "${relativeProjectPath}"`, WORKSPACE_DIR)
      .then(() => {
        runGitCommand(`git commit -m "Visual Editor: spin up new website instance '${name}'"`, WORKSPACE_DIR);
      });

    // Trigger Cloudflare Pages deployment and DNS provisioning asynchronously (local credentials helper)
    deployToCloudflarePagesAndDns(name, domainSlug);

    res.json({ success: true, message: `Project '${name}' created successfully on local disk and queued for Cloudflare Pages.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create new website project', details: err.message });
  }
});

// API: Get Specific Page (HTML) or Asset Config
app.get('/api/project/:name/file', async (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path;

  if (!filePath) {
    return res.status(400).json({ error: 'File path query parameter is required' });
  }

  const repoFilePath = `projects/${name}/${filePath}`.replace(/\\/g, '/');

  if (GITHUB_TOKEN) {
    // Read from GitHub Contents API
    const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
    try {
      const apiRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'GET', headers);
      if (apiRes.status === 200 && apiRes.body) {
        const raw = Buffer.from(apiRes.body.content, 'base64').toString('utf8');
        return res.send(raw);
      }
      return res.status(apiRes.status).json({ error: 'GitHub file read error' });
    } catch (e) {
      return res.status(500).json({ error: 'GitHub connection error', details: e.message });
    }
  }

  // Local read
  const fullPath = path.join(PROJECTS_DIR, name, filePath);
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
app.post('/api/project/:name/file', async (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path;
  const { content } = req.body;

  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'File path and text content are required' });
  }

  try {
    await saveFileToGitOrLocal(name, filePath, content);

    // Sync theme variables to style.css if theme.json is updated (local only)
    if (filePath === 'theme.json' && !GITHUB_TOKEN) {
      try {
        const themeData = JSON.parse(content).theme || {};
        const cssPath = path.join(PROJECTS_DIR, name, 'css', 'style.css');
        if (fs.existsSync(cssPath)) {
          const colors = themeData.colors || {};
          if (colors['--md-sys-color-primary']) {
            colors['--color-accent'] = colors['--md-sys-color-primary'];
          }
          updateCssVariablesInFile(cssPath, colors, themeData.shape_tokens);
        }
      } catch (e) {
        console.error('Failed to sync CSS theme', e);
      }
    }

    res.json({ success: true, message: `File '${filePath}' saved (with automatic backup and Git commits).` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to write file', details: err.message });
  }
});

// API: Binary File Upload (Saves image base64 directly to target project folder)
app.post('/api/project/:name/upload', async (req, res) => {
  const { name } = req.params;
  const { filePath, content } = req.body;

  if (!filePath || !content) {
    return res.status(400).json({ error: 'File path and content are required' });
  }

  try {
    const cleanBase64 = content.replace(/^data:image\/\w+;base64,/, "");
    
    if (GITHUB_TOKEN) {
      const repoFilePath = `projects/${name}/${filePath}`.replace(/\\/g, '/');
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      
      let sha = null;
      const getRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'GET', headers);
      if (getRes.status === 200 && getRes.body) {
        sha = getRes.body.sha;
      }
      
      const body = {
        message: `Visual Editor: upload asset ${filePath} in ${name}`,
        content: cleanBase64
      };
      if (sha) body.sha = sha;

      const putRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${repoFilePath}`, 'PUT', headers, body);
      if (putRes.status !== 200 && putRes.status !== 201) {
        throw new Error(`GitHub API write failed for ${repoFilePath}. Status: ${putRes.status}`);
      }
    } else {
      const fullPath = path.join(PROJECTS_DIR, name, filePath);
      const fileDir = path.dirname(fullPath);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, Buffer.from(cleanBase64, 'base64'));

      const relativeFilePathNormalized = path.join('projects', name, filePath).replace(/\\/g, '/');
      runGitCommand(`git add "${relativeFilePathNormalized}"`, WORKSPACE_DIR)
        .then((addRes) => {
          if (addRes.success) {
            runGitCommand(`git commit -m "Visual Editor: upload asset ${filePath} in ${name}"`, WORKSPACE_DIR);
          }
        });
    }

    res.json({ success: true, url: filePath });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// API: AI Text Generator (Simulates high-converting copy variants based on strategy frameworks)
app.post('/api/ai/generate', (req, res) => {
  const { originalText, command, industry } = req.body;
  
  const library = {
    'Shorter': {
      default: 'Premium aesthetics tailored for you.',
      heading: 'Elite Smile Aesthetics.',
      subheading: 'Experience luxury dental care in London.',
      button: 'Book Visit'
    },
    'Longer': {
      default: 'We believe that beauty is an art form. Our elite medical practitioners combine advanced science with a luxurious approach to craft personalized aesthetic transformations.',
      heading: 'Bespoke Aesthetic Craftsmanship & Luxury Clinical Care',
      subheading: 'Step into a world-class clinical sanctuary designed around comfort, precision, and natural results.',
      button: 'Schedule Your Private Consultation'
    },
    'More Luxury': {
      default: 'Indulge in bespoke aesthetic transformations.',
      heading: 'The Art of Natural Refinement',
      subheading: 'Bespoke facial rejuvenation and smile aesthetics in a private clinical sanctuary.',
      button: 'Request Private Invite'
    },
    'More Professional': {
      default: 'Evidence-based aesthetic treatments by certified clinical specialists.',
      heading: 'State-of-the-Art Aesthetic Medicine & Dentistry',
      subheading: 'Delivering predictable, clinically-proven results using advanced diagnostic technology.',
      button: 'Book Clinical Assessment'
    },
    'More Friendly': {
      default: 'We are here to help you feel confident and radiate joy every single day.',
      heading: 'Welcome to Your New Clinical Sanctuary',
      subheading: 'Our warm, friendly team is dedicated to making your aesthetic journey comfortable and stress-free.',
      button: 'Come Say Hello'
    },
    'Improve SEO Headline': {
      default: 'Top-Rated Aesthetics Clinic in London | Natural Facelift & Skin Care',
      heading: 'Leading Aesthetics & Dental Clinic London | Premium Smile Care',
      subheading: 'Award-winning clinical practitioners offering cosmetic veneers, dermal fillers, and advanced skin rejuvenation.',
      button: 'Secure Appointment Online'
    }
  };

  let type = 'default';
  if (originalText && originalText.length < 20) {
    if (originalText.toLowerCase().includes('book') || originalText.toLowerCase().includes('schedule') || originalText.toLowerCase().includes('appointment')) {
      type = 'button';
    } else {
      type = 'heading';
    }
  } else if (originalText && originalText.length >= 20) {
    type = 'subheading';
  }

  const category = library[command] || library['More Luxury'];
  const text = category[type] || category['default'];

  res.json({ success: true, text });
});

// API: AI Image search (Loads matching high-end clinical and salon stock photographs based on prompt tags)
app.post('/api/ai/image', (req, res) => {
  const { prompt } = req.body;
  
  const images = [
    'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1579684389782-64d84b5e905d?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1598256989800-fe5f95da9787?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1512290923902-8a9f81dc236c?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=800&q=80',
    'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=800&q=80'
  ];

  let selected = images[0];
  const query = (prompt || '').toLowerCase();
  if (query.includes('doctor') || query.includes('dentist') || query.includes('practitioner')) {
    selected = images[1];
  } else if (query.includes('hair') || query.includes('styling') || query.includes('cut')) {
    selected = images[2];
  } else if (query.includes('office') || query.includes('studio') || query.includes('room')) {
    selected = images[3];
  } else if (query.includes('face') || query.includes('treatment') || query.includes('skincare')) {
    selected = images[4];
  } else if (query.includes('smile') || query.includes('dental') || query.includes('teeth')) {
    selected = images[5];
  } else {
    selected = images[Math.floor(Math.random() * images.length)];
  }

  res.json({ success: true, url: selected });
});

// API: Get Page History (Both local file backups & Git commits log)
app.get('/api/project/:name/history', async (req, res) => {
  const { name } = req.params;
  const filePath = req.query.path;

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

  // 1. Gather backup files
  if (GITHUB_TOKEN) {
    const backupsPath = `projects/${name}/_backups`;
    try {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const apiRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${backupsPath}`, 'GET', headers);
      if (apiRes.status === 200 && Array.isArray(apiRes.body)) {
        apiRes.body.forEach((file) => {
          if (file.name.startsWith(path.basename(filePath)) && file.name.endsWith('.bak')) {
            const parts = file.name.split('.');
            const rawTime = parts[parts.length - 2] || '';
            const label = rawTime ? rawTime.replace(/-/g, ':') : file.name;
            history.backups.push({
              filename: file.name,
              size: file.size,
              timestampLabel: label
            });
          }
        });
        history.backups.reverse();
      }
    } catch (e) {
      console.log('No backups folder on GitHub yet.');
    }
  } else {
    if (fs.existsSync(backupsDir)) {
      try {
        const files = fs.readdirSync(backupsDir);
        files.forEach((file) => {
          if (file.startsWith(path.basename(filePath)) && file.endsWith('.bak')) {
            const stats = fs.statSync(path.join(backupsDir, file));
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
        history.backups.sort((a, b) => b.time - a.time);
      } catch (err) {
        console.error('Error listing backups', err);
      }
    }
  }

  // 2. Gather git commits
  if (GITHUB_TOKEN) {
    try {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const commitsRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/commits?path=${relativeFilePath}`, 'GET', headers);
      if (commitsRes.status === 200 && Array.isArray(commitsRes.body)) {
        history.gitCommits = commitsRes.body.map(item => {
          return {
            hash: item.sha.substring(0, 7),
            author: item.commit.author.name,
            date: new Date(item.commit.author.date).toLocaleString(),
            message: item.commit.message
          };
        });
      }
    } catch (e) {
      console.error('GitHub commits log query failed', e);
    }
  } else {
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
  }

  res.json(history);
});

// API: Restore a Page from Backup
app.post('/api/project/:name/restore', async (req, res) => {
  const { name } = req.params;
  const { file, backupFile } = req.body;

  if (!file || !backupFile) {
    return res.status(400).json({ error: 'File path and backup filename are required' });
  }

  try {
    if (GITHUB_TOKEN) {
      const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };
      const backupPath = `projects/${name}/_backups/${backupFile}`;
      
      const backupRes = await makeHttpsRequest(`https://api.github.com/repos/${GITHUB_REPO}/contents/${backupPath}`, 'GET', headers);
      if (backupRes.status !== 200 || !backupRes.body) {
        return res.status(404).json({ error: `Backup file '${backupFile}' not found on GitHub` });
      }

      const content = Buffer.from(backupRes.body.content, 'base64').toString('utf8');
      await saveFileToGitOrLocal(name, file, content);
    } else {
      const projectDir = path.join(PROJECTS_DIR, name);
      const backupPath = path.join(projectDir, '_backups', backupFile);
      const activePath = path.join(projectDir, file);

      if (!fs.existsSync(backupPath)) {
        return res.status(404).json({ error: `Backup file '${backupFile}' not found` });
      }

      fs.copyFileSync(backupPath, activePath);

      const relativeFilePath = path.join('projects', name, file).replace(/\\/g, '/');
      runGitCommand(`git add "${relativeFilePath}"`, WORKSPACE_DIR)
        .then((addRes) => {
          if (addRes.success) {
            runGitCommand(`git commit -m "Visual Editor: restored '${file}' from backup '${backupFile}'"`, WORKSPACE_DIR);
          }
        });
    }

    res.json({ success: true, message: `Successfully restored '${file}' to previous version.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to restore backup version', details: err.message });
  }
});

// API: Push Committed Git Changes (Local only)
app.post('/api/project/:name/git-push', async (req, res) => {
  if (GITHUB_TOKEN) {
    return res.json({ success: true, message: 'All changes are already saved live on GitHub!' });
  }

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

// Export app or listen (Dual-Mode start)
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(` Kasim Shah Website Engine Control Panel Active!`);
    console.log(` Dashboard URL: http://localhost:${PORT}/admin/index.html`);
    console.log(`======================================================\n`);
  });
}
