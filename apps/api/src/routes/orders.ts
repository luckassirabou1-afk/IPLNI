import { randomBytes } from "node:crypto";
import { CourseStatus, OrderStatus, PaymentStatus, Prisma, RoleCode } from "@prisma/client";
import { Router } from "express";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { requireSession } from "../auth.js";
import { prisma } from "../prisma.js";
import { requireAnyRole } from "../role.js";

const router = Router();
const requireLearner: RequestHandler[] = [
  requireSession,
  requireAnyRole(RoleCode.LEARNER, RoleCode.ADMIN)
];
const createOrderSchema = z.object({ courseSlug: z.string().trim().min(1).max(160) });
const submitPaymentSchema = z.object({
  paymentMethodId: z.string().uuid(),
  providerReference: z.string().trim().min(3).max(120)
});

function orderReference(): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `IPL-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function orderExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt <= now;
}

router.get("/mine", requireLearner, async (_req: Request, res: Response) => {
  const orders = await prisma.order.findMany({
    where: { userId: res.locals.userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      reference: true,
      status: true,
      amount: true,
      currency: true,
      createdAt: true,
      expiresAt: true,
      items: { select: { course: { select: { title: true, slug: true } } } },
      payments: {
        orderBy: { submittedAt: "desc" },
        take: 1,
        select: { status: true, submittedAt: true }
      }
    }
  });
  res.json({ orders });
});

router.get(
  "/:reference",
  requireLearner,
  async (req: Request<{ reference: string }>, res: Response) => {
    const order = await prisma.order.findFirst({
      where: { reference: req.params.reference, userId: res.locals.userId },
      select: {
        reference: true,
        status: true,
        amount: true,
        currency: true,
        createdAt: true,
        expiresAt: true,
        items: { select: { course: { select: { title: true, slug: true } } } },
        payments: {
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: { status: true, submittedAt: true }
        }
      }
    });

    if (!order) {
      res
        .status(404)
        .json({ error: { code: "ORDER_NOT_FOUND", message: "Commande introuvable." } });
      return;
    }
    res.json({ order });
  }
);

router.post("/", requireLearner, async (req: Request, res: Response) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "INVALID_REQUEST", message: "Formation invalide." } });
    return;
  }

  const userId: string = res.locals.userId;
  const course = await prisma.course.findFirst({
    where: {
      slug: parsed.data.courseSlug,
      status: CourseStatus.PUBLISHED,
      currency: "XOF",
      priceAmount: { gt: 0 }
    },
    select: {
      id: true,
      title: true,
      priceAmount: true,
      currency: true,
      accessDurationDays: true
    }
  });
  if (!course) {
    res.status(404).json({
      error: { code: "COURSE_NOT_FOUND", message: "Cette formation n’est pas disponible." }
    });
    return;
  }

  const now = new Date();
  try {
    const result = await prisma.$transaction(
      async (transaction) => {
        const activeEnrollment = await transaction.enrollment.findFirst({
          where: { userId, courseId: course.id, status: "ACTIVE", accessExpiresAt: { gt: now } },
          select: { id: true }
        });
        if (activeEnrollment) return { type: "already-enrolled" as const };

        const pendingOrder = await transaction.order.findFirst({
          where: {
            userId,
            status: OrderStatus.PENDING,
            expiresAt: { gt: now },
            items: { some: { courseId: course.id } }
          },
          orderBy: { createdAt: "desc" },
          select: { reference: true, amount: true, currency: true, expiresAt: true }
        });
        if (pendingOrder) return { type: "order" as const, order: pendingOrder, reused: true };

        const expiresAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);
        const order = await transaction.order.create({
          data: {
            reference: orderReference(),
            userId,
            amount: course.priceAmount,
            currency: course.currency,
            expiresAt,
            items: {
              create: {
                courseId: course.id,
                priceAmount: course.priceAmount,
                accessDurationDays: course.accessDurationDays
              }
            }
          },
          select: { reference: true, amount: true, currency: true, expiresAt: true }
        });
        return { type: "order" as const, order, reused: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    if (result.type === "already-enrolled") {
      res.status(409).json({
        error: { code: "ALREADY_ENROLLED", message: "Vous avez déjà accès à cette formation." }
      });
      return;
    }
    res.status(result.reused ? 200 : 201).json({ order: result.order, reused: result.reused });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({
        error: {
          code: "PAYMENT_REFERENCE_USED",
          message: "Cette référence de transaction a déjà été déclarée."
        }
      });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      res.status(409).json({
        error: {
          code: "ORDER_CONFLICT",
          message: "La commande a été modifiée simultanément. Réessayez."
        }
      });
      return;
    }
    throw error;
  }
});

router.post(
  "/:reference/payments",
  requireLearner,
  async (req: Request<{ reference: string }>, res: Response) => {
    const parsed = submitPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Sélectionnez un moyen de paiement et indiquez sa référence de transaction."
        }
      });
      return;
    }

    const userId: string = res.locals.userId;
    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          const order = await transaction.order.findFirst({
            where: { reference: req.params.reference, userId },
            select: {
              id: true,
              status: true,
              amount: true,
              currency: true,
              expiresAt: true,
              payments: {
                where: { status: { in: [PaymentStatus.SUBMITTED, PaymentStatus.UNDER_REVIEW] } },
                select: { id: true },
                take: 1
              }
            }
          });
          if (!order) return { type: "order-not-found" as const };
          if (order.status !== OrderStatus.PENDING || orderExpired(order.expiresAt, new Date())) {
            return { type: "order-not-payable" as const };
          }
          if (order.payments.length > 0) return { type: "payment-already-submitted" as const };

          const paymentMethod = await transaction.paymentMethod.findFirst({
            where: { id: parsed.data.paymentMethodId, isActive: true },
            select: { provider: true }
          });
          if (!paymentMethod) return { type: "payment-method-unavailable" as const };

          const payment = await transaction.payment.create({
            data: {
              orderId: order.id,
              provider: paymentMethod.provider,
              providerReference: parsed.data.providerReference,
              amount: order.amount,
              currency: order.currency,
              status: PaymentStatus.SUBMITTED
            },
            select: { id: true, status: true, submittedAt: true }
          });
          return { type: "payment" as const, payment };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      if (result.type === "order-not-found") {
        res
          .status(404)
          .json({ error: { code: "ORDER_NOT_FOUND", message: "Commande introuvable." } });
        return;
      }
      if (result.type === "order-not-payable") {
        res.status(409).json({
          error: { code: "ORDER_NOT_PAYABLE", message: "Cette commande n’est plus payable." }
        });
        return;
      }
      if (result.type === "payment-already-submitted") {
        res.status(409).json({
          error: {
            code: "PAYMENT_ALREADY_SUBMITTED",
            message: "Un paiement est déjà en attente de vérification pour cette commande."
          }
        });
        return;
      }
      if (result.type === "payment-method-unavailable") {
        res.status(400).json({
          error: {
            code: "PAYMENT_METHOD_UNAVAILABLE",
            message: "Ce moyen de paiement n’est pas disponible."
          }
        });
        return;
      }

      res.status(201).json({
        payment: result.payment,
        message:
          "Votre déclaration est enregistrée. L’accès à la formation sera ouvert après vérification par IPLNI."
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        res.status(409).json({
          error: {
            code: "PAYMENT_CONFLICT",
            message:
              "La commande a été modifiée simultanément. Actualisez son statut avant de réessayer."
          }
        });
        return;
      }
      throw error;
    }
  }
);

export default router;
