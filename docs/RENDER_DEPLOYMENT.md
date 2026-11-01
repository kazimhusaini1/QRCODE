# Render free demo deployment

The root `render.yaml` defines the web app, API, and Redis as Render Free services. MySQL runs on the external free TiDB Cloud Starter tier. This is for a demo/staging environment, not production: free Render services can sleep, share a limited monthly instance-hour allowance, and may be restarted. Free Redis is volatile, so queued jobs and rate-limit counters can be cleared after a restart.

## Free-tier demo choices

- **Render:** free Docker web services for the Next.js web app and NestJS API, plus free Key Value for Redis.
- **TiDB Cloud Starter:** choose MySQL-compatible mode. Use its Prisma connection URL with `sslaccept=strict` as `DATABASE_URL`; the API startup runs the Prisma migrations and seed. The included free quota is limited and connections are throttled/denied if it is exhausted.
- **Resend:** email verification and password recovery use Resend. Verify a sender domain and enter `RESEND_API_KEY` and `AUTH_EMAIL_FROM` in Render.
- **SMS:** disabled for this free demo (`SMS_AUTH_ENABLED=false`). Users must register and verify with email. Enable it and configure Twilio before using this as a real customer service.
- **Product uploads:** disabled for this free demo (`PRODUCT_UPLOADS_ENABLED=false`). Configure S3-compatible storage such as Cloudflare R2 and enable uploads before merchant use.

## Deploy

1. In Render, create a Blueprint from this GitHub repository and select the root `render.yaml` on branch `main`.
2. Enter `DATABASE_URL`, `RESEND_API_KEY`, and `AUTH_EMAIL_FROM` in Render. Never commit provider credentials or share them in chat.
3. For TiDB, use the connection details from the TiDB Connect dialog and ensure the URL looks like `mysql://USER:PASSWORD@HOST:4000/DATABASE?sslaccept=strict`.
4. Confirm the Render service URLs match the origins in `render.yaml`. If Render assigns different service names, update API and web URLs, sync the Blueprint, and redeploy.
5. Check `/api/v1/health`, email verification, email password recovery, and COD checkout with demo data.

The free profile keeps `NODE_ENV=production`, contact verification enabled, and authentication test mode disabled. The only implemented payment method remains COD/cash on pickup. Do not use the free demo with real customer accounts or orders; move to persistent paid infrastructure and enable SMS and image storage before launch.
