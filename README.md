# Mahalla — local commerce for Lahore

Mahalla is the foundation for a society-based marketplace. It is a monorepo for a shared REST API, customer and operations web app, and Expo mobile app.

## Current implementation status

Implemented: Prisma/MySQL schema and migrations; Park View City seed; society-based discovery; password registration/login and rotating, revocable refresh sessions; secure web cookies and mobile keychain/keystore storage; persistent MySQL authentication rate limiting; Twilio SMS and Resend email verification and password-reset flows; retryable BullMQ email/SMS order notifications; S3-compatible signed product-image uploads with server-side size/type verification; customer addresses, order history, pending-order cancellation, post-completion reviews and customer support tickets with admin triage, editable customer profiles and configurable email/SMS order-notification preferences; responsive marketplace web pages and SEO sitemap/robots; merchant application, shared catalog, central stock and inventory movement history, merchant operating hours, 30-day sales analytics, owner-managed scoped staff roles, multi-society service-area management and order handling; admin bootstrap, merchant approval, society/category operations, customer/order inspection, promotion management, referral reporting, support ticket triage, review moderation, date-filtered society/merchant sales reports with CSV export, bounded Redis caching with mutation invalidation, configurable human-review order risk indicators, cash-only COD/pickup checkout, and an authenticated write audit trail with filtered before/request/after details and configurable retention; one-merchant checkout with inventory reservation, idempotent retries, immutable snapshots, usage-limited coupon discounts, inviter rewards after a referred customer’s first completed order, status history and stock restoration; Expo customer discovery, account recovery, verification, addresses, favorites, reorder, single-merchant bag, coupon quote, COD/pickup checkout, order tracking and reviews; Dockerfiles/Compose; CI; API policy tests and a database-backed commerce journey updated to cover verification, password recovery, coupons, referrals and reviews. Remaining launch work includes live Twilio/Resend/S3 delivery verification, push notifications, product variants, production support contacts, monitoring/error reporting, backup restore drills, final legal review and independent security review. A fuller fraud/disputes workflow remains. The updated database-backed journey has not run after the latest migrations: Docker Desktop returned HTTP 500 from its Linux engine endpoint. Web and Expo production exports passed when run with elevated filesystem access. Native push registration is not implemented because the package registry TLS certificate validation failed in this environment; do not bypass TLS verification.

## Prerequisites

- Node.js 20.18+ and pnpm 9
- Docker Desktop
- Expo Go or Android Studio for mobile development

## Local setup

1. Copy `.env.example` to `.env` and replace all secrets/passwords.
2. Start the local stack: `docker compose up --build -d`. Set `JWT_ACCESS_SECRET` in `.env` to at least 32 random characters. For database-only development, use `docker compose up -d mysql redis`.
3. Install dependencies: `pnpm install`.
4. Apply committed database migrations: `pnpm --filter @mahalla/api exec prisma migrate deploy`; for local development, generate the Prisma client with `pnpm --filter @mahalla/api exec prisma generate`.
5. Seed initial society/category data: `pnpm db:seed`.
6. Start API and web outside Docker: set `API_INTERNAL_URL=http://localhost:4000/api/v1` and `PUBLIC_SITE_URL=http://localhost:3000` in `.env`, then run `pnpm dev`. API docs will be at `http://localhost:4000/api/docs` in development; Swagger is disabled by default in production. The local Docker stack uses `API_INTERNAL_URL=http://api:4000/api/v1` between containers and exposes the web app at `http://localhost:3001` (override `WEB_HOST_PORT` if needed) and API at port 4000.
7. Start mobile separately: `pnpm dev:mobile` and set `EXPO_PUBLIC_API_URL` to an address reachable from the device (use the development machine's LAN IP instead of localhost on a physical phone).

## Initial administrator

After the API is running and the database is migrated, create the first admin once with `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 14 characters in the environment, then run `pnpm --filter @mahalla/api bootstrap-admin`. In Docker, pass those values only to the one-time `docker compose exec api ...` command; do not add them to Compose or commit them. The command refuses to create another super administrator if one already exists. Remove the bootstrap values from the shell/secret store after use.

## Data model decisions

- Society is a service-area/visibility entity, never a merchant branch.
- `MerchantSociety` links one merchant profile to any number of societies.
- `Product` and `Inventory` belong to the merchant, not a society.
- Order and line-item fields retain immutable merchant, address, society, price, discount and quantity snapshots.
- Monetary values use integer paisa to avoid floating-point rounding.

## Operational notes

Twilio SMS and Resend email adapters back verification, password recovery and retryable order notifications. Live delivery still needs verified provider accounts, credentials and delivery checks. Product-image uploads use short-lived S3-compatible SigV4 URLs; storage credentials, bucket CORS and a public asset domain must be configured. For production, set `REQUIRE_CONTACT_VERIFICATION=true`; startup checks enforce this and require both messaging providers, Redis and storage. Only COD and cash-on-pickup are implemented. Do not expose the current stack publicly until the remaining integrations and launch controls in `docs/deployment/runbook.md` are complete. The API uses persistent MySQL auth throttling; behind a proxy set and verify `TRUST_PROXY_HOPS` so client IP bucketing reflects the trusted ingress. Refresh-token rotation/revocation is implemented. See `docs/architecture/overview.md`.
