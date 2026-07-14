/**
 * Verify Script - Pre-deployment Checks
 * Validates JavaScript syntax, required files, environment variable names,
 * no committed secrets, no localhost production dependency, and no mock success fallbacks.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.error(`  ❌ ${msg}`); errors++; }
function warn(msg) { console.warn(`  ⚠️  ${msg}`); warnings++; }

console.log('\n🔍 Verify: Pre-deployment Checks\n');

// 1. JavaScript syntax validation
console.log('--- JavaScript Syntax ---');
const jsFilesToCheck = [
  'app.js',
  'js/router.js',
  'api/_utils.js',
  'api/health.js',
  'api/me.js',
  'api/workspaces.js',
  'api/projects.js',
  'api/integrations.js',
  'api/jobs.js',
  'api/jobs/run.js',
  'api/_crypto.js',
  'api/_providers.js',
  'api/_website.js',
  'api/_analytics.js',
  'api/websites.js',
  'api/analytics/collect.js',
  'api/analytics/summary.js',
  'api/website-engine/compile.js',
  'scripts/build.js'
];

jsFilesToCheck.forEach(f => {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) {
    fail(`${f}: file not found`);
    return;
  }
  try {
    const code = fs.readFileSync(fp, 'utf8');
    if (f.startsWith('api/') || f.startsWith('scripts/')) {
      new Function('require', 'module', 'exports', '__dirname', '__filename', 'process', code);
    } else {
      new Function(code);
    }
    pass(`${f}: valid syntax`);
  } catch (e) {
    if (e instanceof SyntaxError) {
      fail(`${f}: ${e.message}`);
    } else {
      pass(`${f}: valid syntax (runtime refs OK)`);
    }
  }
});

// 2. Required files
console.log('\n--- Required Files ---');
const required = [
  'index.html', 'styles.css', 'app.js', 'js/router.js',
  '.env.example', 'vercel.json', 'package.json',
  'supabase_migrations.sql',
  'supabase/migrations/20260714040000_website_booking_analytics.sql',
  'docs/WEBSITE_BOOKING_CONTRACT.md', 'docs/ANALYTICS_PRIVACY.md'
];
required.forEach(f => {
  fs.existsSync(path.join(ROOT, f)) ? pass(f) : fail(`${f}: missing`);
});

// 3. Environment variable names in .env.example
console.log('\n--- Environment Variables ---');
const envPath = path.join(ROOT, '.env.example');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
   'WEBSITE_ENGINE_API_URL', 'WEBSITE_ENGINE_API_TOKEN', 'APP_URL',
   'INTEGRATION_ENCRYPTION_KEY', 'JOB_RUNNER_SECRET', 'KS_OS_API_URL', 'KS_OS_SERVICE_TOKEN'].forEach(v => {
    envContent.includes(v) ? pass(v) : fail(`${v}: missing from .env.example`);
  });
} else {
  fail('.env.example not found');
}

// 4. No committed secrets in frontend files
console.log('\n--- Secret Scan (Frontend) ---');
['app.js', 'index.html', 'js/router.js'].forEach(f => {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) return;
  const content = fs.readFileSync(fp, 'utf8');

  // Check for hardcoded Supabase credentials
  if (/const\s+SUPABASE_URL\s*=\s*['"]https:\/\//.test(content)) {
    fail(`${f}: hardcoded SUPABASE_URL found`);
  }
  if (/const\s+SUPABASE_ANON_KEY\s*=\s*['"]sb_/.test(content)) {
    fail(`${f}: hardcoded SUPABASE_ANON_KEY found`);
  }
  if (/service.?role/i.test(content)) {
    fail(`${f}: service-role key reference found`);
  }
  if (/GITHUB_TOKEN/.test(content)) {
    fail(`${f}: GITHUB_TOKEN reference found`);
  }
  if (!/const\s+SUPABASE/.test(content) && !/GITHUB_TOKEN/.test(content) && !/service.?role/i.test(content)) {
    pass(`${f}: no secrets`);
  }
});

// 5. No localhost production dependency
console.log('\n--- Localhost Dependencies ---');
['app.js', 'index.html'].forEach(f => {
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) return;
  const content = fs.readFileSync(fp, 'utf8');
  const matches = content.match(/['"]http:\/\/localhost:\d+['"]/g);
  if (matches && matches.length > 0) {
    fail(`${f}: ${matches.length} hardcoded localhost URL(s) found`);
  } else {
    pass(`${f}: no localhost URLs`);
  }
});

// 6. No mock success fallback in API routes
console.log('\n--- Mock Success Check (API) ---');
const apiDir = path.join(ROOT, 'api');
if (fs.existsSync(apiDir)) {
  const walk = (dir) => {
    let results = [];
    fs.readdirSync(dir).forEach(f => {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) {
        results = results.concat(walk(full));
      } else if (f.endsWith('.js') && !f.startsWith('_')) {
        results.push(full);
      }
    });
    return results;
  };

  walk(apiDir).forEach(fp => {
    const content = fs.readFileSync(fp, 'utf8');
    const rel = path.relative(ROOT, fp);
    if (/simulated.*success|mock.*success|fake.*response/i.test(content)) {
      fail(`${rel}: mock success fallback detected`);
    } else {
      pass(`${rel}: no mock fallbacks`);
    }
  });
} else {
  warn('api/ directory not found');
}

console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${errors} error(s), ${warnings} warning(s)`);
console.log(`${errors === 0 ? '🎉 Verification PASSED' : '❌ Verification FAILED'}\n`);
process.exit(errors > 0 ? 1 : 0);
