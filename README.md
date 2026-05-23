# Allo Inventory Reservations

A focused Next.js take-home implementation for checkout-time inventory holds across multiple warehouses.

## What is built

- Product listing with available stock per warehouse.
- Reservation creation with a 10 minute hold window.
- Reservation detail page with a live expiry countdown.
- Confirm and cancel flows that update the UI without a manual refresh.
- API errors for insufficient stock (`409`) and expired reservations (`410`) are shown to the user.
- Postgres-backed reservation logic using row-level locks for concurrency safety.

## Stack

- Next.js App Router
- TypeScript
- Prisma
- Postgres
- Zod
- Tailwind CSS

## Local Setup

Create a local Postgres database, for example:

```sql
CREATE DATABASE allo;
```

Create `.env` from `.env.example`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/allo?schema=public"
RESERVATION_TTL_MINUTES="10"
```

Install dependencies and set up the database:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

Open `http://localhost:3000`.

## Deployment

Recommended deployment:

- App: Vercel
- Database: Neon or Supabase Postgres

Set these environment variables in Vercel:

```bash
DATABASE_URL="postgresql://..."
RESERVATION_TTL_MINUTES="10"
```

For hosted Postgres, run migrations and seed from your local machine using the hosted `DATABASE_URL`:

```bash
npm run prisma:deploy
npm run prisma:seed
```

The `postinstall` script runs `prisma generate`, so Vercel has a generated Prisma Client during build.

## API

| Method | Path | Behaviour |
| --- | --- | --- |
| `GET` | `/api/products` | Lists products with available stock per warehouse. |
| `GET` | `/api/warehouses` | Lists warehouses. |
| `POST` | `/api/reservations` | Reserves units. Returns `409` when stock is unavailable. |
| `GET` | `/api/reservations/:id` | Fetches reservation details for the frontend. |
| `POST` | `/api/reservations/:id/confirm` | Confirms a pending reservation. Returns `410` if it expired. |
| `POST` | `/api/reservations/:id/release` | Releases a pending reservation early. |

## Concurrency Strategy

The critical code is in `src/lib/reservations.ts`.

When creating a reservation, the API opens a Postgres transaction and locks the matching `StockLevel` row:

```sql
SELECT id, "totalUnits", "reservedUnits"
FROM "StockLevel"
WHERE "productId" = $1
  AND "warehouseId" = $2
FOR UPDATE
```

Only one transaction can hold that row lock at a time. The server then checks:

```txt
available = totalUnits - reservedUnits
```

If there is enough stock, it increments `reservedUnits` and creates a pending reservation in the same transaction. If two checkout requests race for the final unit, one transaction commits first and the second sees the updated `reservedUnits`, then returns `409`.

Confirming a reservation also happens in a transaction. The reservation row and stock row are locked. A valid confirmation decrements both `totalUnits` and `reservedUnits`, because the held unit has become a real sale.

## Expiry Strategy

This implementation uses lazy cleanup. Before reads and reservation creation, the app releases expired pending reservations:

- marks expired `PENDING` reservations as `RELEASED`
- decrements the corresponding `StockLevel.reservedUnits`

This keeps the demo deployable without a background worker. In production, I would add a Vercel Cron route such as `/api/cron/release-expired` that calls the same cleanup helper every minute. The lazy cleanup would remain as a defensive fallback.

## Trade-offs

- Idempotency keys are not implemented yet. The next step would be an `IdempotencyKey` table storing request hashes and original responses for `POST /api/reservations` and confirm.
- There is no authentication or customer model; reservations are anonymous for the exercise.
- The UI reserves one unit at a time to keep the core flow clear.
- Expiry is lazy rather than a dedicated worker or cron job.

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
