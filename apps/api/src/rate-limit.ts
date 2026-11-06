import { createHmac } from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "./prisma.js";

type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

function secret(): string {
  const configuredSecret = process.env.AUTH_RATE_LIMIT_SECRET;
  if (configuredSecret) {
    if (configuredSecret.length < 32) {
      throw new Error("AUTH_RATE_LIMIT_SECRET doit contenir au moins 32 caractères.");
    }
    return configuredSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_RATE_LIMIT_SECRET est requis en production.");
  }
  return "development-only-rate-limit-secret";
}

export function assertRateLimitSecretConfigured(): void {
  secret();
}

function keyHash(scope: string, value: string): string {
  return createHmac("sha256", secret()).update(`${scope}:${value}`).digest("hex");
}

async function consume(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const rows = await prisma.$queryRaw<Array<{ attempts: number; windowStartedAt: Date }>>`
    INSERT INTO "AuthRateLimit" ("keyHash", "attempts", "windowStartedAt", "updatedAt")
    VALUES (${key}, 1, NOW(), NOW())
    ON CONFLICT ("keyHash") DO UPDATE SET
      "attempts" = CASE
        WHEN "AuthRateLimit"."windowStartedAt" <= NOW() - (${windowSeconds} * INTERVAL '1 second') THEN 1
        ELSE "AuthRateLimit"."attempts" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "AuthRateLimit"."windowStartedAt" <= NOW() - (${windowSeconds} * INTERVAL '1 second') THEN NOW()
        ELSE "AuthRateLimit"."windowStartedAt"
      END,
      "updatedAt" = NOW()
    RETURNING "attempts", "windowStartedAt"
  `;
  const record = rows[0];
  return evaluateRateLimit(
    record?.attempts ?? 0,
    record?.windowStartedAt ?? new Date(),
    limit,
    windowSeconds
  );
}

export function evaluateRateLimit(
  attempts: number,
  windowStartedAt: Date,
  limit: number,
  windowSeconds: number,
  now = new Date()
): RateLimitResult {
  if (attempts <= limit || windowStartedAt.getTime() + windowSeconds * 1000 <= now.getTime()) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStartedAt.getTime() + windowSeconds * 1000 - now.getTime()) / 1000)
  );
  return { allowed: false, retryAfterSeconds };
}

function normalizedEmail(req: Request): string | undefined {
  if (typeof req.body !== "object" || req.body === null || !("email" in req.body)) return undefined;
  const email = (req.body as { email?: unknown }).email;
  return typeof email === "string" && email.length <= 254 ? email.trim().toLowerCase() : undefined;
}

export async function checkLoginRateLimit(req: Request): Promise<RateLimitResult> {
  const email = normalizedEmail(req);
  const checks = [
    consume(keyHash("login-ip", req.ip ?? "unknown"), 30, 15 * 60),
    ...(email ? [consume(keyHash("login-email", email), 5, 15 * 60)] : [])
  ];
  const results = await Promise.all(checks);
  const blocked = results.filter((result) => !result.allowed);
  if (blocked.length === 0) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(...blocked.map((result) => result.retryAfterSeconds))
  };
}

export async function checkRegistrationRateLimit(req: Request): Promise<RateLimitResult> {
  return consume(keyHash("register-ip", req.ip ?? "unknown"), 5, 60 * 60);
}

export async function checkResendVerificationRateLimit(req: Request): Promise<RateLimitResult> {
  const email = normalizedEmail(req);
  const checks = [
    consume(keyHash("verification-resend-ip", req.ip ?? "unknown"), 10, 60 * 60),
    ...(email ? [consume(keyHash("verification-resend-email", email), 3, 60 * 60)] : [])
  ];
  const results = await Promise.all(checks);
  const blocked = results.filter((result) => !result.allowed);
  if (blocked.length === 0) return { allowed: true, retryAfterSeconds: 0 };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(...blocked.map((result) => result.retryAfterSeconds))
  };
}

export async function clearLoginEmailRateLimit(email: string): Promise<void> {
  await prisma.authRateLimit.deleteMany({ where: { keyHash: keyHash("login-email", email) } });
}

export async function releaseLoginIpAttempt(req: Request): Promise<void> {
  const hashedKey = keyHash("login-ip", req.ip ?? "unknown");
  await prisma.$executeRaw`
    UPDATE "AuthRateLimit"
    SET "attempts" = GREATEST("attempts" - 1, 0), "updatedAt" = NOW()
    WHERE "keyHash" = ${hashedKey}
  `;
}

export function sendRateLimitResponse(res: Response, retryAfterSeconds: number): void {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.status(429).json({
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Trop de tentatives. Réessayez après le délai indiqué."
    }
  });
}
