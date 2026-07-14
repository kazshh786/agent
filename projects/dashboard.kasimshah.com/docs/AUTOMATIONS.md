# Launch Automation Engine

## Supported contract

The Automations module consumes signed, idempotent events from trusted platform services. Launch triggers are `contact.created`, `contact.added_to_list`, `website.form_submitted`, `booking.created`, `booking.cancelled`, and `appointment.completed`.

Launch actions are deliberately bounded to contact tags/lists, internal notifications, trusted booking links, and delays. Definitions cannot contain arbitrary JavaScript, SQL, shell commands, webhooks, or user-supplied URLs. Email and social actions return `MODULE_NOT_INSTALLED` until their production modules are delivered.

Workflows are immutable by version. Owners/admins activate a selected version; editors can draft and test; viewers can inspect history. Activating a newer version does not change an already-created run.

## Delivery and execution

KS OS writes booking lifecycle events to `automation_event_outbox` in the same transaction as the appointment change. Its dispatcher signs the exact JSON body with HMAC-SHA256 using `AUTOMATION_EVENT_SECRET`. The dashboard verifies the signature and a five-minute timestamp window, applies a safe payload allowlist, and uses `(workspace_id, source, source_event_id)` for replay protection.

Vercel invokes `/api/automations/worker` once per minute. Runs are leased with `FOR UPDATE SKIP LOCKED`; each step has durable status, controlled error codes, a maximum of three attempts, bounded exponential retry, and explicit cancellation for queued/waiting runs. Delays are limited to 90 days and never hold a serverless request open.

## Required environment

- Dashboard: `AUTOMATION_EVENT_SECRET`, plus `AUTOMATION_WORKER_SECRET` or Vercel `CRON_SECRET`.
- KS OS: the same `AUTOMATION_EVENT_SECRET`, `AUTOMATION_EVENT_INGEST_URL=https://dashboard.kasimshah.com/api/automations/events`, plus `AUTOMATION_OUTBOX_WORKER_SECRET` or Vercel `CRON_SECRET`.
- Existing KS OS connection setup must run again once so the Agency workspace UUID is linked to the KS OS tenant.

Apply the dashboard migration `20260714070000_automation_engine.sql` and KS OS `module12_automation_event_outbox.sql` before enabling the cron jobs.

## Data boundary

Automation events contain opaque contact/booking IDs, booking timestamps, channel, status, and amount/currency when available. Customer names, email addresses, phone numbers, mobile service addresses, credentials, and payment secrets are excluded. Run history stores only controlled error codes and safe outputs.
