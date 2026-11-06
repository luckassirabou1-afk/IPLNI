import { CourseStatus, EnrollmentStatus, LessonType, RoleCode } from "@prisma/client";
import { Router } from "express";
import type { Request, RequestHandler, Response } from "express";
import { z } from "zod";
import { requireSession } from "../auth.js";
import { prisma } from "../prisma.js";
import { requireAnyRole } from "../role.js";
import { CourseMediaNotConfiguredError, createCourseMediaReadUrl } from "../course-media.js";

const router = Router();
const requireLearner: RequestHandler[] = [
  requireSession,
  requireAnyRole(RoleCode.LEARNER, RoleCode.ADMIN)
];

router.get(
  "/courses/:courseId/lessons/:lessonId",
  requireLearner,
  async (req: Request<{ courseId: string; lessonId: string }>, res: Response) => {
    const ids = z
      .object({ courseId: z.string().uuid(), lessonId: z.string().uuid() })
      .safeParse(req.params);
    if (!ids.success) {
      res.status(400).json({
        error: {
          code: "INVALID_LESSON",
          message: "Identifiant de formation ou de leçon invalide."
        }
      });
      return;
    }
    const lesson = await prisma.lesson.findFirst({
      where: {
        id: ids.data.lessonId,
        module: { courseId: ids.data.courseId, course: { status: CourseStatus.PUBLISHED } }
      },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        durationSeconds: true,
        contentText: true,
        isPreview: true,
        contentAsset: { select: { originalName: true, mimeType: true, storageKey: true } },
        module: { select: { id: true, courseId: true } }
      }
    });
    if (!lesson) {
      res.status(404).json({ error: { code: "LESSON_NOT_FOUND", message: "Leçon introuvable." } });
      return;
    }

    if (!lesson.isPreview) {
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          userId: res.locals.userId,
          courseId: ids.data.courseId,
          OR: [{ moduleId: null }, { moduleId: lesson.module.id }],
          status: EnrollmentStatus.ACTIVE,
          accessExpiresAt: { gt: new Date() }
        },
        select: { id: true }
      });
      if (!enrollment) {
        res.status(403).json({
          error: {
            code: "COURSE_ACCESS_REQUIRED",
            message: "Un accès actif à cette formation est nécessaire."
          }
        });
        return;
      }
    }

    if (lesson.type === LessonType.LIVE) {
      const liveSessions = await prisma.liveSession.findMany({
        where: {
          courseId: lesson.module.courseId,
          status: "SCHEDULED",
          endsAt: { gt: new Date() }
        },
        orderBy: { startsAt: "asc" },
        select: { id: true, title: true, startsAt: true, endsAt: true }
      });
      res.json({
        lesson: {
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          type: lesson.type,
          durationSeconds: lesson.durationSeconds,
          contentText: null
        },
        liveSessions
      });
      return;
    }
    if (lesson.type === LessonType.VIDEO || lesson.type === LessonType.RESOURCE) {
      if (!lesson.contentAsset) {
        res.status(409).json({
          error: {
            code: "LESSON_CONTENT_UNAVAILABLE",
            message: "Le fichier de cette leçon n’est pas encore disponible."
          }
        });
        return;
      }
      try {
        const mediaUrl = await createCourseMediaReadUrl(
          lesson.contentAsset.storageKey,
          lesson.contentAsset.mimeType,
          lesson.contentAsset.originalName
        );
        res.json({
          lesson: {
            id: lesson.id,
            title: lesson.title,
            description: lesson.description,
            type: lesson.type,
            durationSeconds: lesson.durationSeconds,
            contentText: null,
            mediaUrl,
            fileName: lesson.contentAsset.originalName,
            mimeType: lesson.contentAsset.mimeType
          }
        });
      } catch (error) {
        if (error instanceof CourseMediaNotConfiguredError) {
          res
            .status(503)
            .json({ error: { code: "COURSE_MEDIA_NOT_CONFIGURED", message: error.message } });
          return;
        }
        throw error;
      }
      return;
    }
    if (lesson.type !== LessonType.TEXT) {
      res.status(503).json({
        error: {
          code: "SECURE_MEDIA_NOT_CONFIGURED",
          message: "La diffusion sécurisée de cette ressource n’est pas encore configurée."
        }
      });
      return;
    }
    if (!lesson.contentText) {
      res.status(409).json({
        error: {
          code: "LESSON_CONTENT_UNAVAILABLE",
          message: "Le contenu de cette leçon n’est pas encore disponible."
        }
      });
      return;
    }
    res.json({
      lesson: {
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        type: lesson.type,
        durationSeconds: lesson.durationSeconds,
        contentText: lesson.contentText
      }
    });
  }
);

router.get(
  "/live-sessions/:sessionId",
  requireSession,
  async (req: Request<{ sessionId: string }>, res: Response) => {
    const parsedId = z.string().uuid().safeParse(req.params.sessionId);
    if (!parsedId.success) {
      res.status(400).json({
        error: { code: "INVALID_SESSION_ID", message: "Identifiant de session invalide." }
      });
      return;
    }
    const session = await prisma.liveSession.findFirst({
      where: {
        id: parsedId.data,
        status: "SCHEDULED",
        course: { status: CourseStatus.PUBLISHED }
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        meetingUrl: true,
        courseId: true,
        course: { select: { title: true } }
      }
    });
    if (!session) {
      res.status(404).json({
        error: { code: "LIVE_SESSION_NOT_FOUND", message: "Session en direct introuvable." }
      });
      return;
    }

    const userId: string = res.locals.userId;
    const now = new Date();
    const [enrollment, trainerAssignment] = await Promise.all([
      prisma.enrollment.findFirst({
        where: {
          userId,
          courseId: session.courseId,
          status: EnrollmentStatus.ACTIVE,
          accessExpiresAt: { gt: now }
        },
        select: { id: true }
      }),
      prisma.courseTrainer.findUnique({
        where: { courseId_trainerId: { courseId: session.courseId, trainerId: userId } },
        select: { courseId: true }
      })
    ]);
    if (!enrollment && !trainerAssignment) {
      res.status(403).json({
        error: {
          code: "COURSE_ACCESS_REQUIRED",
          message: "Un accès actif à cette formation est nécessaire pour rejoindre le direct."
        }
      });
      return;
    }
    if (session.startsAt.getTime() - now.getTime() > 15 * 60 * 1000 || session.endsAt <= now) {
      res.status(409).json({
        error: {
          code: "LIVE_SESSION_NOT_OPEN",
          message: "La salle ouvre 15 minutes avant le début et ferme à la fin de la session."
        }
      });
      return;
    }

    const meetingUrl = new URL(session.meetingUrl);
    if (meetingUrl.protocol !== "https:" || meetingUrl.username || meetingUrl.password) {
      throw new Error("Configuration du lien de direct invalide pour cette session.");
    }
    const isIplniJitsiRoom =
      meetingUrl.hostname === "meet.jit.si" && /^\/iplni-[a-f0-9]{32}$/.test(meetingUrl.pathname);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true }
    });
    if (!user) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Connexion requise." } });
      return;
    }

    res.json({
      session: {
        id: session.id,
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        courseTitle: session.course.title,
        meetingUrl: meetingUrl.toString(),
        ...(isIplniJitsiRoom
          ? { roomName: meetingUrl.pathname.slice(1), domain: meetingUrl.hostname }
          : {}),
        displayName: user.fullName
      }
    });
  }
);

router.get("/dashboard", requireLearner, async (_req: Request, res: Response) => {
  const userId: string = res.locals.userId;
  const now = new Date();
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: "ACTIVE", accessExpiresAt: { gt: now } },
    select: {
      id: true,
      courseId: true,
      moduleId: true,
      course: {
        select: {
          title: true,
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
                  contentAsset: { select: { mimeType: true } }
                }
              }
            }
          },
          trainers: { select: { trainer: { select: { fullName: true } } } },
          liveSessions: {
            where: { endsAt: { gt: now }, status: "SCHEDULED" },
            orderBy: { startsAt: "asc" },
            select: { id: true, title: true, startsAt: true, endsAt: true }
          }
        }
      }
    }
  });

  const enrollmentIds = enrollments.map(({ id }) => id);
  const progress = enrollmentIds.length
    ? await prisma.lessonProgress.findMany({
        where: { enrollmentId: { in: enrollmentIds } },
        select: {
          enrollmentId: true,
          lessonId: true,
          completedAt: true,
          progressSeconds: true,
          updatedAt: true
        }
      })
    : [];
  const certificates = await prisma.certificate.count({
    where: { status: "VALID", enrollment: { userId } }
  });
  const nextLiveSession = enrollments.length
    ? await prisma.liveSession.findFirst({
        where: {
          courseId: { in: enrollments.map(({ courseId }) => courseId) },
          endsAt: { gt: now },
          status: "SCHEDULED"
        },
        orderBy: { startsAt: "asc" },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          course: { select: { title: true } }
        }
      })
    : null;

  const courses = enrollments.map((enrollment) => {
    const modules = enrollment.course.modules.filter(
      (module) => enrollment.moduleId === null || module.id === enrollment.moduleId
    );
    const lessons = modules.flatMap((module) =>
      module.lessons.map(({ contentAsset, ...lesson }) => ({
        ...lesson,
        assetMimeType: contentAsset?.mimeType ?? null
      }))
    );
    const dashboardModules = modules.map((module) => ({
      ...module,
      lessons: module.lessons.map(({ contentAsset, ...lesson }) => ({
        ...lesson,
        assetMimeType: contentAsset?.mimeType ?? null
      }))
    }));
    const courseProgress = progress.filter((item) => item.enrollmentId === enrollment.id);
    const completedIds = new Set(
      courseProgress.filter((item) => item.completedAt !== null).map((item) => item.lessonId)
    );
    const nextLesson = lessons.find((lesson) => !completedIds.has(lesson.id));

    return {
      id: enrollment.courseId,
      title: enrollment.course.title,
      teacher: enrollment.course.trainers[0]?.trainer.fullName ?? "Équipe IPLNI",
      progress: lessons.length ? Math.round((completedIds.size / lessons.length) * 100) : 0,
      nextLesson: nextLesson?.title ?? null,
      nextLessonId: nextLesson?.id ?? null,
      completedLessons: completedIds.size,
      totalLessons: lessons.length,
      modules: dashboardModules,
      liveSessions: enrollment.course.liveSessions
    };
  });
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const learningDaysThisWeek = new Set(
    progress
      .filter((item) => item.progressSeconds > 0 && item.updatedAt >= startOfWeek)
      .map((item) => {
        const day = new Date(item.updatedAt);
        day.setHours(0, 0, 0, 0);
        return day.toISOString();
      })
  ).size;
  const activeLearningDates = [
    ...new Set(
      progress
        .filter((item) => item.progressSeconds > 0 && item.updatedAt >= startOfWeek)
        .map((item) => item.updatedAt.toISOString().slice(0, 10))
    )
  ];

  res.json({
    learner: { id: userId },
    stats: {
      activeCourses: enrollments.length,
      completedLessons: progress.filter((item) => item.completedAt !== null).length,
      learningSeconds: progress.reduce((total, item) => total + item.progressSeconds, 0),
      certificates,
      learningDaysThisWeek,
      activeLearningDates
    },
    courses,
    nextLiveSession: nextLiveSession
      ? {
          id: nextLiveSession.id,
          title: nextLiveSession.title,
          startsAt: nextLiveSession.startsAt,
          courseTitle: nextLiveSession.course.title
        }
      : null
  });
});

export default router;
