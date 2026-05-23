import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { releaseExpiredReservations } from "@/lib/reservations";

export const dynamic = "force-dynamic";

export async function GET() {
  await releaseExpiredReservations();

  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      stockLevels: {
        include: { warehouse: true },
        orderBy: { warehouse: { code: "asc" } },
      },
    },
  });

  return NextResponse.json({
    products: products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      priceCents: product.priceCents,
      stock: product.stockLevels.map((stockLevel) => ({
        warehouseId: stockLevel.warehouseId,
        warehouseCode: stockLevel.warehouse.code,
        warehouseName: stockLevel.warehouse.name,
        city: stockLevel.warehouse.city,
        totalUnits: stockLevel.totalUnits,
        reservedUnits: stockLevel.reservedUnits,
        availableUnits: stockLevel.totalUnits - stockLevel.reservedUnits,
      })),
    })),
  });
}
