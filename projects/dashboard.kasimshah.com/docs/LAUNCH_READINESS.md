# Launch Readiness

`GET /api/platform/launch-readiness?workspaceId=<uuid>` is an authenticated platform-owner/admin gate. It returns `READY`, `DEGRADED`, or `BLOCKED`; it never deploys or publishes.

Every check returns a stable code, safe explanation, remediation, and timestamp. The gate verifies migration availability, platform owner, active workspace, accepted customer owner, modules, KS OS health and tenant mapping, compiled `/book`, signed test booking, Stripe webhook when online payment is enabled, browser/trusted analytics freshness, active automation and worker heartbeat, environment completeness, mock-mode absence, failed critical jobs, and security-header verification.

`BLOCKED` means at least one blocking launch invariant failed. `DEGRADED` means blocking invariants are satisfied but analytics or automation freshness needs attention. `READY` means all checks pass at that instant; a human still performs the runbook and approves go/no-go.

Required server settings include the normal Supabase, integration, KS OS, booking and automation variables plus `ATTRIBUTION_IDENTITY_SECRET` (32+ random characters), `SECURITY_HEADERS_ACTIVE=true` only after deployed-header verification, and `ALLOW_MOCK_FALLBACKS=false`. Secrets are unique per environment and never exposed in browser configuration.

The staging smoke script needs `STAGING_PLATFORM_ACCESS_TOKEN` for a short-lived platform owner/admin session. Do not save that token in Git or CI logs.
