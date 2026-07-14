# KS OS Integration Boundary

KS OS (`kazshh786/ks-os`) is the booking, POS and CRM product. The Agency OS treats it as the `ks_os` provider for the `booking` module; it does not duplicate KS OS appointment, service, client or payment tables.

The current KS OS repository does not yet provide a service-token API or signed webhook contract. Phase 4 therefore registers KS OS but returns `PROVIDER_CONTRACT_UNAVAILABLE` rather than calling its master-admin provisioning endpoint or fabricating a successful connection.

Before enabling the adapter, KS OS needs versioned service endpoints for health, tenant provisioning/status and signed booking events. Authentication must use scoped service credentials rather than a hard-coded administrator email. Requests need idempotency keys and responses must use stable machine-readable error codes.
