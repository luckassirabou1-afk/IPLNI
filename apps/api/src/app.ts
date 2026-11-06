import cors from "cors";
import express from "express";
import helmet from "helmet";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import coursesRouter from "./routes/courses.js";
import learnerRouter from "./routes/learner.js";
import ordersRouter from "./routes/orders.js";
import paymentsRouter from "./routes/payments.js";
import trainerRouter from "./routes/trainer.js";
import { isAllowedCorsOrigin } from "./cors-origin.js";
import { openApiDocument } from "./openapi.js";
import { prisma } from "./prisma.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isAllowedCorsOrigin(origin, process.env.CORS_ORIGIN, process.env.NODE_ENV));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/courses", coursesRouter);
app.use("/api/v1/learner", learnerRouter);
app.use("/api/v1/orders", ordersRouter);
app.use("/api/v1/payments", paymentsRouter);
app.use("/api/v1/trainer", trainerRouter);

app.get("/", (_req, res) => {
  res.json({
    name: "IPLNI API",
    version: "0.1.0",
    documentation: "/openapi.json"
  });
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/openapi.json", (_req, res) => {
  res.json(openApiDocument);
});

app.get("/health/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", dependencies: { database: "connected" } });
  } catch (error) {
    console.error(
      "IPLNI database readiness check failed",
      error instanceof Error ? error.message : "Unknown database error"
    );
    res.status(503).json({ status: "error", dependencies: { database: "unavailable" } });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route introuvable" } });
});

app.use(
  (error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    const isJsonSyntaxError =
      error instanceof SyntaxError &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status === 400;

    const statusCode = isJsonSyntaxError
      ? 400
      : typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          typeof error.statusCode === "number"
        ? error.statusCode
        : 500;

    const message = isJsonSyntaxError
      ? "Le corps de la requête est invalide."
      : error instanceof Error
        ? error.message
        : "Une erreur interne est survenue.";

    const code = statusCode === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_ERROR";
    res.status(statusCode).json({ error: { code, message } });
  }
);
