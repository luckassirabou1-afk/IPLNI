import { PaymentProvider } from "@prisma/client";
import { z } from "zod";

export const paymentMethodSchema = z.object({
  provider: z.nativeEnum(PaymentProvider),
  displayName: z.string().trim().min(2).max(80),
  accountHolderName: z.string().trim().min(2).max(160),
  accountReference: z.string().trim().min(3).max(160),
  instructions: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().default(true)
});

export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;
