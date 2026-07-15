# Analytics Definitions

| Metric | Definition | Source of truth |
|---|---|---|
| Unique sessions | Distinct first-party session IDs first seen in the selected period | Website collector |
| Booking CTA clicks | Accepted `booking_cta_clicked` touchpoints | Website collector |
| Booking starts | Accepted `booking_started` touchpoints | Website collector |
| Confirmed bookings | `booking_confirmed` conversions accepted from a signed KS OS event | KS OS |
| Booking conversion rate | Confirmed bookings divided by unique sessions | Website + KS OS |
| Verified booking revenue | Sum of `payment_succeeded.revenue_minor` | KS OS event backed by verified Stripe webhook |
| Shop/mobile bookings | Confirmed bookings grouped by signed booking type | KS OS |
| First-touch channel | Earliest eligible touch before conversion | Versioned attribution model |
| Last-touch channel | Latest eligible non-direct touch before conversion, else direct | Versioned attribution model |
| Data freshness | Latest accepted session, touchpoint, or server conversion timestamp | Canonical attribution tables |

An empty result means no trusted data exists for the selected range. `LIMITED_DATA` means the range has insufficient sessions; `QUERY_LIMIT_REACHED` means the response reached the bounded read limit. Multiple currencies are never summed into a fabricated display currency.

Date comparison uses the immediately preceding period of equal length. A percentage is `null` when the prior period is zero. Campaign rows intentionally report `spendMinor: null` and `roas: null` until a real spend source is connected.

Email Marketing and Social Publishing are not initial-launch data sources. Their UI state is “Not connected,” not zero performance.
