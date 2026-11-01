# Architecture and implementation boundaries

## Monorepo

- `apps/api`: NestJS modular API and Prisma data layer.
- `apps/web`: Next.js public marketplace, merchant workspace, super-admin workspace and customer account/order pages.
- `apps/mobile`: Expo Router customer app.
- `packages`: reserved for shared DTO/schema/UI packages as the API contracts stabilize.

## Merchant service areas

`MerchantSociety` is the many-to-many eligibility relation. It does not contain branch/location data. Catalog products and stock are merchant-global. Queries start from an explicit society and require an enabled service-area relation. Orders retain society ID, address JSON snapshot, merchant name, line-item name, price and discount snapshots, so historical orders do not change when catalog data changes.

## Order lifecycle target

`PENDING → ACCEPTED → PREPARING → READY_FOR_PICKUP / OUT_FOR_DELIVERY → COMPLETED`; merchant rejection and eligible customer/admin cancellation terminate the flow. The API validates transitions and ownership, uses a serializable transaction for stock reservation and order creation, requires an idempotency key, snapshots order data, appends status events, and restores central stock on cancellation or rejection. Database-backed commerce journey coverage exercises these rules. Provider-backed payments and broader concurrency/load testing remain before launch.

## Security and operational status

The API uses password authentication, 15-minute signed access tokens and rotating, revocable 30-day refresh sessions; merchant/admin/customer routes enforce role and owner checks. The web app stores both tokens in HttpOnly cookies; the mobile app uses Expo SecureStore backed by the OS keychain/keystore. Authentication routes use persistent, atomic MySQL fixed-window buckets keyed by an HMAC of the trusted request IP and route. Set the exact proxy hop count; never trust client-supplied forwarding headers at the ingress. Contact verification and password recovery use expiring, single-use challenge hashes with attempt limits and direct Twilio/Resend delivery adapters; they require live provider configuration and delivery verification. Authenticated state-changing requests are recorded without request bodies. Detailed before/after audit history and retention controls are still absent. Keep the platform private until launch requirements are fulfilled. Secrets belong in deployment configuration, never committed `.env` files. Push, object storage, online payment providers, backups, monitoring and a production security review require separate integration and verification.
