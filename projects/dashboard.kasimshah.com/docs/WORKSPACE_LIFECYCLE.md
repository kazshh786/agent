# Workspace Lifecycle

This document describes the state machine governing customer workspaces.

## State Machine

```
[provisioning] --activate--> [active]
[provisioning] --fail------> [failed]
[failed]       --retry-----> [provisioning]
[active]       --suspend---> [suspended]
[active]       --archive---> [archived]
[suspended]    --activate--> [active]
[suspended]    --archive---> [archived]
[archived]     ---(none)---> (no transitions in V1)
```

## Lifecycle States

- **provisioning**: Initial state when an agency provisions a workspace. The workspace has no owner and awaits customer invitation (Prompt 2).
- **active**: Normal operating state. Requires a valid owner.
- **suspended**: Temporarily disabled by the agency. Data is preserved but access is blocked.
- **archived**: Permanently disabled. A terminal state in the current architecture.
- **failed**: Provisioning failed (e.g., automated external setup failed).

## Activation Requirements

A workspace cannot transition from `provisioning` to `active` until the following invariants are met:
1. `owner_id` is non-NULL.
2. A matching `workspace_members` record exists with the role `'owner'`.
3. At least one module is enabled in `workspace_modules`.

*Note: Newly provisioned workspaces will correctly remain in `provisioning` status until the customer accepts their invitation.*

## Permission Matrix

| Operation        | platform_owner | platform_admin | platform_support |
|------------------|----------------|----------------|------------------|
| Provision        | ✅             | ✅             | ❌               |
| Activate         | ✅             | ✅             | ❌               |
| Suspend          | ✅             | ✅             | ❌               |
| Archive          | ✅             | ❌             | ❌               |
| Retry            | ✅             | ✅             | ❌               |
| View status      | ✅             | ✅             | ✅               |

## Audit Events

Every lifecycle transition generates an immutable event in the `audit_logs` table:
- `workspace.provisioned`
- `workspace.activated`
- `workspace.suspended`
- `workspace.archived`
- `workspace.provisioning_retried`
- `workspace.modules_updated`

## Legacy Workspaces

Workspaces created prior to the platform control plane (self-service era) are treated as follows:
- They default to `status = 'active'`.
- They have a `metadata` payload indicating `"migration_source": "pre_platform"`.
- Their `provisioned_by` field is `NULL`.
- Existing `owner_id` and memberships are preserved intact.
- The UI will display "Legacy workspace — customer details not configured" instead of blank fields.
- **Agency Action Required**: Agency staff should manually edit these workspaces later to enrich their customer contact information.
