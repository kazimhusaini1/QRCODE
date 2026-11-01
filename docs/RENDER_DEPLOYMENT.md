# Render production deployment

The root `render.yaml` provisions the web app, API, MySQL, and Redis in Singapore. The API runs Prisma migrations and the idempotent baseline seed before starting. Both web services deploy after the GitHub CI check passes.

## Deploy

1. Push this repository to a GitHub repository that your Render account can access. The workspace currently has no Git remote configured.
2. In Render, create a **Blueprint** from that repository and select the root `render.yaml`.
3. Set the prompted API secrets: Resend sender/API key, Twilio account/auth/from number, and S3-compatible endpoint, bucket, access key, secret, and HTTPS public base URL. Configure those providers with verified production credentials.
4. Confirm the generated service URLs are `https://mahalla-marketplace-web.onrender.com` and `https://mahalla-marketplace-api.onrender.com`. If Render assigns different URLs, update `WEB_ORIGIN`, `PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, and the production `EXPO_PUBLIC_API_URL` in `render.yaml` and `apps/mobile/eas.json`, then sync and redeploy.
5. Verify `/api/v1/health`, account verification delivery, image upload, and a cash-on-delivery order before inviting customers.

The blueprint creates paid persistent infrastructure. The MySQL data disk is mounted at `/var/lib/mysql`; configure and rehearse logical `mysqldump` backups separately. Render's MySQL guide advises using database-native backups instead of relying on disk snapshots for restores. Add a custom domain in Render if you have one, then update the same origin/API URL settings before the production build.
