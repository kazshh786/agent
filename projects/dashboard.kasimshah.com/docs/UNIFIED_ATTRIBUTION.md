# Unified Attribution

Prompt 10 establishes one tenant-scoped path from campaign acquisition to verified booking revenue:

`source/campaign → attribution session → touchpoints → identity link → signed conversion → versioned model → daily rollup`

## Trust boundaries

The public collector accepts only page views and booking-intent interactions. It resolves the website from its unguessable analytics key, requires the exact configured site origin, checks a 24-hour timestamp window, reduces the user agent to `desktop`, `mobile`, or `bot`, and writes through `record_browser_attribution_event`. It cannot submit booking references or money.

`POST /api/analytics/ingest` accepts only HMAC-signed server events. KS OS is the authority for booking lifecycle events. `payment_succeeded` is the only event that may carry `revenueMinor` and `currency`; every other event with revenue fields is rejected. `(workspace, source, source_event_id)` is unique, making retries idempotent.

## Attribution rules

- First touch is the earliest eligible touch at or before a conversion.
- Last touch is the most recent eligible non-direct touch at or before a conversion. Direct is used only when no eligible non-direct touch exists.
- Launch channels are direct, organic, referral, paid, agency/manual, and unknown.
- Email and social are represented as `NOT_CONNECTED` until Prompts 7 and 8.
- ROAS remains `null` unless a future, trusted spend adapter supplies genuine spend.
- Recalculation creates a new `model_version`, records `calculated_at` and a calculation reason, rebuilds the selected daily rollups, and writes an audit event.

## Anonymous to known

Identity linkage happens only through the server after a form or booking submission. The booking proxy atomically links the exact site, workspace, anonymous session and returned KS OS booking reference. If the visitor selected first-party analytics consent, the raw identifier exists only in request memory and PostgreSQL receives a workspace-specific HMAC made with `ATTRIBUTION_IDENTITY_SECRET`. The booking bridge lets the later signed KS OS confirmation inherit the originating session; attribution tables never store an email, phone, or mobile address.

Generated booking pages expose the KS OS shop/mobile selector, request a mobile address only for mobile service, forward that address only to KS OS, and send `booking_type_selected`, `service_selected`, `slot_selected`, and `booking_started` as browser intent. They never emit browser-side confirmation, payment success, or revenue.

## API surface

Viewer-capable reads: `/api/analytics/unified`, `/funnel`, `/attribution`, `/campaigns`, `/bookings`, and `/export`. Filters support workspace, website, dates, channel, source, campaign, and `shop|mobile`; ranges are capped at 366 days, list pages at 100 rows, and CSV exports at 5,000 rows. Recalculation is owner/admin only. Active workspace and analytics entitlement checks are server-side.

All new public tables have RLS. Direct browser mutation is revoked. Service-only functions validate tenant ownership again before writing.
