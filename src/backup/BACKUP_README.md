# MongoDB Backup (OAuth + Google Drive)

## Flow

1. User opens **Settings → Google Drive Backup** (`/settings/google-drive`).
2. Clicks **Connect Google Drive**, signs in with Google, and authorizes Drive access.
3. Backend stores the OAuth **refresh token** and user’s **folder ID**.
4. **Manual backup:** User clicks **Run backup now** → backend runs mongodump, zips with archiver, uploads to Drive, then deletes local zip and dump.
5. **Scheduled backup:** Daily at **02:00 AM** the server runs the same backup for the first user who has Drive connected and a folder set.

Backups are **not** kept on the server; the zip and dump folder are removed after a successful upload.

## Backend env vars

- `GOOGLE_OAUTH_CLIENT_ID` – OAuth 2.0 client ID (Google Cloud Console).
- `GOOGLE_OAUTH_CLIENT_SECRET` – OAuth 2.0 client secret.
- `BASE_URL` or `BACKEND_URL` – Backend base URL (e.g. `http://localhost:8003`), used as redirect base for `/api/google/callback`.
- `FRONTEND_URL` or `ADMIN_URL` – Frontend base URL (e.g. `http://localhost:3000`), used to redirect after OAuth.
- `MONGODB_URI` or `DATABASE_URL` – MongoDB connection string.
- `MONGODUMP_PATH` – (Optional) Full path to `mongodump` if not on PATH.

## Google Cloud setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create **OAuth 2.0 Client ID** (application type: Web application).
3. Add **Authorized redirect URI:** `https://your-backend-domain/api/google/callback` (or `http://localhost:8003/api/google/callback` for local).
4. Put Client ID and Client Secret in `.env` as `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`.

## API

- `GET /api/google/auth` – Returns Google OAuth URL (requires auth). Frontend redirects user to this URL.
- `GET /api/google/callback?code=...&state=userId` – Handles OAuth callback, stores refresh token, redirects to frontend.
- `GET /api/google/status` – Returns `{ connected, folderId }` (requires auth).
- `POST /api/google/set-folder` – Body `{ folderId }`. Saves backup folder (requires auth).
- `POST /api/backup/run` – Runs backup for the current user and uploads to their Drive (requires auth).

## Scheduler

- **Cron:** `0 2 * * *` (02:00 AM daily).
- **File:** `src/jobs/backupScheduler.js`.
- **Started in:** `src/server.js`.
- Uses the first stored integration that has both `refreshToken` and `folderId`.
