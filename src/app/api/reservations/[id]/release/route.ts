import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { ApiError, releaseReservation } from "@/lib/reservations";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const reservation = await releaseReservation(id);
    return NextResponse.json({ reservation });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error.message, error.status);
    }

    console.error(error);
    return jsonError("Could not release reservation.", 500);
  }
}
