# Allo Inventory Reservations

This is my implementation of Allo's checkout reservation exercise. It holds inventory for a short checkout window, confirms the hold when payment succeeds, and releases it when the user cancels or the reservation expires.

Live app: https://allo-health-theta.vercel.app

## What I built

- A product listing page with stock split by warehouse.
- A checkout reservation page with reservation details, status, and a live countdown.
- Reserve, confirm purchase, and cancel flows.
- Visible `409` and `410` errors instead of silently hiding failed requests.
- Postgres-backed reservation logic using row-level locks for the race condition case.

## Stack

- Next.js App Router
- TypeScript
- Prisma
- Postgres
- Zod
- Tailwind CSS

## Local setup

Create a local Postgres database:

```sql
CREATE DATABASE allo;
```

Create `.env` using `.env.example` as the template:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/allo?schema=public"
RESERVATION_TTL_MINUTES="10"
```

Then run:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Open `http://localhost:3000`.

## Deployment

The submitted version is deployed on Vercel and uses Neon Postgres.

Set these environment variables in Vercel:

```bash
DATABASE_URL="postgresql://..."
RESERVATION_TTL_MINUTES="10"
```

I ran the migrations and seed against Neon from my local machine:

```bash
npm run prisma:deploy
npm run prisma:seed
```

There is also a `postinstall` script so Prisma Client is generated during the Vercel build.

## API

| Method | Path | Behaviour |
| --- | --- | --- |
| `GET` | `/api/products` | Lists products with available stock per warehouse. |
| `GET` | `/api/warehouses` | Lists warehouses. |
| `POST` | `/api/reservations` | Reserves units. Returns `409` when stock is unavailable. |
| `GET` | `/api/reservations/:id` | Fetches reservation details for the frontend. |
| `POST` | `/api/reservations/:id/confirm` | Confirms a pending reservation. Returns `410` if it expired. |
| `POST` | `/api/reservations/:id/release` | Releases a pending reservation early. |

## Concurrency

The critical code is in `src/lib/reservations.ts`.

When a reservation is created, the API opens a Postgres transaction and locks the matching `StockLevel` row:

```sql
SELECT id, "totalUnits", "reservedUnits"
FROM "StockLevel"
WHERE "productId" = $1
  AND "warehouseId" = $2
FOR UPDATE
```

Only one transaction can hold that lock at a time. After the lock is acquired, the server checks:

```txt
available = totalUnits - reservedUnits
```

If there is enough stock, it increments `reservedUnits` and creates the pending reservation in the same transaction. If two checkout requests race for the final unit, one commits first and the other sees the updated `reservedUnits`, then returns `409`.

Confirming a reservation also happens in a transaction. A valid confirmation decrements both `totalUnits` and `reservedUnits`, because the held unit has become a real sale.

## Expiry

I used lazy cleanup for expiry. Before product reads and reservation creation, the app releases expired pending reservations:

- marks expired `PENDING` reservations as `RELEASED`
- decrements the corresponding `StockLevel.reservedUnits`

This keeps the app simple to deploy without a background worker. For a production version, I would add a Vercel Cron route that calls the same cleanup helper on a schedule, while keeping lazy cleanup as a fallback.

## Trade-offs

- I did not implement the optional idempotency-key bonus. If I added it, I would store the key, request hash, status code, and response body for reservation and confirm requests.
- I kept reservations anonymous. In a real checkout flow, reservations would belong to a customer, cart, or order.
- The UI reserves one unit at a time. The API accepts quantities, but I kept the UI narrow so the concurrency path stayed easy to reason about.
- Expiry is handled with lazy cleanup instead of a cron job. For production, I would add a Vercel Cron route that calls the same cleanup helper regularly.

## Useful Commands

```bash
npm run lint
npm run build
npm run prisma:migrate
npm run prisma:deploy
npm run prisma:seed
npm run test:concurrency
```

`npm run test:concurrency` expects the Next.js dev server to be running. It creates a one-unit test SKU, sends two simultaneous reservation requests to the API, and passes only if exactly one returns `201` and the other returns `409`.
