import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { prisma } from "./prisma.js";

const sessionCookieName = "iplni_session";
export const sessionDurationSeconds = 60 * 60 * 24 * 7;
const sessionDurationMs = sessionDurationSeconds * 1000;

export type AuthLocals = { userId: string };

function deriveKey(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, length, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getSessionToken(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  const sessionCookie = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${sessionCookieName}=`));

  return sessionCookie?.slice(sessionCookieName.length + 1);
}

export function setSessionCookie(res: Response, token: string): void {
  const attributes = [
    `${sessionCookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${sessionDurationSeconds}`
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

export function clearSessionCookie(res: Response): void {
  const attributes = [`${sessionCookieName}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + sessionDurationMs)
    }
  });
  return token;
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
}

export const requireSession: RequestHandler = async (req, res, next) => {
  const token = getSessionToken(req);
  if (!token) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Connexion requise." } });
    return;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      user: { select: { status: true, emailVerifiedAt: true } }
    }
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.user.status !== "ACTIVE" ||
    !session.user.emailVerifiedAt
  ) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    clearSessionCookie(res);
    res
      .status(401)
      .json({ error: { code: "UNAUTHENTICATED", message: "Session invalide ou expirée." } });
    return;
  }

  res.locals.userId = session.userId;
  next();
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, saltHex, keyHex] = encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    saltHex?.length !== 32 ||
    keyHex?.length !== 128 ||
    !/^[0-9a-f]+$/i.test(saltHex + keyHex)
  ) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");
  const actualKey = await deriveKey(password, salt, expectedKey.length);
  return actualKey.length === expectedKey.length && timingSafeEqual(actualKey, expectedKey);
}

export function sessionTokenFromRequest(req: Request): string | undefined {
  return getSessionToken(req);
}
