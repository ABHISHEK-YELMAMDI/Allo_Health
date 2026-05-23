import { z } from "zod";

export const createReservationSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(25),
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
