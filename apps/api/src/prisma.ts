import { PrismaClient } from "@prisma/client";

const prismaGlobal = globalThis as typeof globalThis & {
  iplniPrisma?: PrismaClient;
};

export const prisma =
  prismaGlobal.iplniPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  prismaGlobal.iplniPrisma = prisma;
}
