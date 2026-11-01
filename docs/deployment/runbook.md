# Deployment runbook

## Current boundary

The Compose setup is for local development and verification. A production deployment must not use placeholder secrets or a public MySQL/Redis port. Twilio SMS and Resend email adapters, BullMQ order notifications and S3-compatible signed product-image uploads are implemented but have not been tested against live provider accounts. Push and error monitoring remain unintegrated. Online payments are out of scope; checkout accepts COD or cash on pickup only. Public marketplace reads use bounded Redis caching with mutation-version invalidation; verify cache behavior against the deployed Redis service. Authenticated state-changing requests are recorded with actor, method, path, HTTP status, and allowlisted before/request/after details. Sensitive fields such as contact and address data are filtered. `AUDIT_RETENTION_DAYS` defaults to 365 and must be 30–3650; expired events are pruned at startup and daily. Review this retention period against applicable policy before launch. An independent security review is still required. Refresh-token rotation/revocation and persistent MySQL authentication rate limits are implemented; configure the exact trusted proxy hop count before relying on client IP rate buckets. Rule-based order review indicators surface high value, repeated cancellations/rejections, and high order frequency to merchants and admins; they never automatically restrict accounts. Set `HIGH_VALUE_ORDER_PAISA` for the local high-value threshold. These controls do not replace account verification or a layered abuse defense.

## Environment and release process

1. Provision managed MySQL 8, Redis, and S3-compatible storage in the chosen region. Restrict data services to the private network and enable encryption, backups, and retention.
2. Create unique random JWT secrets of at least 32 bytes in a managed secret store. Set `API_NODE_ENV=production`, `PUBLIC_SITE_URL` to the public HTTPS web origin (required by the API in production), and `WEB_ORIGIN` to the allowed HTTPS origin list. Set `REQUIRE_CONTACT_VERIFICATION=true`; configure `RESEND_API_KEY`, a verified `AUTH_EMAIL_FROM`, and `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER`. Configure `S3_ENDPOINT` (the service appends `/{bucket}/{objectKey}`), `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and an HTTPS `S3_PUBLIC_BASE_URL`. Configure bucket CORS to allow the web origin, `PUT`, and the `Content-Type` header. Configure the API base URL, trusted proxy and database TLS connection outside source control. Swagger is disabled in production unless explicitly enabled with `ENABLE_API_DOCS=true`; keep it disabled on public deployments.
3. Build API and web images from their Dockerfiles in CI. Run Prisma `migrate deploy` as a single release job before shifting application traffic. Do not run `db push` in production.
4. Deploy API and web behind an HTTPS reverse proxy. Terminate TLS at the proxy, forward only the required host/proto headers, configure CORS for the exact web origin, and avoid exposing database/Redis ports.
5. Verify `/api/v1/health`, `/api/docs`, web availability, the selected society, merchant discovery, auth, COD and pickup order creation, order status history, and merchant service-area updates.
6. Monitor application logs, API latency/error rate, database pool use, BullMQ queue depth and delivery failures, and order failures. Alert on failed backups and restore-test results.

## Rollback and recovery

- Keep the previous immutable API/web image tags available. Roll back application images when health checks fail; database changes must use backward-compatible expand/migrate/contract releases.
- Take and verify encrypted MySQL backups before schema releases. Record the restore point and retention window. Restore into an isolated instance first, then validate counts and application connectivity before cutover.
- Never roll back by deleting or rewriting order history. Order and line-item snapshots are the audit record for completed commerce transactions.

## Local Docker

For a local stack, copy `.env.example` to `.env`, replace the JWT secret and database passwords, then run `docker compose up --build -d`. Compose applies committed Prisma migrations before starting the API. The local Docker engine must be running. CI checks schema generation, type checks, unit tests, and platform builds. A database-backed commerce journey script exists and must be run after migrations against MySQL and Redis. Browser/device automation and broader load/concurrency coverage remain to be added.
