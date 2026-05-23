import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const sku = "ALLO-RACE-TEST";
const warehouseCode = "RACE";

type ReservationResponse = {
  reservation?: {
    id: string;
    status: string;
  };
  error?: string;
};

async function postReservation(productId: string, warehouseId: string) {
  const response = await fetch(`${baseUrl}/api/reservations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
  });

  const body = (await response.json()) as ReservationResponse;

  return {
    status: response.status,
    body,
  };
}

async function main() {
  console.log(`Running concurrency test against ${baseUrl}`);

  await prisma.reservation.deleteMany({
    where: {
      product: { sku },
    },
  });
  await prisma.stockLevel.deleteMany({
    where: {
      product: { sku },
    },
  });
  await prisma.product.deleteMany({ where: { sku } });
  await prisma.warehouse.deleteMany({ where: { code: warehouseCode } });

  const product = await prisma.product.create({
    data: {
      sku,
      name: "Race Condition Test SKU",
      description: "Single-unit SKU used by the concurrency smoke test.",
      priceCents: 10000,
    },
  });

  const warehouse = await prisma.warehouse.create({
    data: {
      code: warehouseCode,
      name: "Race Test Warehouse",
      city: "Test City",
    },
  });

  await prisma.stockLevel.create({
    data: {
      productId: product.id,
      warehouseId: warehouse.id,
      totalUnits: 1,
      reservedUnits: 0,
    },
  });

  const [first, second] = await Promise.all([
    postReservation(product.id, warehouse.id),
    postReservation(product.id, warehouse.id),
  ]);

  const statuses = [first.status, second.status].sort();
  const passed = statuses[0] === 201 && statuses[1] === 409;

  console.log("Responses:");
  console.log(first);
  console.log(second);

  const stock = await prisma.stockLevel.findUniqueOrThrow({
    where: {
      productId_warehouseId: {
        productId: product.id,
        warehouseId: warehouse.id,
      },
    },
  });

  console.log("Final stock:", {
    totalUnits: stock.totalUnits,
    reservedUnits: stock.reservedUnits,
    availableUnits: stock.totalUnits - stock.reservedUnits,
  });

  await prisma.reservation.deleteMany({
    where: {
      productId: product.id,
      warehouseId: warehouse.id,
    },
  });
  await prisma.stockLevel.deleteMany({
    where: {
      productId: product.id,
      warehouseId: warehouse.id,
    },
  });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.warehouse.delete({ where: { id: warehouse.id } });

  if (!passed) {
    throw new Error(
      `Expected one 201 and one 409, received ${first.status} and ${second.status}.`,
    );
  }

  console.log("Concurrency test passed: exactly one reservation succeeded.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
