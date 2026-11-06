import { CourseStatus } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();

const publicCourseSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  languageCode: true,
  level: true,
  priceAmount: true,
  currency: true,
  accessDurationDays: true,
  modules: {
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      title: true,
      description: true,
      lessons: {
        orderBy: { position: "asc" as const },
        select: { id: true, title: true, type: true, durationSeconds: true }
      }
    }
  },
  trainers: { select: { trainer: { select: { fullName: true } } } }
} as const;

router.get("/", async (_req, res) => {
  const courses = await prisma.course.findMany({
    where: { status: CourseStatus.PUBLISHED, currency: "XOF", priceAmount: { gt: 0 } },
    orderBy: { createdAt: "desc" },
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
      modules: {
        select: {
          lessons: { select: { id: true } }
        }
      },
      trainers: { select: { trainer: { select: { fullName: true } } } }
    }
  });

  res.json({
    courses: courses.map(({ modules, trainers, ...course }) => ({
      ...course,
      trainerNames: trainers.map(({ trainer }) => trainer.fullName),
      moduleCount: modules.length,
      lessonCount: modules.reduce((total, module) => total + module.lessons.length, 0)
    }))
  });
});

router.get("/:slug", async (req, res) => {
  const course = await prisma.course.findFirst({
    where: {
      slug: req.params.slug,
      status: CourseStatus.PUBLISHED,
      currency: "XOF",
      priceAmount: { gt: 0 }
    },
    select: publicCourseSelect
  });

  if (!course) {
    res
      .status(404)
      .json({ error: { code: "COURSE_NOT_FOUND", message: "Formation introuvable." } });
    return;
  }

  res.json({
    course: {
      ...course,
      trainerNames: course.trainers.map(({ trainer }) => trainer.fullName),
      moduleCount: course.modules.length,
      lessonCount: course.modules.reduce((total, module) => total + module.lessons.length, 0)
    }
  });
});

export default router;
