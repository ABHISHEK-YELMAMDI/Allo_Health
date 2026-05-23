import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { ApiError, createReservation } from "@/lib/reservations";
import { createReservationSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createReservationSchema.safeParse(body);

  if (!parsed.success) {
    return jsonError("Invalid reservation request.", 400);
  }

  try {
    const reservation = await createReservation(parsed.data);
    return NextResponse.json({ reservation }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(error.message, error.status);
    }

    console.error(error);
    return jsonError("Could not create reservation.", 500);
  }
}
