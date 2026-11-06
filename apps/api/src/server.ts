import "dotenv/config";
import { app } from "./app.js";
import { prisma } from "./prisma.js";
import { assertRateLimitSecretConfigured } from "./rate-limit.js";

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);

assertRateLimitSecretConfigured();
if (process.env.NODE_ENV === "production") {
  if (!process.env.WEB_URL || !process.env.CORS_ORIGIN) {
    throw new Error("WEB_URL et CORS_ORIGIN sont requis en production.");
  }
}

const rateLimitCleanup = setInterval(
  () => {
    void prisma.authRateLimit
      .deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
      .catch((error: unknown) => {
        console.error(
          "IPLNI authentication rate-limit cleanup failed",
          error instanceof Error ? error.message : "Unknown database error"
        );
      });
  },
  60 * 60 * 1000
);
rateLimitCleanup.unref();

try {
  await prisma.$connect();
  app.listen(port, () => {
    console.log(`IPLNI API démarrée sur http://localhost:${port}`);
  });
} catch (error) {
  console.error(
    "IPLNI API could not connect to PostgreSQL",
    error instanceof Error ? error.message : "Unknown database error"
  );
  await prisma.$disconnect();
  process.exitCode = 1;
}
