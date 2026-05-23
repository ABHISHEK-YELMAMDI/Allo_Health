import { Prisma, ReservationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CreateReservationInput } from "@/lib/schemas";

const reservationTtlMinutes = Number(process.env.RESERVATION_TTL_MINUTES ?? 10);

type StockRow = {
  id: string;
  totalUnits: number;
  reservedUnits: number;
};

type ExpiredReservationRow = {
  id: string;
  stockLevelId: string;
  quantity: number;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function releaseExpiredReservations() {
  return prisma.$transaction(async (tx) => {
    const expired = await tx.$queryRaw<ExpiredReservationRow[]>`
      SELECT r.id, s.id as "stockLevelId", r.quantity
      FROM "Reservation" r
      JOIN "StockLevel" s
        ON s."productId" = r."productId"
       AND s."warehouseId" = r."warehouseId"
      WHERE r.status = 'PENDING'::"ReservationStatus"
        AND r."expiresAt" <= NOW()
      FOR UPDATE OF r, s
    `;

    for (const reservation of expired) {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: ReservationStatus.RELEASED,
          releasedAt: new Date(),
        },
      });

      await tx.stockLevel.update({
        where: { id: reservation.stockLevelId },
        data: {
          reservedUnits: { decrement: reservation.quantity },
        },
      });
    }

    return expired.length;
  });
}

export async function createReservation(input: CreateReservationInput) {
  await releaseExpiredReservations();

  return prisma.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<StockRow[]>`
        SELECT id, "totalUnits", "reservedUnits"
        FROM "StockLevel"
        WHERE "productId" = ${input.productId}
          AND "warehouseId" = ${input.warehouseId}
        FOR UPDATE
      `;

      const stock = rows[0];
      if (!stock) {
        throw new ApiError(404, "No stock row exists for that product and warehouse.");
      }

      const available = stock.totalUnits - stock.reservedUnits;
      if (available < input.quantity) {
        throw new ApiError(409, `Only ${available} unit${available === 1 ? "" : "s"} available.`);
      }

      await tx.stockLevel.update({
        where: { id: stock.id },
        data: {
          reservedUnits: { increment: input.quantity },
        },
      });

      return tx.reservation.create({
        data: {
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          expiresAt: new Date(Date.now() + reservationTtlMinutes * 60_000),
        },
        include: {
          product: true,
          warehouse: true,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}

export async function confirmReservation(id: string) {
  return prisma.$transaction(async (tx) => {
    const reservations = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "Reservation"
      WHERE id = ${id}
      FOR UPDATE
    `;

    if (!reservations[0]) {
      throw new ApiError(404, "Reservation not found.");
    }

    const reservation = await tx.reservation.findUniqueOrThrow({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (reservation.status === ReservationStatus.CONFIRMED) {
      return reservation;
    }

    if (reservation.status === ReservationStatus.RELEASED) {
      throw new ApiError(409, "Reservation was already released.");
    }

    const stockRows = await tx.$queryRaw<StockRow[]>`
      SELECT id, "totalUnits", "reservedUnits"
      FROM "StockLevel"
      WHERE "productId" = ${reservation.productId}
        AND "warehouseId" = ${reservation.warehouseId}
      FOR UPDATE
    `;

    const stock = stockRows[0];
    if (!stock) {
      throw new ApiError(404, "Stock row no longer exists.");
    }

    if (reservation.expiresAt <= new Date()) {
      await tx.reservation.update({
        where: { id },
        data: {
          status: ReservationStatus.RELEASED,
          releasedAt: new Date(),
        },
      });

      await tx.stockLevel.update({
        where: { id: stock.id },
        data: {
          reservedUnits: { decrement: reservation.quantity },
        },
      });

      throw new ApiError(410, "Reservation expired before payment completed.");
    }

    await tx.stockLevel.update({
      where: { id: stock.id },
      data: {
        totalUnits: { decrement: reservation.quantity },
        reservedUnits: { decrement: reservation.quantity },
      },
    });

    return tx.reservation.update({
      where: { id },
      data: {
        status: ReservationStatus.CONFIRMED,
        confirmedAt: new Date(),
      },
      include: {
        product: true,
        warehouse: true,
      },
    });
  });
}

export async function releaseReservation(id: string) {
  return prisma.$transaction(async (tx) => {
    const reservations = await tx.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM "Reservation"
      WHERE id = ${id}
      FOR UPDATE
    `;

    if (!reservations[0]) {
      throw new ApiError(404, "Reservation not found.");
    }

    const reservation = await tx.reservation.findUniqueOrThrow({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (reservation.status !== ReservationStatus.PENDING) {
      return reservation;
    }

    const stockRows = await tx.$queryRaw<StockRow[]>`
      SELECT id, "totalUnits", "reservedUnits"
      FROM "StockLevel"
      WHERE "productId" = ${reservation.productId}
        AND "warehouseId" = ${reservation.warehouseId}
      FOR UPDATE
    `;

    const stock = stockRows[0];
    if (!stock) {
      throw new ApiError(404, "Stock row no longer exists.");
    }

    await tx.stockLevel.update({
      where: { id: stock.id },
      data: {
        reservedUnits: { decrement: reservation.quantity },
      },
    });

    return tx.reservation.update({
      where: { id },
      data: {
        status: ReservationStatus.RELEASED,
        releasedAt: new Date(),
      },
      include: {
        product: true,
        warehouse: true,
      },
    });
  });
}
