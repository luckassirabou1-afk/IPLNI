import { Prisma, RoleCode, UserStatus } from "@prisma/client";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { assertEmailDeliveryConfigured, sendVerificationEmail } from "../email.js";
import {
  consumeEmailVerificationToken,
  issueEmailVerificationToken
} from "../email-verification.js";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  hashPassword,
  requireSession,
  sessionTokenFromRequest,
  setSessionCookie,
  verifyPassword
} from "../auth.js";
import { prisma } from "../prisma.js";
import {
  googleAuthorizationUrl,
  googleOAuthConfiguration,
  googleProfileFromAuthorizationCode,
  safeRelativePath
} from "../google-oauth.js";
import {
  checkLoginRateLimit,
  checkRegistrationRateLimit,
  checkResendVerificationRateLimit,
  clearLoginEmailRateLimit,
  releaseLoginIpAttempt,
  sendRateLimitResponse
} from "../rate-limit.js";

const router = Router();
const googleStateCookieName = "iplni_google_oauth";
const googleCallbackPath = "/api/v1/auth/google/callback";

const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128)
});

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128)
});
const verifyEmailSchema = z.object({ token: z.string().min(20).max(200) });

function invalidRequest(res: import("express").Response, message: string): void {
  res.status(400).json({ error: { code: "INVALID_REQUEST", message } });
}

function getCookie(req: import("express").Request, name: string): string | undefined {
  return req.headers.cookie
    ?.split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function setGoogleStateCookie(
  res: import("express").Response,
  value: string,
  maxAge: number
): void {
  const attributes = [
    `${googleStateCookieName}=${value}`,
    `Path=${googleCallbackPath}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  res.append("Set-Cookie", attributes.join("; "));
}

function clearGoogleStateCookie(res: import("express").Response): void {
  setGoogleStateCookie(res, "", 0);
}

function googleResultUrl(webUrl: string, page: string, error?: string, next?: string): string {
  const url = new URL(page, webUrl);
  if (error) url.searchParams.set("google", error);
  if (next && next !== "/dashboard") url.searchParams.set("next", next);
  return url.toString();
}

router.get("/google", (req, res) => {
  const page = req.query.page === "register" ? "/register" : "/login";
  const next = safeRelativePath(req.query.next);
  let configuration;
  try {
    configuration = googleOAuthConfiguration();
  } catch {
    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    res.redirect(googleResultUrl(webUrl, page, "unavailable", next));
    return;
  }

  const state = randomBytes(32).toString("base64url");
  const stateCookie = Buffer.from(JSON.stringify({ state, next, page })).toString("base64url");
  setGoogleStateCookie(res, stateCookie, 600);
  res.redirect(googleAuthorizationUrl(configuration, state));
});

router.get("/google/callback", async (req, res) => {
  const rawStateCookie = getCookie(req, googleStateCookieName);
  clearGoogleStateCookie(res);
  const fallbackWebUrl = process.env.WEB_URL ?? "http://localhost:3000";
  let stateData: { state: string; next: string; page: string } | undefined;
  if (rawStateCookie) {
    try {
      const decoded: unknown = JSON.parse(
        Buffer.from(rawStateCookie, "base64url").toString("utf8")
      );
      const parsed = z
        .object({
          state: z.string().min(20),
          next: z.string(),
          page: z.enum(["/login", "/register"])
        })
        .safeParse(decoded);
      if (parsed.success) stateData = parsed.data;
    } catch {
      stateData = undefined;
    }
  }

  const queryState = typeof req.query.state === "string" ? req.query.state : "";
  const expectedState = stateData?.state ?? "";
  const validState =
    expectedState.length === queryState.length &&
    expectedState.length > 0 &&
    timingSafeEqual(Buffer.from(expectedState), Buffer.from(queryState));
  if (!validState || typeof req.query.code !== "string" || !stateData) {
    res.redirect(
      googleResultUrl(fallbackWebUrl, stateData?.page ?? "/login", "failed", stateData?.next)
    );
    return;
  }

  const next = safeRelativePath(stateData.next);
  const page = stateData.page;
  try {
    const configuration = googleOAuthConfiguration();
    const profile = await googleProfileFromAuthorizationCode(configuration, req.query.code);
    const now = new Date();

    let userId: string;
    try {
      userId = await prisma.$transaction(async (transaction) => {
        const linkedAccount = await transaction.googleAccount.findUnique({
          where: { googleAccountId: profile.googleAccountId },
          select: { user: { select: { id: true, status: true } } }
        });
        if (linkedAccount) {
          if (linkedAccount.user.status === UserStatus.SUSPENDED)
            throw new Error("GOOGLE_ACCOUNT_SUSPENDED");
          await transaction.user.update({
            where: { id: linkedAccount.user.id },
            data: { status: UserStatus.ACTIVE, emailVerifiedAt: now }
          });
          await transaction.emailVerificationToken.deleteMany({
            where: { userId: linkedAccount.user.id }
          });
          return linkedAccount.user.id;
        }

        const existingUser = await transaction.user.findUnique({
          where: { email: profile.email },
          select: { id: true, status: true }
        });
        if (existingUser?.status === UserStatus.SUSPENDED)
          throw new Error("GOOGLE_ACCOUNT_SUSPENDED");

        if (existingUser) {
          await transaction.user.update({
            where: { id: existingUser.id },
            data: { status: UserStatus.ACTIVE, emailVerifiedAt: now }
          });
          await transaction.emailVerificationToken.deleteMany({
            where: { userId: existingUser.id }
          });
          await transaction.googleAccount.create({
            data: { userId: existingUser.id, googleAccountId: profile.googleAccountId }
          });
          return existingUser.id;
        }

        const role = await transaction.role.upsert({
          where: { code: RoleCode.LEARNER },
          create: { code: RoleCode.LEARNER, label: "Apprenant" },
          update: {}
        });
        const createdUser = await transaction.user.create({
          data: {
            fullName: profile.fullName,
            email: profile.email,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: now,
            roles: { create: { role: { connect: { id: role.id } } } },
            googleAccounts: { create: { googleAccountId: profile.googleAccountId } }
          },
          select: { id: true }
        });
        return createdUser.id;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "GOOGLE_ACCOUNT_SUSPENDED") {
        res.redirect(googleResultUrl(configuration.webUrl, page, "account", next));
        return;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const linkedAccount = await prisma.googleAccount.findUnique({
          where: { googleAccountId: profile.googleAccountId },
          select: { user: { select: { id: true, status: true } } }
        });
        if (!linkedAccount || linkedAccount.user.status === UserStatus.SUSPENDED) throw error;
        userId = linkedAccount.user.id;
      } else {
        throw error;
      }
    }

    const sessionToken = await createSession(userId);
    setSessionCookie(res, sessionToken);
    clearGoogleStateCookie(res);
    res.redirect(new URL(next, configuration.webUrl).toString());
  } catch (error) {
    console.error(
      "IPLNI Google sign-in failed",
      error instanceof Error ? error.message : "Unknown Google OAuth error"
    );
    res.redirect(googleResultUrl(fallbackWebUrl, page, "failed", next));
  }
});

router.post("/register", async (req, res) => {
  const rateLimit = await checkRegistrationRateLimit(req);
  if (!rateLimit.allowed) {
    sendRateLimitResponse(res, rateLimit.retryAfterSeconds);
    return;
  }

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidRequest(
      res,
      "Nom, adresse e-mail valide et mot de passe d’au moins 12 caractères requis."
    );
    return;
  }

  const { fullName, email, password } = parsed.data;
  try {
    assertEmailDeliveryConfigured();
  } catch {
    res.status(503).json({
      error: {
        code: "EMAIL_SERVICE_UNAVAILABLE",
        message:
          "L’inscription est temporairement indisponible : le service de vérification e-mail n’est pas configuré."
      }
    });
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    res.status(202).json({
      message:
        "Si cette adresse nécessite une vérification, un e-mail de confirmation lui sera envoyé."
    });
    return;
  }
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.$transaction(async (transaction) => {
      const role = await transaction.role.upsert({
        where: { code: RoleCode.LEARNER },
        create: { code: RoleCode.LEARNER, label: "Apprenant" },
        update: {}
      });
      const createdUser = await transaction.user.create({
        data: {
          fullName,
          email,
          passwordHash,
          status: UserStatus.PENDING,
          roles: { create: { role: { connect: { id: role.id } } } }
        },
        select: { id: true, fullName: true, email: true, preferredLanguage: true }
      });
      return createdUser;
    });

    const verificationToken = await issueEmailVerificationToken(user.id);
    try {
      await sendVerificationEmail(user.email, verificationToken);
    } catch (error) {
      console.error(
        "IPLNI verification email delivery failed",
        error instanceof Error ? error.name : "Unknown SMTP error"
      );
      res.status(503).json({
        error: {
          code: "VERIFICATION_EMAIL_NOT_SENT",
          message:
            "Votre compte est créé, mais l’e-mail n’a pas pu être envoyé. Utilisez le formulaire de renvoi depuis la page de vérification."
        }
      });
      return;
    }

    res.status(202).json({
      message: "Un lien de vérification a été envoyé à votre adresse e-mail."
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(202).json({
        message:
          "Si cette adresse nécessite une vérification, un e-mail de confirmation lui sera envoyé."
      });
      return;
    }
    throw error;
  }
});

router.post("/login", async (req, res) => {
  const rateLimit = await checkLoginRateLimit(req);
  if (!rateLimit.allowed) {
    sendRateLimitResponse(res, rateLimit.retryAfterSeconds);
    return;
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    invalidRequest(res, "Adresse e-mail ou mot de passe invalide.");
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      fullName: true,
      email: true,
      preferredLanguage: true,
      passwordHash: true,
      status: true,
      emailVerifiedAt: true
    }
  });
  const passwordMatches = user
    ? user.passwordHash
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : (await hashPassword(parsed.data.password), false)
    : (await hashPassword(parsed.data.password), false);

  if (!user || !passwordMatches || user.status === UserStatus.SUSPENDED) {
    res.status(401).json({
      error: { code: "INVALID_CREDENTIALS", message: "Adresse e-mail ou mot de passe incorrect." }
    });
    return;
  }
  if (user.status !== UserStatus.ACTIVE || !user.emailVerifiedAt) {
    res.status(403).json({
      error: {
        code: "EMAIL_NOT_VERIFIED",
        message: "Confirmez votre adresse e-mail avant de vous connecter."
      }
    });
    return;
  }

  await Promise.all([clearLoginEmailRateLimit(parsed.data.email), releaseLoginIpAttempt(req)]);
  const token = await createSession(user.id);
  setSessionCookie(res, token);
  res.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      preferredLanguage: user.preferredLanguage
    }
  });
});

router.post("/verify-email", async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "INVALID_VERIFICATION_LINK",
        message: "Ce lien de vérification est invalide ou expiré."
      }
    });
    return;
  }

  const verified = await consumeEmailVerificationToken(parsed.data.token);
  if (!verified) {
    res.status(400).json({
      error: {
        code: "INVALID_VERIFICATION_LINK",
        message:
          "Ce lien de vérification est invalide ou expiré. Demandez un nouvel e-mail de vérification."
      }
    });
    return;
  }
  res.json({ message: "Adresse e-mail vérifiée. Vous pouvez maintenant vous connecter." });
});

router.post("/resend-verification", async (req, res) => {
  const rateLimit = await checkResendVerificationRateLimit(req);
  if (!rateLimit.allowed) {
    sendRateLimitResponse(res, rateLimit.retryAfterSeconds);
    return;
  }

  const parsed = z
    .object({
      email: z
        .string()
        .trim()
        .email()
        .max(254)
        .transform((email) => email.toLowerCase())
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "INVALID_REQUEST", message: "Saisissez une adresse e-mail valide." }
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, status: true, emailVerifiedAt: true }
  });
  if (user && user.status === UserStatus.PENDING && !user.emailVerifiedAt) {
    try {
      assertEmailDeliveryConfigured();
      const verificationToken = await issueEmailVerificationToken(user.id);
      await sendVerificationEmail(user.email, verificationToken);
    } catch (error) {
      console.error(
        "IPLNI verification email resend failed",
        error instanceof Error ? error.name : "Unknown SMTP error"
      );
      res.status(503).json({
        error: {
          code: "EMAIL_SERVICE_UNAVAILABLE",
          message: "L’e-mail de vérification ne peut pas être envoyé pour le moment."
        }
      });
      return;
    }
  }

  res.status(202).json({
    message:
      "Si un compte en attente de vérification correspond à cette adresse, un nouveau lien lui a été envoyé."
  });
});

router.post("/logout", async (req, res) => {
  await deleteSession(sessionTokenFromRequest(req));
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/me", requireSession, async (_req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: res.locals.userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      preferredLanguage: true,
      roles: { select: { role: { select: { code: true } } } }
    }
  });

  if (!user) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Connexion requise." } });
    return;
  }
  res.json({
    user: {
      ...user,
      roles: user.roles.map(({ role }) => role.code)
    }
  });
});

export default router;
