import { z } from "zod";

export const assignTrainerRoleSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase())
});
