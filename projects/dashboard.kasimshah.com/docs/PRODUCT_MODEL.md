# Product Model

This document outlines the dual-experience product model of the Kasim Shah Agency dashboard.

## 1. Two Distinct Application Experiences

The dashboard serves two fundamentally different types of users through two isolated application experiences:

### Agency Control Centre
- **Audience:** Authorised agency staff only.
- **Access:** Granted via the `platform_users` table.
- **Roles:** `platform_owner`, `platform_admin`, `platform_support`.
- **Capabilities:** Provision new customer workspaces, manage workspace lifecycles (activate, suspend, archive, retry), configure active modules, and view platform-wide telemetry.
- **Philosophy:** The agency provisions and manages workspaces on behalf of customers.

### Customer Marketing Workspace
- **Audience:** Customers and their team members.
- **Access:** Granted via the `workspace_members` table (invitation only).
- **Roles:** `owner`, `admin`, `editor`, `viewer`.
- **Capabilities:** Manage their specific business data (projects, CRM, social, etc.) scoped strictly to their workspace.
- **Philosophy:** Customers operate within an isolated boundary. They **cannot** create arbitrary workspaces or access any agency-level operations.

## 2. Authorization Separation

A critical security principle of this architecture is the complete separation of authorization domains:

- **Platform Identity:** Determined solely by the `platform_users` table. Checked via `requirePlatformRole()` in API middleware and `has_platform_role()` in SQL.
- **Customer Identity:** Determined solely by the `workspace_members` table. Checked via `requireWorkspaceMember()` in API middleware and `is_workspace_member()` in SQL.
- **No Cross-Pollination:** A user can simultaneously hold a platform role (e.g., `platform_support`) and a workspace role in specific customer workspaces (e.g., `viewer`). The two are evaluated completely independently. A platform administrator is *not* automatically an owner of customer workspaces unless explicitly invited.

## 3. Workspace Modules

Customer workspaces are highly modular. Not all customers receive all features.

### Available Modules
The `workspace_module` enum defines the following capabilities:
- `website`
- `analytics`
- `contacts`
- `email`
- `social`
- `booking`
- `crm`

### Management
- Only agency staff (`platform_owner`, `platform_admin`) can enable, disable, or configure modules for a workspace.
- Customers have read-only visibility into which modules are enabled for their workspace.

### Production Connection Status
> **IMPORTANT:** The following modules are designed in the schema but are **NOT YET PRODUCTION-CONNECTED**:
> - **Email**
> - **Social publishing**
> - **Booking**
> - **Analytics**
> 
> Enabling these modules will currently only reveal UI placeholders in the dashboard. They do not yet have live backend integrations.
