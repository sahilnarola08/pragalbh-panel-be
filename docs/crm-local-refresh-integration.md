# CRM Local Refresh Integration

This implementation adds a CRM-side auth/session layer on top of existing panel APIs, without changing existing panel `/auth/*` behavior.

## New Backend Routes

- `POST /crm-auth/login`
- `POST /crm-auth/verify-otp`
- `POST /crm-auth/refresh`
- `POST /crm-auth/logout`
- `POST /crm-auth/logout-all`
- `GET /crm-auth/me`
- `GET /crm-auth/sessions`
- `GET /crm-gateway/customers`
- `GET /crm-gateway/customers/:id`
- `PATCH /crm-gateway/customers/:id`
- `GET /crm-gateway/customers/:customerId/followups`
- `POST /crm-gateway/customers/:customerId/followups`
- `PATCH /crm-gateway/followups/:id`
- `GET /crm-gateway/_pilot/metrics`

Additionally exposed for CRM-web convenience (same handlers, CRM local token auth):

- `GET /crm/customers`
- `GET /crm/customers/:id`
- `PATCH /crm/customers/:id`
- `GET /crm/customers/:customerId/followups`
- `POST /crm/customers/:customerId/followups`

## Required Environment Variables

Set these in backend `.env`:

- `CRM_PANEL_API_BASE_URL` (panel API base URL, e.g. `http://localhost:5000`)
- `CRM_ENCRYPTION_KEY` (used to encrypt stored panel access token)
- `CRM_AUTH_JWT_SECRET` (CRM local access JWT signing secret)
- `CRM_ACCESS_TOKEN_TTL_MINUTES` (optional, default `15`)
- `CRM_REFRESH_TOKEN_TTL_DAYS` (optional, default `14`)
- `CRM_SESSION_MAX_INACTIVE_DAYS` (optional, default `30`)
- `CRM_REFRESH_COOKIE_NAME` (optional, default `crmRefreshToken`)

## Security Model

- Panel access token is encrypted and stored per CRM session in `CrmSession`.
- Refresh tokens are hashed in `CrmRefreshToken`.
- Refresh token rotates every refresh call.
- Reuse detection revokes the full session token family.
- Refresh token is sent via HTTP-only cookie.

## Frontend CRM UI

New pages in frontend app:

- `/crm/login`
- `/crm/verify-otp`
- `/crm/customers`
- `/crm/customers/:id`
- `/crm/security`

The frontend CRM client is implemented in `src/apiStore/crmGateway.js` and handles automatic refresh on 401 responses.
