# Analytics Privacy and Retention

This is privacy-friendly, first-party analytics. GA4 is not required.

## Data minimisation

- No raw IP column exists.
- User agents are reduced to a three-value family before storage.
- Raw email and phone are not stored for attribution. A dedicated secret creates workspace-specific HMAC values.
- Mobile service addresses remain exclusively in KS OS and are absent from every analytics schema, event allowlist, API response, export, and agency summary.
- Medical notes, card data, provider secrets, confidential form answers, and arbitrary metadata are rejected.
- Only allowlisted metadata keys reach PostgreSQL, where the allowlist is enforced again.
- Agency summaries contain workspace aggregates and health only; they expose no customer PII or payment detail.

## Consent and deletion

Identity linkage requires a matching workspace/site/session, a completed form or booking, and an `analytics` or `marketing` consent basis. The server may create an `unknown` session fallback for a valid booking submission so a collector race cannot break the booking-to-session bridge, but it does not create an identity HMAC without consent. `anonymise_attribution_session` clears identity HMAC, customer and booking references, reduced device/referrer values, and event metadata while retaining non-identifying aggregate measurement. The action is audited. Cross-workspace linkage is rejected.

Each workspace has 30–730 day raw-data retention, default 365 days. `apply_analytics_retention` is service-only and deletes expired sessions, cascading raw touchpoints and identities while leaving anonymous rollups and conversions whose session reference is set to null. Retention execution should be scheduled after launch.

## Exports and recalculation

CSV export is authenticated, tenant-filtered, capped at 5,000 rows, formula-injection protected, and audited with actor, row count, and safe filters. Recalculation is owner/admin only, range-capped, model-versioned, and audited. Neither operation returns raw identity HMACs.

Before production, document the controller, lawful basis, customer notice, subject-rights process, and final retention period with qualified privacy counsel.
