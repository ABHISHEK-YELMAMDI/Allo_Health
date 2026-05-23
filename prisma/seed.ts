import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.reservation.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  const [mumbai, delhi, bengaluru] = await Promise.all([
    prisma.warehouse.create({
      data: { code: "MUM", name: "Mumbai Fulfillment Hub", city: "Mumbai" },
    }),
    prisma.warehouse.create({
      data: { code: "DEL", name: "Delhi NCR Warehouse", city: "Gurugram" },
    }),
    prisma.warehouse.create({
      data: { code: "BLR", name: "Bengaluru Urban DC", city: "Bengaluru" },
    }),
  ]);

  const products = await Promise.all([
    prisma.product.create({
      data: {
        sku: "ALLO-BAG-001",
        name: "Everyday Canvas Tote",
        description: "Durable D2C staple with uneven demand across cities.",
        priceCents: 249900,
      },
    }),
    prisma.product.create({
      data: {
        sku: "ALLO-BTL-002",
        name: "Insulated Steel Bottle",
        description: "Fast-moving checkout item with limited last-mile stock.",
        priceCents: 129900,
      },
    }),
    prisma.product.create({
      data: {
        sku: "ALLO-HDY-003",
        name: "Core Zip Hoodie",
        description: "Seasonal SKU where checkout holds prevent oversells.",
        priceCents: 399900,
      },
    }),
  ]);

  const stock = [
    [products[0].id, mumbai.id, 5],
    [products[0].id, delhi.id, 2],
    [products[0].id, bengaluru.id, 1],
    [products[1].id, mumbai.id, 8],
    [products[1].id, delhi.id, 4],
    [products[1].id, bengaluru.id, 3],
    [products[2].id, mumbai.id, 2],
    [products[2].id, delhi.id, 1],
    [products[2].id, bengaluru.id, 0],
  ] as const;

  await prisma.stockLevel.createMany({
    data: stock.map(([productId, warehouseId, totalUnits]) => ({
      productId,
      warehouseId,
      totalUnits,
    })),
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
