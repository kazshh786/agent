# Conversion Analytics Privacy

Website analytics are first-party and booking-focused. The browser uses a session-scoped random identifier and does not create a persistent tracking cookie. Event ingestion accepts a strict event allowlist, validates the website origin, removes query strings from paths, limits metadata fields and stores no client IP address.

Do not send names, email addresses, telephone numbers, free-text notes, card details or provider credentials. Booking references must be opaque external identifiers. Payment events may include only the minor-unit amount and ISO currency code.

Production must apply edge rate limiting to `/api/analytics/collect`. Retention and deletion schedules should be configured before general availability according to the agency privacy policy and customer agreements.
