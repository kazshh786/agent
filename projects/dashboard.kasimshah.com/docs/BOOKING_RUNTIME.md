# Live KS OS Booking Runtime

Generated websites use the branded same-origin `/book` page. The embedded widget calls the Agency OS `/api/booking` gateway with the public site key. The gateway validates the exact website origin, active workspace, booking entitlement and connected KS OS tenant before decrypting the service credential on the server. Credentials and KS OS database keys are never sent to a website browser.

KS OS owns catalog, availability, customer, appointment and payment records. Slot creation is performed by an atomic Postgres RPC with an advisory lock and idempotency key. Paid bookings hold a slot for 15 minutes and become confirmed only after a verified Stripe webhook. Pay-later and no-payment bookings confirm without fabricating a transaction.

Required KS OS variables are `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KS_OS_SERVICE_TOKEN`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET`. Configure Stripe to deliver PaymentIntent events to `/api/v1/webhooks/stripe`.

Required Agency OS variables are `KS_OS_API_URL`, `INTEGRATION_ENCRYPTION_KEY`, `JOB_RUNNER_SECRET` and a random `BOOKING_RATE_LIMIT_SALT` of at least 32 characters. Booking gateway limits are distributed through Supabase and store only an HMAC of the website ID and client IP, never the raw IP. Connect a workspace to an existing KS OS tenant UUID, run the connection job, then recompile its website so the live booking widget is included.
