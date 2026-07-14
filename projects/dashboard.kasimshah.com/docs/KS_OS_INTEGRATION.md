# KS OS Integration Boundary

KS OS (`kazshh786/ks-os`) is the system of record for services, staff schedules, availability, customers, appointments and booking payments. Agency OS supplies workspace entitlements, encrypted connection credentials, website configuration and booking-conversion analytics.

Phase 6 uses the versioned KS OS `/api/v1/service` contract. All calls require a scoped `KS_OS_SERVICE_TOKEN`. Agency OS tests an existing tenant through the status endpoint and records the tenant UUID on its website sites. Browser booking traffic passes through `/api/booking`, which validates the website origin and keeps the KS OS token server-side.

The public browser never receives a Supabase service key, KS OS token or Stripe secret key and never writes directly to KS OS tables. Payment card data is collected by Stripe.js; KS OS receives only PaymentIntent results through a signed webhook.
