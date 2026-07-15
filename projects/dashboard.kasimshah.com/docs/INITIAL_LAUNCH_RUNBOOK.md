# Initial Launch Runbook

Use staging first. Record deployment IDs, correlation IDs, the test booking reference, signed source event IDs, automation run IDs, timestamps, and the final launch-readiness JSON. Do not record customer details or secrets.

## Exact order

1. **Migrations.** Back up both databases. Apply Dashboard migrations in filename order through `20260714080000_unified_attribution.sql`. Apply the verified KS OS Phase 6 migrations and `module12_automation_event_outbox.sql`. Confirm tables/RPCs and run database tests.
2. **Environment variables.** Configure environment-specific Supabase, website engine, integration encryption, KS OS service, booking rate-limit, automation event/worker, `ATTRIBUTION_IDENTITY_SECRET`, Stripe, app URL, and cron settings. Use 32+ random-character secrets. Set mock fallbacks false. Do not yet mark security headers verified. The staging Website Engine must set `GITHUB_BRANCH` to the verified staging/feature branch (never `main`); production must set it to `main` only after GO approval.
3. **KS OS deployment.** Deploy the verified KS OS staging commit. Verify service health, shop/mobile availability, pay-later creation, Stripe test-mode webhook verification, outbox claim/delivery, and that mobile addresses never leave KS OS.
4. **Dashboard deployment.** Deploy the Prompt 10 staging branch. Verify `/api/health`, authentication, CSP/frame/content-type/referrer/permissions headers, API no-store headers, and then set `SECURITY_HEADERS_ACTIVE=true` and redeploy.
5. **Stripe webhook.** Register the staging KS OS webhook URL, configure its signing secret, send a provider test, then complete a real Stripe test-mode payment. The booking must stay unpaid until the signed webhook succeeds.
6. **Tenant connection.** In Agency Integrations, connect KS OS, test it, and map its tenant to the exact agency workspace. Confirm the integration is `connected` and recently checked.
7. **Website compilation.** Compile the launch site with same-domain `/book`, branded header/footer, KS OS tenant mapping, first-party collector, and payment policy. Verify exact-origin rejection from another origin.
8. **Pay-later test.** In a private browser, arrive with test UTM parameters, click the CTA, choose shop or mobile, select service/slot, and create a pay-later booking. Verify one KS OS appointment, one idempotent outbox event, one signed Dashboard conversion, and no revenue.
9. **Stripe test-mode payment.** Repeat with pay-now. Verify payment intent, signed webhook, confirmed booking, one `payment_succeeded` conversion, exact minor-unit revenue/currency, and no card data in Dashboard.
10. **Analytics validation.** Confirm session, UTM persistence, first/last touch, direct not overwriting the known source, CTA/start/confirmation funnel, shop/mobile split, date comparison, data freshness, and CSV isolation. Confirm Email and Social say “Not connected” and ROAS is absent.
11. **Automation validation.** Confirm signed event ingestion, one run per source event, expected action, healthy worker heartbeat, no dead outbox event, and replay idempotency.
12. **Production go/no-go.** Run the full tests/build/verify/diff check and KS OS Phase 6 tests. Run Launch Readiness. Inspect all BLOCKED/DEGRADED remediation, critical jobs, logs and privacy evidence. A platform owner records explicit GO. READY alone does not deploy.

After GO, repeat steps 1–12 with production-specific secrets and endpoints. Rotate every credential ever exposed in chat, screenshots, logs, or test fixtures.
