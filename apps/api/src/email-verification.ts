import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";

const verificationDurationMs = 24 * 60 * 60 * 1000;

export function verificationTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueEmailVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.emailVerificationToken.upsert({
    where: { userId },
    create: {
      userId,
      tokenHash: verificationTokenHash(token),
      expiresAt: new Date(Date.now() + verificationDurationMs)
    },
    update: {
      tokenHash: verificationTokenHash(token),
      expiresAt: new Date(Date.now() + verificationDurationMs),
      createdAt: new Date()
    }
  });
  return token;
}

export async function consumeEmailVerificationToken(token: string): Promise<boolean> {
  const tokenHash = verificationTokenHash(token);
  const verification = await prisma.emailVerificationToken.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
    select: { userId: true }
  });
  if (!verification) return false;

  const now = new Date();
  const updated = await prisma.$transaction(async (transaction) => {
    const consumed = await transaction.emailVerificationToken.deleteMany({
      where: { tokenHash, userId: verification.userId, expiresAt: { gt: now } }
    });
    if (consumed.count !== 1) return false;
    const activated = await transaction.user.updateMany({
      where: { id: verification.userId, status: "PENDING", emailVerifiedAt: null },
      data: { status: "ACTIVE", emailVerifiedAt: now }
    });
    return activated.count === 1;
  });
  return updated;
}
