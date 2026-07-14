# Integration and Job Foundation

Phase 4 introduces a provider-neutral control plane. A workspace connection contains safe display configuration; credentials are AES-256-GCM encrypted by the API and stored in `integration_credentials`, which has no browser RLS policies. Credentials are never returned to clients.

Provider work is represented by durable, idempotent `integration_jobs`. A scheduler calls `POST /api/jobs/run` with `JOB_RUNNER_SECRET`. The worker atomically claims queued work using `FOR UPDATE SKIP LOCKED`, records attempts, and either succeeds, retries with bounded exponential backoff, or fails with a stable error code.

The initial providers are KS OS Booking, Website Engine, Resend and Meta. A connection is not reported as connected until its provider adapter confirms it. Missing provider contracts are reported honestly as configuration/contract errors.

## Required secrets

- `INTEGRATION_ENCRYPTION_KEY`: exactly 32 random bytes encoded as base64.
- `JOB_RUNNER_SECRET`: strong random bearer secret for the scheduler.
- Provider-specific server secrets, such as `KS_OS_SERVICE_TOKEN`, only after that provider exposes a service contract.

Never place provider credentials in job payloads, audit metadata, connection metadata or browser storage.
