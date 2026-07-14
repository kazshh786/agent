/**
 * Build Script - Production Validation
 * Performs meaningful checks before deployment.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let exitCode = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    console.error(`  ❌ ${label}: ${detail}`);
    exitCode = 1;
  }
}

console.log('\n🔨 Build: Production Validation\n');

// 1. Check required files exist
console.log('--- Required Files ---');
const requiredFiles = [
  'index.html', 'styles.css', 'app.js', 'js/router.js',
  'vercel.json', 'package.json', '.env.example',
  'api/_utils.js', 'api/health.js', 'api/me.js',
  'api/workspaces.js', 'api/projects.js',
  'api/website-engine/compile.js',
  'supabase_migrations.sql',
  'docs/ARCHITECTURE.md', 'docs/SUPABASE_SETUP.md',
  'docs/VERCEL_SETUP.md', 'docs/SECURITY.md'
];

requiredFiles.forEach(f => {
  const fullPath = path.join(ROOT, f);
  check(f, fs.existsSync(fullPath), 'File not found');
});

// 2. Validate JavaScript syntax
console.log('\n--- JavaScript Syntax ---');
const jsFiles = [
  'app.js', 'js/router.js',
  'api/_utils.js', 'api/health.js', 'api/me.js',
  'api/workspaces.js', 'api/projects.js',
  'api/website-engine/compile.js'
];

jsFiles.forEach(f => {
  const fullPath = path.join(ROOT, f);
  if (!fs.existsSync(fullPath)) {
    check(f, false, 'File missing');
    return;
  }
  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    // For API files using require/module.exports, wrap to allow parsing
    if (f.startsWith('api/')) {
      new Function('require', 'module', 'exports', '__dirname', '__filename', 'process', content);
    } else {
      new Function(content);
    }
    check(`${f} syntax`, true);
  } catch (e) {
    if (e instanceof SyntaxError) {
      check(`${f} syntax`, false, e.message);
    } else {
      // Runtime errors from missing globals are expected
      check(`${f} syntax`, true);
    }
  }
});

// 3. Check .env.example has all required variables
console.log('\n--- Environment Variables ---');
const requiredEnvVars = [
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'WEBSITE_ENGINE_API_URL', 'WEBSITE_ENGINE_API_TOKEN', 'APP_URL'
];

const envExample = fs.existsSync(path.join(ROOT, '.env.example'))
  ? fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8')
  : '';

requiredEnvVars.forEach(v => {
  check(`${v} in .env.example`, envExample.includes(v), 'Missing from .env.example');
});

// 4. Check vercel.json is valid JSON
console.log('\n--- Vercel Config ---');
try {
  const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  check('vercel.json valid JSON', true);
  check('Has security headers', vj.headers && vj.headers.length > 0, 'No headers configured');
} catch (e) {
  check('vercel.json valid JSON', false, e.message);
}

// 5. No committed secrets
console.log('\n--- Security Scan ---');
const frontendFiles = ['app.js', 'index.html', 'js/router.js'];
const secretPatterns = [
  /supabase_service_role/i,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /sk_live_/,
  /secret_key/i,
  /GITHUB_TOKEN\s*[:=]/
];

frontendFiles.forEach(f => {
  const fullPath = path.join(ROOT, f);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  secretPatterns.forEach(pat => {
    check(`${f} no ${pat.source}`, !pat.test(content), `Potential secret found matching ${pat}`);
  });
});

// 6. No localhost production dependency in frontend
console.log('\n--- Localhost Check ---');
frontendFiles.forEach(f => {
  const fullPath = path.join(ROOT, f);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  const localhostRefs = content.match(/http:\/\/localhost:\d+/g) || [];
  check(
    `${f} no localhost dependency`,
    localhostRefs.length === 0,
    `Found ${localhostRefs.length} localhost reference(s): ${localhostRefs.join(', ')}`
  );
});

// 7. No mock success fallback in API paths
console.log('\n--- Mock Fallback Check ---');
const apiDir = path.join(ROOT, 'api');
if (fs.existsSync(apiDir)) {
  const apiFiles = fs.readdirSync(apiDir, { recursive: true })
    .filter(f => f.endsWith('.js') && !f.startsWith('_'));
  apiFiles.forEach(f => {
    const content = fs.readFileSync(path.join(apiDir, f), 'utf8');
    const hasMockSuccess = /mock.*success|simulated.*success|fake.*response/i.test(content);
    check(`api/${f} no mock success`, !hasMockSuccess, 'Found mock success pattern');
  });
}

console.log(`\n${exitCode === 0 ? '🎉 Build validation PASSED' : '❌ Build validation FAILED'}\n`);
process.exit(exitCode);
