# System Architecture

> Multi-Tenant Agency Dashboard — Architecture Overview

---

## Overview

The dashboard is a **static Single-Page Application (SPA)** deployed on **Vercel**, backed by **Supabase** for authentication, database, and row-level security. The architecture follows a three-tier model:

| Layer        | Technology                          | Purpose                                  |
|--------------|-------------------------------------|------------------------------------------|
| **Frontend** | Vanilla HTML/CSS/JS                 | Dashboard UI, auth flows, module rendering |
| **API**      | Vercel Serverless Functions (Node.js) | Auth middleware, workspace validation, proxying |
| **Database** | Supabase PostgreSQL + RLS           | Data persistence, access control, audit logging |

---

## Architecture Diagram

```mermaid
graph LR
    subgraph Browser
        A[Dashboard SPA]
    end

    subgraph Vercel
        B[Static Hosting]
        C[Serverless API /api/*]
    end

    subgraph Supabase
        D[Auth Service]
        E[PostgreSQL + RLS]
    end

    F[Website Engine<br/>External Service]

    A -->|Loads static assets| B
    A -->|Auth flows via SDK| D
    A -->|API requests with JWT| C
    C -->|Validates JWT & queries| E
    C -->|Proxies compile requests| F

    style A fill:#4f46e5,color:#fff,stroke:#3730a3
    style B fill:#06b6d4,color:#fff,stroke:#0891b2
    style C fill:#06b6d4,color:#fff,stroke:#0891b2
    style D fill:#22c55e,color:#fff,stroke:#16a34a
    style E fill:#22c55e,color:#fff,stroke:#16a34a
    style F fill:#f59e0b,color:#fff,stroke:#d97706
```

---

## Frontend

### Technology

- **Vanilla HTML/CSS/JavaScript** — no build step, no framework
- **Supabase JS Client SDK** — loaded via CDN (`<script>` tag)
- Single `index.html` entry point with client-side routing

### Responsibilities

| Concern               | Implementation                                        |
|------------------------|-------------------------------------------------------|
| Authentication         | Supabase Auth SDK handles login, signup, password reset |
| Session Management     | `supabase-js` manages tokens, auto-refresh             |
| Workspace Selection    | Workspace picker stored in `localStorage`              |
| Module Rendering       | Dynamic DOM creation per selected module               |
| API Communication      | `fetch()` calls to `/api/*` with `Authorization` header |

### Key Patterns

```
┌─────────────────────────────────────────────┐
│                  index.html                  │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Auth     │  │ Sidebar  │  │  Content   │  │
│  │  Screen   │  │  Nav     │  │  Area      │  │
│  └──────────┘  └──────────┘  └───────────┘  │
│                                              │
│  app.js  ←  All client logic                 │
│  styles.css  ←  All styling                  │
└─────────────────────────────────────────────┘
```

- No inline scripts in production (CSP-compatible)
- All user-facing text rendered via `textContent` or DOM APIs (XSS prevention)
- Auth state changes handled via `onAuthStateChange` listener

---

## API Layer

### Location

All serverless functions live under `/api/` in the project root.

### Route Map

| Route                          | Method   | Purpose                              |
|--------------------------------|----------|---------------------------------------|
| `/api/health`                  | `GET`    | Health check, returns `{ status: "ok" }` |
| `/api/me`                      | `GET`    | Returns authenticated user profile     |
| `/api/workspaces`              | `GET`    | Lists workspaces for current user      |
| `/api/projects`                | `GET`    | Lists projects in selected workspace   |
| `/api/website-engine/compile`  | `POST`   | Proxies compile request to engine      |

### Shared Utilities — `_utils.js`

All API routes import from `api/_utils.js`, which provides:

```javascript
// Authentication middleware
async function requireAuth(req)
// → Extracts JWT from Authorization header
// → Validates token with Supabase
// → Returns authenticated user object or throws 401

// Workspace validation
async function requireWorkspaceMembership(userId, workspaceId)
// → Checks workspace_members table
// → Returns member role or throws 403

// Audit logging
async function logAudit({ userId, workspaceId, action, resource, details })
// → Inserts into audit_logs table
// → Includes timestamp, IP, user agent

// Error response helper
function sendError(res, statusCode, message)
// → Consistent error response format
```

### Request Flow

```
1. Request hits Vercel edge
2. Routed to appropriate /api/ function
3. requireAuth() validates JWT
4. requireWorkspaceMembership() checks access
5. Business logic executes
6. Audit log written (for mutations)
7. Response returned
```

---

## Database

### Provider

**Supabase PostgreSQL** with Row Level Security (RLS) enabled on all tables.

### Schema Overview

#### Enums

```sql
-- Workspace roles
CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'editor', 'viewer');

-- Project types
CREATE TYPE project_type AS ENUM ('website', 'social', 'analytics', 'campaign');

-- Project status
CREATE TYPE project_status AS ENUM ('draft', 'active', 'paused', 'completed', 'archived');
```

#### Tables

| Table                      | Purpose                                | RLS |
|----------------------------|----------------------------------------|-----|
| `profiles`                 | User profile data (synced from auth)   | ✅  |
| `workspaces`               | Tenant workspaces                      | ✅  |
| `workspace_members`        | User ↔ Workspace membership + role     | ✅  |
| `brands`                   | Brand configurations per workspace     | ✅  |
| `projects`                 | Projects within workspaces             | ✅  |
| `integration_connections`  | Third-party integration credentials    | ✅  |
| `audit_logs`               | Immutable audit trail                  | ✅  |

#### Key Relationships

```mermaid
erDiagram
    profiles ||--o{ workspace_members : "has memberships"
    workspaces ||--o{ workspace_members : "has members"
    workspaces ||--o{ brands : "contains"
    workspaces ||--o{ projects : "contains"
    workspaces ||--o{ integration_connections : "has"
    workspaces ||--o{ audit_logs : "generates"
    profiles ||--o{ audit_logs : "performed by"
```

### RPC Functions

| Function                       | Purpose                                           |
|--------------------------------|---------------------------------------------------|
| `create_workspace_with_owner`  | Creates workspace + owner membership in a transaction |
| `get_user_role_in_workspace`   | Returns role for a user in a specific workspace    |

---

## Authentication

### Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as Supabase Auth
    participant A as Vercel API

    B->>S: signInWithPassword(email, password)
    S-->>B: JWT access_token + refresh_token
    B->>A: GET /api/me (Authorization: Bearer <JWT>)
    A->>S: Verify JWT
    S-->>A: User object
    A-->>B: Profile data
```

### Details

- **Provider**: Supabase Auth (email/password)
- **Session Storage**: Managed by `supabase-js` client SDK in `localStorage`
- **Token Refresh**: Automatic via `supabase-js` `autoRefreshToken: true`
- **Server-Side Validation**: API functions extract JWT from `Authorization: Bearer` header, validate via Supabase Admin client
- **Password Reset**: Handled via Supabase email templates, redirects to `/password-reset` route

---

## Multi-Tenancy

### Model

**Workspace-based tenant isolation** — every piece of data belongs to a workspace, and users access workspaces through membership.

### Access Control Chain

```
User authenticates
  → workspace_members checked for user_id + workspace_id
    → Role determines permissions (owner > admin > editor > viewer)
      → RLS policies enforce at database level
        → API middleware double-checks at application level
```

### Workspace Isolation

- All database queries include `workspace_id` filter
- RLS policies use `auth.uid()` to check `workspace_members` table
- No cross-workspace data leakage is possible when RLS is enabled
- Users can belong to multiple workspaces with different roles

### Role Hierarchy

| Role     | Read | Create | Edit | Delete | Manage Members | Billing |
|----------|------|--------|------|--------|----------------|---------|
| `viewer` | ✅   | ❌     | ❌   | ❌     | ❌             | ❌      |
| `editor` | ✅   | ✅     | ✅   | ❌     | ❌             | ❌      |
| `admin`  | ✅   | ✅     | ✅   | ✅     | ✅             | ❌      |
| `owner`  | ✅   | ✅     | ✅   | ✅     | ✅             | ✅      |

---

## Website Engine Bridge

### Purpose

The Website Engine is an **external service** that compiles website templates into deployable assets. It is **never exposed directly to the browser**.

### Proxy Architecture

```
Browser → POST /api/website-engine/compile
           │
           ├─ Validate JWT
           ├─ Validate workspace membership
           ├─ Sanitize request payload
           ├─ Generate correlation ID
           │
           └─ POST → Website Engine (internal URL)
                       │
                       └─ Response proxied back to browser
```

### Security Measures

- Request payload validated and sanitized
- Timeout enforced on engine requests
- Path traversal patterns rejected
- Correlation IDs for request tracing
- Engine URL stored as server-side environment variable only

---

## Security Summary

| Layer     | Mechanism                                | Scope              |
|-----------|------------------------------------------|--------------------|
| Database  | Row Level Security (RLS) policies        | Every table        |
| API       | JWT validation + workspace membership    | Every endpoint     |
| Transport | HTTPS (enforced by Vercel)               | All traffic        |
| Headers   | CSP, X-Frame-Options via `vercel.json`   | All responses      |
| Secrets   | Service-role key server-side only         | Vercel env vars    |
| Proxy     | Engine requests never hit browser        | Website Engine     |

> **Defense in depth**: Even if one layer is bypassed, the other layers prevent unauthorized access. RLS at the database level is the final and most critical guard.

---

## File Structure

```
dashboard.kasimshah.com/
├── index.html              # SPA entry point
├── app.js                  # Client-side application logic
├── styles.css              # All styles
├── vercel.json             # Routing, headers, runtime config
├── .env.example            # Environment variable template
├── api/
│   ├── _utils.js           # Shared auth, validation, logging
│   ├── health.js           # GET /api/health
│   ├── me.js               # GET /api/me
│   ├── workspaces.js       # GET /api/workspaces
│   ├── projects.js         # GET /api/projects
│   └── website-engine/
│       └── compile.js      # POST /api/website-engine/compile
├── docs/
│   ├── ARCHITECTURE.md     # This document
│   ├── SUPABASE_SETUP.md   # Supabase configuration guide
│   ├── VERCEL_SETUP.md     # Vercel deployment guide
│   └── SECURITY.md         # Security design document
└── supabase_migrations.sql # Database schema & RLS policies
```
