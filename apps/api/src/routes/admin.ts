import {
  CourseStatus,
  EnrollmentStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RoleCode,
  UserStatus
} from "@prisma/client";
import { Router } from "express";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { requireSession } from "../auth.js";
import { prisma } from "../prisma.js";
import { requireRole } from "../role.js";
import { paymentMethodSchema } from "../payment-method.js";
import { assignTrainerRoleSchema } from "../trainer-admin.js";
import { courseSubmissionReviewSchema, lessonReadyForSubmission } from "../trainer-course.js";

const router = Router();
const requireAdmin: RequestHandler[] = [requireSession, requireRole(RoleCode.ADMIN)];
const reviewSchema = z
  .object({
    decision: z.enum(["confirm", "reject"]),
    note: z.string().trim().max(500).optional()
  })
  .refine((input) => input.decision !== "reject" || Boolean(input.note && input.note.length >= 3), {
    message: "Un motif d’au moins 3 caractères est requis pour refuser un paiement.",
    path: ["note"]
  });
const paymentMethodFields = {
  provider: true,
  displayName: true,
  accountHolderName: true,
  accountReference: true,
  instructions: true,
  isActive: true
} as const;
const adminCourseSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  status: true,
  languageCode: true,
  level: true,
  priceAmount: true,
  currency: true,
  accessDurationDays: true,
  updatedAt: true,
  creator: { select: { fullName: true, email: true } },
  trainers: { select: { trainer: { select: { fullName: true } } } },
  modules: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      title: true,
      lessons: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          type: true,
          contentText: true,
          contentAsset: { select: { mimeType: true } }
        }
      }
    }
  },
  liveSessions: {
    where: { status: "SCHEDULED", startsAt: { gt: new Date() } },
    select: { id: true }
  }
} satisfies Prisma.CourseSelect;

async function listAdminCourses(status?: CourseStatus) {
  const courses = await prisma.course.findMany({
    where: status ? { status } : undefined,
    orderBy: { updatedAt: "asc" },
    select: adminCourseSelect
  });
  return courses.map((course) => ({
    ...course,
    modules: course.modules.map((module) => ({
      ...module,
      lessons: module.lessons.map(({ contentText, contentAsset, ...lesson }) => ({
        ...lesson,
        contentPreview: contentText?.slice(0, 600) ?? null,
        hasPrivateAsset: contentAsset !== null,
        assetMimeType: contentAsset?.mimeType ?? null
      }))
    }))
  }));
}

router.get("/dashboard", requireAdmin, async (_req: Request, res: Response) => {
  const now = new Date();
  const [
    activeLearners,
    draftCourses,
    submittedCourses,
    publishedCourses,
    pendingPayments,
    pendingOrders,
    activeEnrollments
  ] = await Promise.all([
    prisma.user.count({
      where: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: { code: RoleCode.LEARNER } } }
      }
    }),
    prisma.course.count({ where: { status: CourseStatus.DRAFT } }),
    prisma.course.count({ where: { status: CourseStatus.SUBMITTED } }),
    prisma.course.count({ where: { status: CourseStatus.PUBLISHED } }),
    prisma.payment.count({
      where: { status: { in: [PaymentStatus.SUBMITTED, PaymentStatus.UNDER_REVIEW] } }
    }),
    prisma.order.count({ where: { status: OrderStatus.PENDING, expiresAt: { gt: now } } }),
    prisma.enrollment.count({
      where: {
        status: EnrollmentStatus.ACTIVE,
        accessExpiresAt: { gt: now }
      }
    })
  ]);

  res.json({
    stats: {
      activeLearners,
      draftCourses,
      submittedCourses,
      publishedCourses,
      pendingPayments,
      pendingOrders,
      activeEnrollments
    },
    generatedAt: now
  });
});

router.get("/trainers", requireAdmin, async (_req: Request, res: Response) => {
  const assignments = await prisma.userRole.findMany({
    where: {
      role: { code: RoleCode.TRAINER },
      user: { status: UserStatus.ACTIVE }
    },
    orderBy: { user: { fullName: "asc" } },
    select: {
      assignedAt: true,
      user: { select: { id: true, fullName: true, email: true } }
    }
  });
  res.json({
    trainers: assignments.map(({ user, assignedAt }) => ({ ...user, assignedAt }))
  });
});

router.post("/trainers", requireAdmin, async (req: Request, res: Response) => {
  const parsed = assignTrainerRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "INVALID_TRAINER_ACCOUNT",
        message: parsed.error.issues[0]?.message ?? "Adresse e-mail invalide."
      }
    });
    return;
  }

  const adminId: string = res.locals.userId;
  const result = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, fullName: true, email: true, status: true, emailVerifiedAt: true }
    });
    if (!user) return { type: "not-found" as const };
    if (user.status !== UserStatus.ACTIVE || !user.emailVerifiedAt) {
      return { type: "not-active" as const };
    }

    const role = await transaction.role.upsert({
      where: { code: RoleCode.TRAINER },
      create: { code: RoleCode.TRAINER, label: "Formateur" },
      update: {},
      select: { id: true }
    });
    const assignment = await transaction.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id, assignedBy: adminId },
      update: { assignedBy: adminId },
      select: { assignedAt: true }
    });
    await transaction.auditLog.create({
      data: {
        actorUserId: adminId,
        action: "TRAINER_ROLE_ASSIGNED",
        entityType: "User",
        entityId: user.id,
        metadata: { email: user.email }
      }
    });
    return {
      type: "assigned" as const,
      trainer: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        assignedAt: assignment.assignedAt
      }
    };
  });

  if (result.type === "not-found") {
    res.status(404).json({
      error: {
        code: "TRAINER_ACCOUNT_NOT_FOUND",
        message:
          "Aucun compte ne correspond à cette adresse. Demandez d’abord à la personne de créer son compte."
      }
    });
    return;
  }
  if (result.type === "not-active") {
    res.status(409).json({
      error: {
        code: "TRAINER_ACCOUNT_NOT_ACTIVE",
        message:
          "Le compte doit être actif et son adresse e-mail vérifiée avant de devenir formateur."
      }
    });
    return;
  }
  res.status(201).json({ trainer: result.trainer });
});

router.get("/courses", requireAdmin, async (_req: Request, res: Response) => {
  res.json({ courses: await listAdminCourses() });
});

router.get("/courses/submissions", requireAdmin, async (_req: Request, res: Response) => {
  const courses = await prisma.course.findMany({
    where: { status: CourseStatus.SUBMITTED },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      languageCode: true,
      level: true,
      priceAmount: true,
      currency: true,
      accessDurationDays: true,
      updatedAt: true,
      creator: { select: { fullName: true, email: true } },
      trainers: { select: { trainer: { select: { fullName: true } } } },
      modules: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          lessons: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              type: true,
              contentText: true,
              contentAsset: { select: { mimeType: true } }
            }
          }
        }
      },
      liveSessions: {
        where: { status: "SCHEDULED", startsAt: { gt: new Date() } },
        select: { id: true }
      }
    }
  });
  res.json({
    courses: courses.map((course) => ({
      ...course,
      modules: course.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map(({ contentText, contentAsset, ...lesson }) => ({
          ...lesson,
          contentPreview: contentText?.slice(0, 600) ?? null,
          hasPrivateAsset: contentAsset !== null,
          assetMimeType: contentAsset?.mimeType ?? null
        }))
      }))
    }))
  });
});

router.delete(
  "/courses/:courseId",
  requireAdmin,
  async (req: Request<{ courseId: string }>, res: Response) => {
    if (!z.string().uuid().safeParse(req.params.courseId).success) {
      res.status(400).json({
        error: { code: "INVALID_COURSE_ID", message: "Identifiant de formation invalide." }
      });
      return;
    }

    const adminId: string = res.locals.userId;
    const result = await prisma.$transaction(async (transaction) => {
      const course = await transaction.course.findUnique({
        where: { id: req.params.courseId },
        select: {
          id: true,
          title: true,
          _count: { select: { orderItems: true, enrollments: true } }
        }
      });
      if (!course) return { type: "not-found" as const };
      if (course._count.orderItems > 0 || course._count.enrollments > 0) {
        return { type: "has-history" as const };
      }

      await transaction.course.delete({ where: { id: course.id } });
      await transaction.auditLog.create({
        data: {
          actorUserId: adminId,
          action: "COURSE_DELETED",
          entityType: "Course",
          entityId: course.id,
          metadata: { title: course.title }
        }
      });
      return { type: "deleted" as const };
    });

    if (result.type === "not-found") {
      res.status(404).json({
        error: { code: "COURSE_NOT_FOUND", message: "Formation introuvable." }
      });
      return;
    }
    if (result.type === "has-history") {
      res.status(409).json({
        error: {
          code: "COURSE_HAS_PURCHASE_HISTORY",
          message:
            "Cette formation ne peut pas être supprimée car elle possède déjà des achats ou des inscriptions."
        }
      });
      return;
    }
    res.json({ deleted: true });
  }
);

router.patch(
  "/courses/:courseId/review",
  requireAdmin,
  async (req: Request<{ courseId: string }>, res: Response) => {
    if (!z.string().uuid().safeParse(req.params.courseId).success) {
      res.status(400).json({
        error: { code: "INVALID_COURSE_ID", message: "Identifiant de formation invalide." }
      });
      return;
    }
    const parsed = courseSubmissionReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_COURSE_REVIEW",
          message: parsed.error.issues[0]?.message ?? "Décision de modération invalide."
        }
      });
      return;
    }

    const adminId: string = res.locals.userId;
    try {
      const result = await prisma.$transaction(async (transaction) => {
        const course = await transaction.course.findUnique({
          where: { id: req.params.courseId },
          select: {
            id: true,
            title: true,
            status: true,
            modules: {
              select: {
                lessons: {
                  select: {
                    type: true,
                    contentText: true,
                    contentAsset: { select: { mimeType: true } }
                  }
                }
              }
            }
          }
        });
        if (!course) return { type: "not-found" as const };
        if (course.status !== CourseStatus.SUBMITTED) return { type: "not-submitted" as const };

        const lessons = course.modules.flatMap((module) => module.lessons);
        if (parsed.data.decision === "approve") {
          if (!course.modules.length || !lessons.length)
            return {
              type: "incomplete" as const,
              detail: "Ajoutez au moins un module et une leçon."
            };
          if (lessons.some((lesson) => !lessonReadyForSubmission(lesson))) {
            return {
              type: "incomplete" as const,
              detail:
                "Complétez les leçons texte et ajoutez un fichier vidéo ou un document valide à chaque ressource avant de publier."
            };
          }
        }

        const approved = parsed.data.decision === "approve";
        const updated = await transaction.course.update({
          where: { id: course.id },
          data: {
            status: approved ? CourseStatus.PUBLISHED : CourseStatus.DRAFT,
            reviewNote: approved ? null : (parsed.data.note ?? "Formation à compléter.")
          },
          select: { id: true, status: true }
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: adminId,
            action: approved ? "COURSE_PUBLISHED" : "COURSE_RETURNED_TO_DRAFT",
            entityType: "Course",
            entityId: course.id,
            metadata: { title: course.title, note: approved ? null : (parsed.data.note ?? null) }
          }
        });
        return { type: "reviewed" as const, course: updated };
      });

      if (result.type === "not-found") {
        res
          .status(404)
          .json({ error: { code: "COURSE_NOT_FOUND", message: "Formation introuvable." } });
        return;
      }
      if (result.type === "not-submitted") {
        res.status(409).json({
          error: {
            code: "COURSE_NOT_SUBMITTED",
            message: "Cette formation n’est plus en attente de validation."
          }
        });
        return;
      }
      if (result.type === "incomplete") {
        res
          .status(409)
          .json({ error: { code: "COURSE_CONTENT_INCOMPLETE", message: result.detail } });
        return;
      }
      res.json({ course: result.course });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        res.status(409).json({
          error: {
            code: "COURSE_REVIEW_CONFLICT",
            message: "La formation a été modifiée simultanément. Actualisez la liste."
          }
        });
        return;
      }
      throw error;
    }
  }
);

router.get("/payment-methods", requireAdmin, async (_req: Request, res: Response) => {
  const methods = await prisma.paymentMethod.findMany({
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    select: { id: true, ...paymentMethodFields, createdAt: true, updatedAt: true }
  });
  res.json({ methods });
});

router.post("/payment-methods", requireAdmin, async (req: Request, res: Response) => {
  const parsed = paymentMethodSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "INVALID_PAYMENT_METHOD",
        message: parsed.error.issues[0]?.message ?? "Moyen de paiement invalide."
      }
    });
    return;
  }

  const adminId: string = res.locals.userId;
  try {
    const method = await prisma.$transaction(async (transaction) => {
      const created = await transaction.paymentMethod.create({
        data: { ...parsed.data, instructions: parsed.data.instructions || null },
        select: { id: true, ...paymentMethodFields }
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: adminId,
          action: "PAYMENT_METHOD_CREATED",
          entityType: "PaymentMethod",
          entityId: created.id,
          metadata: { provider: created.provider, isActive: created.isActive }
        }
      });
      return created;
    });
    res.status(201).json({ method });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({
        error: {
          code: "PAYMENT_METHOD_EXISTS",
          message: "Ce compte de paiement existe déjà pour cet opérateur."
        }
      });
      return;
    }
    throw error;
  }
});

router.patch(
  "/payment-methods/:methodId",
  requireAdmin,
  async (req: Request<{ methodId: string }>, res: Response) => {
    if (!z.string().uuid().safeParse(req.params.methodId).success) {
      res.status(400).json({
        error: {
          code: "INVALID_PAYMENT_METHOD_ID",
          message: "Identifiant de moyen de paiement invalide."
        }
      });
      return;
    }
    const parsed = paymentMethodSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_PAYMENT_METHOD",
          message: parsed.error.issues[0]?.message ?? "Moyen de paiement invalide."
        }
      });
      return;
    }

    const adminId: string = res.locals.userId;
    try {
      const method = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.paymentMethod.findUnique({
          where: { id: req.params.methodId },
          select: { id: true, provider: true, isActive: true }
        });
        if (!existing) return null;
        const updated = await transaction.paymentMethod.update({
          where: { id: existing.id },
          data: { ...parsed.data, instructions: parsed.data.instructions || null },
          select: { id: true, ...paymentMethodFields }
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: adminId,
            action: parsed.data.isActive ? "PAYMENT_METHOD_UPDATED" : "PAYMENT_METHOD_DEACTIVATED",
            entityType: "PaymentMethod",
            entityId: updated.id,
            metadata: {
              previousProvider: existing.provider,
              provider: updated.provider,
              wasActive: existing.isActive,
              isActive: updated.isActive
            }
          }
        });
        return updated;
      });
      if (!method) {
        res.status(404).json({
          error: { code: "PAYMENT_METHOD_NOT_FOUND", message: "Moyen de paiement introuvable." }
        });
        return;
      }
      res.json({ method });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        res.status(409).json({
          error: {
            code: "PAYMENT_METHOD_EXISTS",
            message: "Ce compte de paiement existe déjà pour cet opérateur."
          }
        });
        return;
      }
      throw error;
    }
  }
);

router.get("/payments", requireAdmin, async (req: Request, res: Response) => {
  const cursor =
    req.query.cursor === undefined ? undefined : z.string().uuid().safeParse(req.query.cursor);
  if (cursor && !cursor.success) {
    res
      .status(400)
      .json({ error: { code: "INVALID_CURSOR", message: "Curseur de pagination invalide." } });
    return;
  }
  const payments = await prisma.payment.findMany({
    where: { status: { in: [PaymentStatus.SUBMITTED, PaymentStatus.UNDER_REVIEW] } },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: 51,
    ...(cursor?.success ? { cursor: { id: cursor.data }, skip: 1 } : {}),
    select: {
      id: true,
      provider: true,
      providerReference: true,
      amount: true,
      currency: true,
      status: true,
      submittedAt: true,
      order: {
        select: {
          reference: true,
          user: { select: { fullName: true, email: true } },
          items: { select: { course: { select: { title: true } } } }
        }
      }
    }
  });
  const hasMore = payments.length > 50;
  const page = hasMore ? payments.slice(0, 50) : payments;
  res.json({ payments: page, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null });
});

router.patch(
  "/payments/:paymentId/review",
  requireAdmin,
  async (req: Request<{ paymentId: string }>, res: Response) => {
    if (!z.string().uuid().safeParse(req.params.paymentId).success) {
      res.status(400).json({
        error: { code: "INVALID_PAYMENT_ID", message: "Identifiant de paiement invalide." }
      });
      return;
    }
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_REVIEW",
          message: parsed.error.issues[0]?.message ?? "Décision de paiement invalide."
        }
      });
      return;
    }

    const reviewerId: string = res.locals.userId;
    const now = new Date();
    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          const payment = await transaction.payment.findUnique({
            where: { id: req.params.paymentId },
            select: {
              id: true,
              orderId: true,
              status: true,
              order: {
                select: {
                  id: true,
                  reference: true,
                  status: true,
                  userId: true,
                  items: {
                    select: { id: true, courseId: true, moduleId: true, accessDurationDays: true }
                  }
                }
              }
            }
          });
          if (!payment) return { type: "not-found" as const };
          if (
            payment.status !== PaymentStatus.SUBMITTED &&
            payment.status !== PaymentStatus.UNDER_REVIEW
          ) {
            return { type: "already-reviewed" as const };
          }
          if (payment.order.status !== OrderStatus.PENDING)
            return { type: "order-closed" as const };
          if (parsed.data.decision === "confirm" && payment.order.items.length === 0) {
            return { type: "order-without-items" as const };
          }

          const nextStatus =
            parsed.data.decision === "confirm" ? PaymentStatus.CONFIRMED : PaymentStatus.REJECTED;
          if (parsed.data.decision === "confirm") {
            const confirmedPayment = await transaction.payment.findFirst({
              where: { orderId: payment.orderId, status: PaymentStatus.CONFIRMED },
              select: { id: true }
            });
            if (confirmedPayment) return { type: "order-closed" as const };

            await transaction.payment.update({
              where: { id: payment.id },
              data: {
                status: nextStatus,
                reviewedAt: now,
                reviewedById: reviewerId,
                reviewNote: parsed.data.note ?? null,
                paidAt: now
              }
            });
            await transaction.order.update({
              where: { id: payment.order.id },
              data: { status: OrderStatus.PAID, paidAt: now }
            });
            await transaction.enrollment.createMany({
              data: payment.order.items.map((item) => ({
                userId: payment.order.userId,
                courseId: item.courseId,
                moduleId: item.moduleId,
                orderItemId: item.id,
                status: "ACTIVE",
                enrolledAt: now,
                accessExpiresAt: new Date(
                  now.getTime() + item.accessDurationDays * 24 * 60 * 60 * 1000
                )
              }))
            });
          } else {
            await transaction.payment.update({
              where: { id: payment.id },
              data: {
                status: nextStatus,
                reviewedAt: now,
                reviewedById: reviewerId,
                reviewNote: parsed.data.note
              }
            });
          }

          await transaction.paymentEvent.create({
            data: {
              paymentId: payment.id,
              eventType: `ADMIN_PAYMENT_${nextStatus}`,
              payloadRedacted: { decision: parsed.data.decision, note: parsed.data.note ?? null }
            }
          });
          await transaction.auditLog.create({
            data: {
              actorUserId: reviewerId,
              action: `PAYMENT_${nextStatus}`,
              entityType: "Payment",
              entityId: payment.id,
              metadata: { orderReference: payment.order.reference, decision: parsed.data.decision }
            }
          });
          return { type: "reviewed" as const, status: nextStatus };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      if (result.type === "not-found") {
        res
          .status(404)
          .json({ error: { code: "PAYMENT_NOT_FOUND", message: "Paiement introuvable." } });
        return;
      }
      if (result.type === "already-reviewed") {
        res.status(409).json({
          error: { code: "PAYMENT_ALREADY_REVIEWED", message: "Ce paiement a déjà été traité." }
        });
        return;
      }
      if (result.type === "order-closed") {
        res.status(409).json({
          error: {
            code: "ORDER_ALREADY_CLOSED",
            message: "La commande a déjà été traitée ou n’est plus en attente."
          }
        });
        return;
      }
      if (result.type === "order-without-items") {
        res.status(409).json({
          error: {
            code: "ORDER_WITHOUT_ITEMS",
            message:
              "Cette commande ne contient aucune formation à activer. Contactez le support technique."
          }
        });
        return;
      }
      res.json({ payment: { id: req.params.paymentId, status: result.status } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        res.status(409).json({
          error: {
            code: "REVIEW_CONFLICT",
            message: "Une autre opération a modifié cette commande. Actualisez la liste."
          }
        });
        return;
      }
      throw error;
    }
  }
);

export default router;
