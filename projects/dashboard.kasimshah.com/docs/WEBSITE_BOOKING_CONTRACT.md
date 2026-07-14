# Website-to-Booking Contract

Every website is a booking-conversion property. The canonical CTA destination is the same-origin `/book` route. The Website Engine creates this route from the selected template so its header, footer, typography and brand remain consistent with the rest of the site.

The booking provider is always `ks_os`. Phase 5 creates the branded booking shell and event contract; Phase 6 mounts the live KS OS service, staff, availability, customer and payment components into `[data-ks-booking-root]`.

A compiled website is `ready`, not `published`. Publishing requires the Website and Booking modules, a connected KS OS provider, a mapped KS OS tenant and a passing booking health check. Payment policy is one of `no_payment`, `pay_later`, `deposit`, `full_payment` or `customer_choice`.

The Website Engine accepts creation requests only with `WEBSITE_ENGINE_API_TOKEN`. In production, set `WEBSITE_ENGINE_ALLOWED_ORIGIN` to the dashboard origin; browser requests from every other origin are rejected. Compile-result state is written through a service-role-only RPC so a browser user cannot mark an uncompiled site as ready.

The tracker exposes `window.KSAnalytics.track(name, payload)` for the booking widget. It records page views, booking CTA clicks and the complete booking funnel without putting customer names, email addresses, phone numbers or payment details into analytics.
