# Render free demo deployment

The root `render.yaml` provisions the web app, API, Render Postgres, and Render Key Value on free plans. It needs no provider credentials or accounts outside Render. The API uses a separate Postgres Prisma schema for this demo; local development and CI can continue using the existing MySQL schema.

## Demo limitations

- Render Free web services sleep after inactivity, share a limited monthly instance-hour allowance, and have no persistent local filesystem.
- Render Free Postgres is limited to 1 GB, has no backups, and expires 30 days after creation.
- Render Free Key Value is volatile, so queued jobs and rate-limit counters can be lost on restart.
- `DEMO_MODE=true` disables the production contact-verification requirement. New accounts receive a login token immediately. Do not use this setup for real customer data or orders.
- SMS and product image uploads are disabled. Payment remains COD/cash on pickup.

## Deploy

1. In Render, create a Blueprint from this GitHub repository on branch `main`, using the root `render.yaml`.
2. Review the Blueprint; all four resources are set to the Free plan. Deploy without adding provider secrets.
3. Wait for the PostgreSQL migration and seed, then verify `/api/v1/health` and the web page.
4. The admin account is not created automatically. For a real launch, replace this demo setup with persistent production storage, verified account delivery, image storage, and an initial admin bootstrap.
