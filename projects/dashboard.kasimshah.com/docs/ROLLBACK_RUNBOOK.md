# Rollback Runbook

1. Declare the incident, record the first observed correlation ID and scope, and stop launch traffic if bookings or attribution integrity are uncertain.
2. Pause automation and KS OS outbox cron invocations by disabling the deployment or rotating worker credentials. Do not delete queued events.
3. Roll Dashboard and KS OS back to their last known-good deployments. Additive database migrations stay in place; never run an improvised destructive down migration during an incident.
4. If payments are affected, disable pay-now in website policy and retain pay-later only after KS OS booking creation is verified. Never mark a payment successful manually without provider evidence.
5. If attribution is affected, stop trusted ingestion, preserve source event IDs, and mark the launch gate BLOCKED. Do not edit historical models; repair and run an audited recalculation.
6. Reconcile KS OS appointments, Stripe events, outbox rows, Dashboard conversions, integration jobs, and automation runs. Redeliver by original source event ID so uniqueness constraints prevent duplicates.
7. Confirm mobile addresses, customer details, secrets, and payment data were not emitted to analytics or logs. Rotate exposed secrets immediately.
8. Restore workers one at a time, observe health/failure counters, repeat pay-later and Stripe test-mode journeys, then rerun Launch Readiness.
9. A platform owner documents recovery and approves re-release. Do not rely on READY without manual evidence.
