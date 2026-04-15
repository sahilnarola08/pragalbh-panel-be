# CRM Shared Login + Live API Integration

This backend now supports CRM integration using shared auth, client scoping, and live read/write endpoints.

## 1) Auth contract endpoint

- `GET /crm/auth/contract`
- Auth: Bearer token, `x-access-token`, or `token` cookie.
- Returns:
  - `enabled`
  - `accessMode` (`all` or `selected`)
  - `allowedCustomerIds`
  - `permissions`
  - `invitationStatus`
  - `sessionId`

Use this as the first CRM bootstrap call after login.

## 2) Provision CRM access for existing panel users

These are admin routes (panel users API):

- `PUT /users/:id/crm-access`
  - body:
    - `enabled: boolean`
    - `accessMode: "all" | "selected"`
    - `allowedCustomerIds: string[]` (required when mode is `selected`)
- `POST /users/:id/crm-invite`
  - body:
    - `expiresInHours?: number`
  - returns invite token and URL (if `CRM_APP_URL` is configured)

## 3) CRM live API routes

All CRM routes require auth + CRM access + CRM permissions.

- `GET /crm/clients`
- `GET /crm/clients/:id`
- `PATCH /crm/clients/:id`
- `GET /crm/clients/:customerId/followups`
- `POST /crm/clients/:customerId/followups`
- `PATCH /crm/followups/:id`

## 4) Idempotent followup writes

For `POST /crm/clients/:customerId/followups`, send:

- header: `x-idempotency-key: <unique-request-id>`

If the same key is replayed for the same customer, the server returns the existing followup instead of creating duplicates.

## 5) Required permissions

New seeded permissions:

- `crm.auth.validate`
- `crm.clients.view`
- `crm.clients.edit`
- `crm.followups.view`
- `crm.followups.create`
- `crm.followups.edit`
- `crm.access.manage`

Assign these via existing role/user RBAC flows.

## 6) Security notes

- Session revocation remains active through existing session checks.
- Scope enforcement denies access to customers outside assigned scope.
- When CRM invite users sign in, invite status is marked accepted.

