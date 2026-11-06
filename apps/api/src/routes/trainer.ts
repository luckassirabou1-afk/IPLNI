import { CourseStatus, EnrollmentStatus, Prisma, RoleCode } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { Router } from "express";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { requireSession } from "../auth.js";
import { prisma } from "../prisma.js";
import { requireAnyRole } from "../role.js";
import {
  createCourseSchema,
  createLessonSchema,
  createModuleSchema,
  courseReadyForSubmission,
  liveMeetingUrlSchema,
  lessonReadyForSubmission
} from "../trainer-course.js";
import {
  CourseMediaNotConfiguredError,
  CourseMediaObjectNotFoundError,
  InvalidCourseMediaError,
  createCourseMediaUploadPolicy,
  deleteCourseMediaObject,
  getUploadedCourseMediaMetadata,
  promoteCourseMediaUpload,
  validateCourseMediaFile
} from "../course-media.js";

const router = Router();
const requireTrainer: RequestHandler[] = [
  requireSession,
  requireAnyRole(RoleCode.TRAINER, RoleCode.ADMIN)
];
const createLiveSessionSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    startsAt: z
      .string()
      .datetime()
      .transform((value) => new Date(value)),
    endsAt: z
      .string()
      .datetime()
      .transform((value) => new Date(value)),
    meetingUrl: liveMeetingUrlSchema
  })
  .refine(
    ({ startsAt, endsAt }) =>
      startsAt > new Date() &&
      endsAt > startsAt &&
      endsAt.getTime() - startsAt.getTime() <= 8 * 60 * 60 * 1000,
    {
      message: "La session doit commencer dans le futur et durer au maximum 8 heures."
    }
  );

router.get("/dashboard", requireTrainer, async (_req: Request, res: Response) => {
  const trainerId: string = res.locals.userId;
  const courses = await prisma.course.findMany({
    where: { trainers: { some: { trainerId } } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      reviewNote: true,
      priceAmount: true,
      currency: true,
      updatedAt: true,
      liveSessions: {
        where: { status: "SCHEDULED", endsAt: { gt: new Date() } },
        orderBy: { startsAt: "asc" },
        select: { id: true, title: true, startsAt: true, endsAt: true }
      },
      modules: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          position: true,
          lessons: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              title: true,
              type: true,
              position: true,
              contentText: true,
              contentAssetId: true,
              contentAsset: { select: { originalName: true, mimeType: true } },
              isPreview: true
            }
          }
        }
      }
    }
  });
  const courseIds = courses.map(({ id }) => id);
  const enrollments = courseIds.length
    ? await prisma.enrollment.groupBy({
        by: ["courseId"],
        where: {
          courseId: { in: courseIds },
          status: EnrollmentStatus.ACTIVE,
          accessExpiresAt: { gt: new Date() }
        },
        _count: { _all: true }
      })
    : [];
  const enrollmentCounts = new Map(enrollments.map((item) => [item.courseId, item._count._all]));

  res.json({
    courses: courses.map((course) => ({
      ...course,
      modules: course.modules.map((module) => ({
        ...module,
        lessons: module.lessons.map((lesson) => ({
          ...lesson,
          readyForSubmission: lessonReadyForSubmission(lesson)
        }))
      })),
      enrollmentCount: enrollmentCounts.get(course.id) ?? 0,
      moduleCount: course.modules.length,
      lessonCount: course.modules.reduce((count, module) => count + module.lessons.length, 0)
    }))
  });
});

router.post(
  "/courses/:courseId/live-sessions",
  requireTrainer,
  async (req: Request<{ courseId: string }>, res: Response) => {
    if (!z.string().uuid().safeParse(req.params.courseId).success) {
      res.status(400).json({
        error: { code: "INVALID_COURSE_ID", message: "Identifiant de formation invalide." }
      });
      return;
    }
    const parsed = createLiveSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_LIVE_SESSION",
          message: parsed.error.issues[0]?.message ?? "Informations de session invalides."
        }
      });
      return;
    }

    const trainerId: string = res.locals.userId;
    const session = await prisma.$transaction(async (transaction) => {
      const course = await transaction.course.findFirst({
        where: {
          id: req.params.courseId,
          status: CourseStatus.PUBLISHED,
          trainers: { some: { trainerId } }
        },
        select: { id: true }
      });
      if (!course) return null;

      const created = await transaction.liveSession.create({
        data: {
          courseId: course.id,
          title: parsed.data.title,
          startsAt: parsed.data.startsAt,
          endsAt: parsed.data.endsAt,
          meetingUrl:
            parsed.data.meetingUrl ?? `https://meet.jit.si/iplni-${randomBytes(16).toString("hex")}`
        },
        select: { id: true, title: true, startsAt: true, endsAt: true }
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: trainerId,
          action: "LIVE_SESSION_CREATED",
          entityType: "LiveSession",
          entityId: created.id
        }
      });
      return created;
    });
    if (!session) {
      res.status(404).json({
        error: { code: "COURSE_NOT_AVAILABLE", message: "Formation introuvable ou non publiée." }
      });
      return;
    }

    res.status(201).json({ session });
  }
);

router.post("/courses", requireTrainer, async (req: Request, res: Response) => {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: "INVALID_COURSE",
        message: parsed.error.issues[0]?.message ?? "Informations de formation invalides."
      }
    });
    return;
  }
  const trainerId: string = res.locals.userId;
  try {
    const course = await prisma.$transaction(async (transaction) => {
      const created = await transaction.course.create({
        data: {
          ...parsed.data,
          level: parsed.data.level || null,
          currency: "XOF",
          status: CourseStatus.DRAFT,
          creator: { connect: { id: trainerId } },
          trainers: { create: { trainerId } }
        },
        select: { id: true, title: true, slug: true, status: true }
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: trainerId,
          action: "COURSE_DRAFT_CREATED",
          entityType: "Course",
          entityId: created.id
        }
      });
      return created;
    });
    res.status(201).json({ course });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({
        error: {
          code: "COURSE_SLUG_USED",
          message: "Cette adresse de formation est déjà utilisée."
        }
      });
      return;
    }
    throw error;
  }
});

router.delete(
  "/courses/:courseId",
  requireTrainer,
  async (req: Request<{ courseId: string }>, res: Response) => {
    if (!z.string().uuid().safeParse(req.params.courseId).success) {
      res.status(400).json({
        error: { code: "INVALID_COURSE_ID", message: "Identifiant de formation invalide." }
      });
      return;
    }

    const trainerId: string = res.locals.userId;
    const result = await prisma.$transaction(async (transaction) => {
      const course = await transaction.course.findFirst({
        where: {
          id: req.params.courseId,
          status: CourseStatus.DRAFT,
          trainers: { some: { trainerId } }
        },
        select: {
          id: true,
          title: true,
          modules: {
            select: {
              lessons: {
                select: {
                  contentAsset: { select: { id: true, storageKey: true } }
                }
              }
            }
          },
          _count: { select: { orderItems: true, enrollments: true } }
        }
      });
      if (!course) return { type: "not-editable" as const };
      if (course._count.orderItems > 0 || course._count.enrollments > 0) {
        return { type: "has-history" as const };
      }

      const assets = course.modules.flatMap((module) =>
        module.lessons.flatMap((lesson) => (lesson.contentAsset ? [lesson.contentAsset] : []))
      );
      await transaction.course.delete({ where: { id: course.id } });
      await transaction.auditLog.create({
        data: {
          actorUserId: trainerId,
          action: "COURSE_DRAFT_DELETED",
          entityType: "Course",
          entityId: course.id,
          metadata: { title: course.title }
        }
      });

      const unusedAssets = assets.length
        ? await transaction.asset.findMany({
            where: {
              id: { in: [...new Set(assets.map((asset) => asset.id))] },
              lessons: { none: {} },
              certificates: { none: {} }
            },
            select: { id: true, storageKey: true }
          })
        : [];
      if (unusedAssets.length) {
        await transaction.asset.deleteMany({
          where: { id: { in: unusedAssets.map((asset) => asset.id) } }
        });
      }
      return {
        type: "deleted" as const,
        storageKeys: unusedAssets.map((asset) => asset.storageKey)
      };
    });

    if (result.type === "not-editable") {
      res.status(404).json({
        error: {
          code: "COURSE_NOT_EDITABLE",
          message: "Brouillon introuvable ou non modifiable."
        }
      });
      return;
    }
    if (result.type === "has-history") {
      res.status(409).json({
        error: {
          code: "COURSE_HAS_HISTORY",
          message:
            "Cette formation possède déjà des commandes ou des inscriptions et ne peut pas être supprimée."
        }
      });
      return;
    }

    await Promise.all(result.storageKeys.map((storageKey) => deleteCourseMediaObject(storageKey)));
    res.json({ course: { id: req.params.courseId, deleted: true } });
  }
);

router.post(
  "/courses/:courseId/modules",
  requireTrainer,
  async (req: Request<{ courseId: string }>, res: Response) => {
    if (!z.string().uuid().safeParse(req.params.courseId).success) {
      res.status(400).json({
        error: { code: "INVALID_COURSE_ID", message: "Identifiant de formation invalide." }
      });
      return;
    }
    const parsed = createModuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_MODULE",
          message: parsed.error.issues[0]?.message ?? "Informations de module invalides."
        }
      });
      return;
    }
    const trainerId: string = res.locals.userId;
    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          const course = await transaction.course.findFirst({
            where: {
              id: req.params.courseId,
              status: CourseStatus.DRAFT,
              trainers: { some: { trainerId } }
            },
            select: { id: true }
          });
          if (!course) return null;
          const lastModule = await transaction.learningModule.findFirst({
            where: { courseId: course.id },
            orderBy: { position: "desc" },
            select: { position: true }
          });
          const module = await transaction.learningModule.create({
            data: {
              courseId: course.id,
              ...parsed.data,
              description: parsed.data.description || null,
              position: (lastModule?.position ?? 0) + 1
            },
            select: { id: true, title: true, position: true }
          });
          await transaction.auditLog.create({
            data: {
              actorUserId: trainerId,
              action: "COURSE_MODULE_CREATED",
              entityType: "LearningModule",
              entityId: module.id
            }
          });
          return module;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      if (!result) {
        res.status(404).json({
          error: {
            code: "COURSE_NOT_EDITABLE",
            message: "Formation introuvable ou non modifiable."
          }
        });
        return;
      }
      res.status(201).json({ module: result });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        res.status(409).json({
          error: {
            code: "COURSE_EDIT_CONFLICT",
            message: "Le plan a été modifié simultanément. Actualisez et réessayez."
          }
        });
        return;
      }
      throw error;
    }
  }
);

router.post(
  "/modules/:moduleId/lessons",
  requireTrainer,
  async (req: Request<{ moduleId: string }>, res: Response) => {
    if (!z.string().uuid().safeParse(req.params.moduleId).success) {
      res
        .status(400)
        .json({ error: { code: "INVALID_MODULE_ID", message: "Identifiant de module invalide." } });
      return;
    }
    const parsed = createLessonSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_LESSON",
          message: parsed.error.issues[0]?.message ?? "Informations de leçon invalides."
        }
      });
      return;
    }
    const trainerId: string = res.locals.userId;
    try {
      const result = await prisma.$transaction(
        async (transaction) => {
          const module = await transaction.learningModule.findFirst({
            where: {
              id: req.params.moduleId,
              course: { status: CourseStatus.DRAFT, trainers: { some: { trainerId } } }
            },
            select: { id: true }
          });
          if (!module) return null;
          const lastLesson = await transaction.lesson.findFirst({
            where: { moduleId: module.id },
            orderBy: { position: "desc" },
            select: { position: true }
          });
          const lesson = await transaction.lesson.create({
            data: {
              moduleId: module.id,
              title: parsed.data.title,
              description: parsed.data.description || null,
              type: parsed.data.type,
              position: (lastLesson?.position ?? 0) + 1,
              durationSeconds: parsed.data.durationSeconds ?? null,
              contentText: parsed.data.contentText || null,
              isPreview: parsed.data.isPreview
            },
            select: { id: true, title: true, type: true, position: true }
          });
          await transaction.auditLog.create({
            data: {
              actorUserId: trainerId,
              action: "COURSE_LESSON_CREATED",
              entityType: "Lesson",
              entityId: lesson.id
            }
          });
          return lesson;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      if (!result) {
        res.status(404).json({
          error: {
            code: "MODULE_NOT_EDITABLE",
            message: "Module introuvable ou formation non modifiable."
          }
        });
        return;
      }
      res.status(201).json({ lesson: result });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        res.status(409).json({
          error: {
            code: "COURSE_EDIT_CONFLICT",
            message: "Le plan a été modifié simultanément. Actualisez et réessayez."
          }
        });
        return;
      }
      throw error;
    }
  }
);

router.patch(
  "/lessons/:lessonId",
  requireTrainer,
  async (req: Request<{ lessonId: string }>, res: Response) => {
    if (!z.string().uuid().safeParse(req.params.lessonId).success) {
      res
        .status(400)
        .json({ error: { code: "INVALID_LESSON_ID", message: "Identifiant de leçon invalide." } });
      return;
    }
    const parsed = createLessonSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_LESSON",
          message: parsed.error.issues[0]?.message ?? "Informations de leçon invalides."
        }
      });
      return;
    }
    const trainerId: string = res.locals.userId;
    const lesson = await prisma.$transaction(async (transaction) => {
      const editable = await transaction.lesson.findFirst({
        where: {
          id: req.params.lessonId,
          module: { course: { status: CourseStatus.DRAFT, trainers: { some: { trainerId } } } }
        },
        select: { id: true }
      });
      if (!editable) return null;
      const updated = await transaction.lesson.update({
        where: { id: editable.id },
        data: {
          title: parsed.data.title,
          description: parsed.data.description || null,
          type: parsed.data.type,
          durationSeconds: parsed.data.durationSeconds ?? null,
          contentText: parsed.data.contentText || null,
          isPreview: parsed.data.isPreview
        },
        select: { id: true, title: true, type: true, position: true }
      });
      await transaction.auditLog.create({
        data: {
          actorUserId: trainerId,
          action: "COURSE_LESSON_UPDATED",
          entityType: "Lesson",
          entityId: updated.id
        }
      });
      return updated;
    });
    if (!lesson) {
      res.status(404).json({
        error: {
          code: "LESSON_NOT_EDITABLE",
          message: "Leçon introuvable ou formation non modifiable."
        }
      });
      return;
    }
    res.json({ lesson });
  }
);

const courseMediaRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(500 * 1024 * 1024)
});
const courseMediaCompletionSchema = z.object({
  storageKey: z.string().min(1).max(500),
  fileName: z.string().trim().min(1).max(255)
});

router.post(
  "/lessons/:lessonId/upload-policy",
  requireTrainer,
  async (req: Request<{ lessonId: string }>, res: Response) => {
    const parsedId = z.string().uuid().safeParse(req.params.lessonId);
    if (!parsedId.success) {
      res
        .status(400)
        .json({ error: { code: "INVALID_LESSON_ID", message: "Identifiant de leçon invalide." } });
      return;
    }
    const parsed = courseMediaRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: "INVALID_MEDIA_UPLOAD",
          message: parsed.error.issues[0]?.message ?? "Fichier invalide."
        }
      });
      return;
    }

    const trainerId: string = res.locals.userId;
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: parsedId.data,
        module: { course: { status: CourseStatus.DRAFT, trainers: { some: { trainerId } } } }
      },
      select: { id: true, type: true, module: { select: { courseId: true } } }
    });
    if (!lesson) {
      res.status(404).json({
        error: {
          code: "LESSON_NOT_EDITABLE",
          message: "Leçon introuvable ou formation non modifiable."
        }
      });
      return;
    }

    try {
      const file = validateCourseMediaFile(
        lesson.type,
        parsed.data.mimeType,
        parsed.data.sizeBytes
      );
      const upload = await createCourseMediaUploadPolicy(
        lesson.module.courseId,
        lesson.id,
        file,
        parsed.data.mimeType
      );
      res.json({ upload, maxSizeBytes: file.maxBytes });
    } catch (error) {
      if (error instanceof CourseMediaNotConfiguredError) {
        res
          .status(503)
          .json({ error: { code: "COURSE_MEDIA_NOT_CONFIGURED", message: error.message } });
        return;
      }
      if (error instanceof InvalidCourseMediaError) {
        res.status(400).json({ error: { code: "INVALID_MEDIA_UPLOAD", message: error.message } });
        return;
      }
      throw error;
    }
  }
);

router.post(
  "/lessons/:lessonId/complete-upload",
  requireTrainer,
  async (req: Request<{ lessonId: string }>, res: Response) => {
    const parsedId = z.string().uuid().safeParse(req.params.lessonId);
    if (!parsedId.success) {
      res
        .status(400)
        .json({ error: { code: "INVALID_LESSON_ID", message: "Identifiant de leçon invalide." } });
      return;
    }
    const parsed = courseMediaCompletionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "INVALID_MEDIA_UPLOAD", message: "Informations de fichier invalides." }
      });
      return;
    }

    const trainerId: string = res.locals.userId;
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: parsedId.data,
        module: { course: { status: CourseStatus.DRAFT, trainers: { some: { trainerId } } } }
      },
      select: { id: true, type: true, module: { select: { courseId: true } } }
    });
    if (!lesson) {
      res.status(404).json({
        error: {
          code: "LESSON_NOT_EDITABLE",
          message: "Leçon introuvable ou formation non modifiable."
        }
      });
      return;
    }

    const storageKeyPrefix = `upload-staging/${lesson.module.courseId}/${lesson.id}/`;
    if (
      !parsed.data.storageKey.startsWith(storageKeyPrefix) ||
      !/^upload-staging\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|doc|docx|xls|xlsx|ppt|pptx|mp4|webm)$/.test(
        parsed.data.storageKey
      )
    ) {
      res.status(400).json({
        error: {
          code: "INVALID_MEDIA_UPLOAD",
          message: "La clé de stockage de ce fichier est invalide."
        }
      });
      return;
    }

    let uploadedFile: { mimeType: string; sizeBytes: number; generation: string };
    let mediaFile;
    try {
      uploadedFile = await getUploadedCourseMediaMetadata(parsed.data.storageKey);
      mediaFile = validateCourseMediaFile(
        lesson.type,
        uploadedFile.mimeType,
        uploadedFile.sizeBytes
      );
      if (!parsed.data.storageKey.endsWith(`.${mediaFile.extension}`)) {
        throw new InvalidCourseMediaError(
          "L’extension du fichier téléversé ne correspond pas à son type."
        );
      }
      const fileExtension = parsed.data.fileName.split(".").pop()?.toLowerCase();
      if (fileExtension !== mediaFile.extension) {
        throw new InvalidCourseMediaError(
          "L’extension du nom de fichier ne correspond pas au format téléversé."
        );
      }
    } catch (error) {
      if (error instanceof CourseMediaNotConfiguredError) {
        res
          .status(503)
          .json({ error: { code: "COURSE_MEDIA_NOT_CONFIGURED", message: error.message } });
        return;
      }
      if (error instanceof CourseMediaObjectNotFoundError) {
        res
          .status(409)
          .json({ error: { code: "MEDIA_UPLOAD_INCOMPLETE", message: error.message } });
        return;
      }
      if (error instanceof InvalidCourseMediaError) {
        res.status(400).json({ error: { code: "INVALID_MEDIA_UPLOAD", message: error.message } });
        return;
      }
      throw error;
    }

    const storageKey = await promoteCourseMediaUpload(
      parsed.data.storageKey,
      lesson.module.courseId,
      lesson.id,
      mediaFile,
      uploadedFile.mimeType,
      uploadedFile.generation
    );
    let result: {
      assetId: string;
      previousAsset: { id: string; storageKey: string } | null;
    } | null;
    try {
      result = await prisma.$transaction(async (transaction) => {
        const editable = await transaction.lesson.findFirst({
          where: {
            id: lesson.id,
            module: { course: { status: CourseStatus.DRAFT, trainers: { some: { trainerId } } } }
          },
          select: { id: true, contentAsset: { select: { id: true, storageKey: true } } }
        });
        if (!editable) return null;

        const asset = await transaction.asset.create({
          data: {
            storageKey,
            originalName: parsed.data.fileName,
            mimeType: uploadedFile.mimeType,
            sizeBytes: BigInt(uploadedFile.sizeBytes),
            visibility: "PRIVATE",
            uploadedById: trainerId
          },
          select: { id: true }
        });
        await transaction.lesson.update({
          where: { id: editable.id },
          data: { contentAssetId: asset.id }
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: trainerId,
            action: "COURSE_MEDIA_UPLOADED",
            entityType: "Lesson",
            entityId: editable.id,
            metadata: { mimeType: uploadedFile.mimeType, sizeBytes: uploadedFile.sizeBytes }
          }
        });
        return { assetId: asset.id, previousAsset: editable.contentAsset };
      });
    } catch (error) {
      await deleteCourseMediaObject(storageKey);
      throw error;
    }

    if (!result) {
      await deleteCourseMediaObject(storageKey);
      res.status(404).json({
        error: { code: "LESSON_NOT_EDITABLE", message: "La leçon n’est plus modifiable." }
      });
      return;
    }
    if (result.previousAsset) {
      const removed = await prisma.asset.deleteMany({
        where: {
          id: result.previousAsset.id,
          lessons: { none: {} },
          certificates: { none: {} }
        }
      });
      if (removed.count) await deleteCourseMediaObject(result.previousAsset.storageKey);
    }

    res.status(201).json({ asset: { id: result.assetId, mimeType: uploadedFile.mimeType } });
  }
);

router.post(
  "/courses/:courseId/submit",
  requireTrainer,
  async (req: Request<{ courseId: string }>, res: Response) => {
    if (!z.string().uuid().safeParse(req.params.courseId).success) {
      res.status(400).json({
        error: { code: "INVALID_COURSE_ID", message: "Identifiant de formation invalide." }
      });
      return;
    }
    const trainerId: string = res.locals.userId;
    try {
      const result = await prisma.$transaction(async (transaction) => {
        const course = await transaction.course.findFirst({
          where: {
            id: req.params.courseId,
            status: CourseStatus.DRAFT,
            trainers: { some: { trainerId } }
          },
          select: {
            id: true,
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
        if (!course) return { type: "not-editable" as const };
        const lessons = course.modules.flatMap((module) => module.lessons);
        if (course.modules.length === 0 || lessons.length === 0) return { type: "empty" as const };
        if (!courseReadyForSubmission(course.modules)) {
          return { type: "content-incomplete" as const };
        }

        await transaction.course.update({
          where: { id: course.id },
          data: { status: CourseStatus.SUBMITTED, reviewNote: null }
        });
        await transaction.auditLog.create({
          data: {
            actorUserId: trainerId,
            action: "COURSE_SUBMITTED_FOR_REVIEW",
            entityType: "Course",
            entityId: course.id
          }
        });
        return { type: "submitted" as const };
      });
      if (result.type === "not-editable") {
        res.status(404).json({
          error: {
            code: "COURSE_NOT_EDITABLE",
            message: "Formation introuvable ou non modifiable."
          }
        });
        return;
      }
      if (result.type === "empty") {
        res.status(409).json({
          error: {
            code: "COURSE_CONTENT_REQUIRED",
            message: "Ajoutez au moins un module et une leçon avant de soumettre la formation."
          }
        });
        return;
      }
      if (result.type === "content-incomplete") {
        res.status(409).json({
          error: {
            code: "COURSE_LESSON_CONTENT_REQUIRED",
            message:
              "Complétez le contenu texte et ajoutez un fichier valide à chaque leçon vidéo ou ressource documentaire avant de soumettre la formation."
          }
        });
        return;
      }
      res.json({ course: { id: req.params.courseId, status: CourseStatus.SUBMITTED } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        res.status(409).json({
          error: {
            code: "COURSE_EDIT_CONFLICT",
            message: "La formation a été modifiée simultanément. Actualisez et réessayez."
          }
        });
        return;
      }
      throw error;
    }
  }
);

export default router;
