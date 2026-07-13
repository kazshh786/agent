# Vercel Setup Guide

> Step-by-step guide for deploying and configuring the agency dashboard on Vercel.

---

## Prerequisites

- A [Vercel](https://vercel.com) account
- The Vercel CLI installed (`npm i -g vercel`)
- Supabase project configured (see [SUPABASE_SETUP.md](./SUPABASE_SETUP.md))
- Git repository connected to Vercel

---

## Step 1: Project Root Configuration

The dashboard project root is:

```
projects/dashboard.kasimshah.com/
```

If this is part of a monorepo, set the **Root Directory** in Vercel project settings:

1. Go to **Settings** → **General** → **Root Directory**
2. Set to: `projects/dashboard.kasimshah.com`

### Framework Preset

- **Framework**: `Other` (no framework — static SPA)
- **Build Command**: None (no build step)
- **Output Directory**: `.` (project root serves as output)
- **Install Command**: None (no dependencies to install)

---

## Step 2: Environment Variables

### Required Variables

Set these in **Vercel Dashboard** → **Settings** → **Environment Variables**:

| Variable | Example Value | Environments | Description |
|----------|---------------|--------------|-------------|
| `SUPABASE_URL` | `https://abc123.supabase.co` | Production, Preview | Supabase project URL |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` | Production, Preview | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | Production, Preview | Supabase service role key (⚠️ server-side only) |
| `APP_URL` | `https://dashboard.kasimshah.com` | Production | Application URL for CORS |
| `WEBSITE_ENGINE_URL` | `https://engine.example.com` | Production, Preview | Website Engine service URL |
| `WEBSITE_ENGINE_API_KEY` | `sk-engine-...` | Production, Preview | Website Engine authentication key |

### `.env.example` Template

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Application
APP_URL=https://dashboard.kasimshah.com

# Website Engine
WEBSITE_ENGINE_URL=https://engine.example.com
WEBSITE_ENGINE_API_KEY=your-engine-api-key
```

> [!CAUTION]
> **Never commit `.env` to version control.** The `.env.example` file contains placeholder values only. Ensure `.env` is listed in `.gitignore`.

---

## Step 3: Custom Domain Setup

### Add Domain

1. Go to **Settings** → **Domains**
2. Add domain: `dashboard.kasimshah.com`
3. Vercel will provide DNS records to configure

### DNS Configuration

Add the following records at your domain registrar:

| Type | Name | Value |
|------|------|-------|
| `CNAME` | `dashboard` | `cname.vercel-dns.com` |

Or if using the apex domain:

| Type | Name | Value |
|------|------|-------|
| `A` | `@` | `76.76.21.21` |

### SSL

Vercel automatically provisions and renews SSL certificates. No manual configuration is needed.

---

## Step 4: Routing Configuration — `vercel.json`

The `vercel.json` file controls routing, headers, and runtime configuration.

### Routing Rules

Routes are evaluated **in order**. The configuration handles four categories:

#### 1. Security Headers (Applied to All Routes)

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://*.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co"
        }
      ]
    }
  ]
}
```

#### 2. API Routes

```json
{
  "rewrites": [
    { "source": "/api/health", "destination": "/api/health.js" },
    { "source": "/api/me", "destination": "/api/me.js" },
    { "source": "/api/workspaces", "destination": "/api/workspaces.js" },
    { "source": "/api/projects", "destination": "/api/projects.js" },
    { "source": "/api/website-engine/compile", "destination": "/api/website-engine/compile.js" }
  ]
}
```

#### 3. Static Assets

Static files (`index.html`, `app.js`, `styles.css`) are served directly from the project root. Vercel serves these automatically — no explicit routing needed.

#### 4. SPA Fallback & Password Reset

```json
{
  "rewrites": [
    { "source": "/password-reset", "destination": "/index.html" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

This ensures:
- `/password-reset` → Serves `index.html` (client-side handles the reset flow)
- All non-API routes → Fall back to `index.html` (SPA routing)
- `/api/*` routes → Never fall through to the SPA

### Route Evaluation Order

```
Request: GET /api/projects
  1. Headers applied (security headers)
  2. Matches /api/projects rewrite → api/projects.js ✅

Request: GET /dashboard
  1. Headers applied
  2. No API match
  3. No static file match
  4. SPA fallback → index.html ✅

Request: GET /password-reset
  1. Headers applied
  2. Matches /password-reset rewrite → index.html ✅
```

---

## Step 5: Node.js Runtime Version

Pin the Node.js runtime for consistent behavior across deployments.

### In `package.json` (if present)

```json
{
  "engines": {
    "node": "18.x"
  }
}
```

### In Vercel Dashboard

1. Go to **Settings** → **General** → **Node.js Version**
2. Select **18.x** (LTS)

> [!NOTE]
> Vercel serverless functions use the runtime version specified in the project settings. Pin this to avoid unexpected behavior from automatic upgrades.

---

## Step 6: Preview vs Production Environments

### Environment Variable Separation

Vercel supports separate environment variables per environment:

| Variable | Production | Preview |
|----------|-----------|---------|
| `APP_URL` | `https://dashboard.kasimshah.com` | `https://<branch>-kasimshah.vercel.app` |
| `SUPABASE_URL` | Production Supabase URL | Same (or staging Supabase) |
| `SUPABASE_ANON_KEY` | Production key | Same (or staging key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Production key | Same (or staging key) |
| `WEBSITE_ENGINE_URL` | Production engine URL | Staging engine URL |
| `WEBSITE_ENGINE_API_KEY` | Production key | Staging key |

### Setting Per-Environment Variables

1. Go to **Settings** → **Environment Variables**
2. When adding a variable, check/uncheck the environments:
   - ✅ **Production** — only for production deployments
   - ✅ **Preview** — for branch/PR deployments
   - ✅ **Development** — for `vercel dev` local development

### Preview Deployment URLs

Vercel generates preview URLs for each push:

```
https://<project>-<hash>-<team>.vercel.app     # Unique per deploy
https://<branch>-<team>.vercel.app              # Branch-based
```

> [!TIP]
> For the `APP_URL` in preview environments, you can use `*` for CORS during development, or implement dynamic CORS that reads the `Origin` header and validates against allowed patterns.

---

## Step 7: Deployment

### Automatic Deployments (Recommended)

Connect your Git repository to Vercel:

1. Go to **Settings** → **Git**
2. Connect your GitHub/GitLab/Bitbucket repository
3. Set the production branch: `main`

Every push to `main` triggers a production deployment. Pushes to other branches create preview deployments.

### Manual Deployment via CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# Deploy from specific directory
cd projects/dashboard.kasimshah.com
vercel --prod
```

### Local Development

```bash
# Run local dev server with Vercel functions
cd projects/dashboard.kasimshah.com
vercel dev

# This serves:
# - Static files from project root
# - API functions from /api/ directory
# - Uses .env for environment variables
```

---

## Verification Checklist

After deployment, verify everything works:

### 1. Health Check

```bash
curl https://dashboard.kasimshah.com/api/health
# Expected: {"status":"ok"}
```

### 2. Static Assets

```bash
curl -I https://dashboard.kasimshah.com/
# Expected: 200 OK, Content-Type: text/html
# Check security headers are present
```

### 3. SPA Routing

```bash
curl -I https://dashboard.kasimshah.com/some-random-path
# Expected: 200 OK (served index.html)
```

### 4. API Authentication

```bash
curl https://dashboard.kasimshah.com/api/me
# Expected: 401 Unauthorized (no token provided)
```

### 5. Security Headers

```bash
curl -I https://dashboard.kasimshah.com/ 2>&1 | grep -i "x-frame-options\|content-security-policy\|x-content-type"
# Expected: All three headers present
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| 404 on API routes | Incorrect `vercel.json` rewrites | Check rewrite rules match function filenames |
| 500 on API routes | Missing environment variables | Verify all 6 env vars are set in Vercel |
| CORS errors | `APP_URL` mismatch | Ensure `APP_URL` matches the domain you're accessing from |
| Blank page | SPA fallback not working | Check the catch-all rewrite in `vercel.json` |
| Auth redirect fails | Redirect URL not in Supabase | Add the deployment URL to Supabase allowed redirects |
| Old code deployed | Cache issue | Trigger a redeploy or clear Vercel cache |

---

## Next Steps

- [ ] Configure Supabase backend → [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
- [ ] Review security design → [SECURITY.md](./SECURITY.md)
- [ ] Understand system architecture → [ARCHITECTURE.md](./ARCHITECTURE.md)
