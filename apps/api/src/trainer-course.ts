import { LessonType } from "@prisma/client";
import { z } from "zod";

export const createCourseSchema = z.object({
  title: z.string().trim().min(4).max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3)
    .max(160),
  description: z.string().trim().min(30).max(5000),
  languageCode: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
    .default("fr"),
  level: z.string().trim().max(60).nullable().optional(),
  priceAmount: z.number().int().min(1).max(100_000_000),
  accessDurationDays: z.number().int().min(1).max(1095)
});

export const liveMeetingUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password;
      } catch {
        return false;
      }
    },
    {
      message: "Le lien du direct doit commencer par HTTPS."
    }
  )
  .optional();

export const createModuleSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1000).nullable().optional()
});

export const createLessonSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    type: z.nativeEnum(LessonType),
    durationSeconds: z.number().int().min(1).max(86_400).nullable().optional(),
    contentText: z.string().trim().max(100_000).nullable().optional(),
    isPreview: z.boolean().default(false)
  })
  .superRefine((lesson, context) => {
    if (
      lesson.type === LessonType.TEXT &&
      (!lesson.contentText || lesson.contentText.length < 20)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Une leçon texte doit contenir au moins 20 caractères de contenu.",
        path: ["contentText"]
      });
    }
    if (lesson.type !== LessonType.TEXT && lesson.contentText) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Le contenu texte est réservé aux leçons de type Texte.",
        path: ["contentText"]
      });
    }
  });

export const courseSubmissionReviewSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().max(1000).optional()
  })
  .refine((input) => input.decision !== "reject" || Boolean(input.note && input.note.length >= 3), {
    message: "Un motif d’au moins 3 caractères est requis pour renvoyer une formation.",
    path: ["note"]
  });

type SubmissionLesson = {
  type: LessonType;
  contentText: string | null;
  contentAsset: { mimeType: string } | null;
};

export function lessonReadyForSubmission(lesson: SubmissionLesson): boolean {
  if (lesson.type === LessonType.TEXT) {
    return Boolean(lesson.contentText && lesson.contentText.trim().length >= 20);
  }
  if (lesson.type === LessonType.VIDEO) {
    return (
      lesson.contentAsset?.mimeType === "video/mp4" ||
      lesson.contentAsset?.mimeType === "video/webm"
    );
  }
  if (lesson.type === LessonType.RESOURCE) {
    return (
      lesson.contentAsset?.mimeType === "application/pdf" ||
      lesson.contentAsset?.mimeType === "application/msword" ||
      lesson.contentAsset?.mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lesson.contentAsset?.mimeType === "application/vnd.ms-powerpoint" ||
      lesson.contentAsset?.mimeType ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      lesson.contentAsset?.mimeType === "application/vnd.ms-excel" ||
      lesson.contentAsset?.mimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  }
  return lesson.type === LessonType.LIVE;
}

export function courseReadyForSubmission(modules: Array<{ lessons: SubmissionLesson[] }>): boolean {
  const lessons = modules.flatMap((module) => module.lessons);
  return modules.length > 0 && lessons.length > 0 && lessons.every(lessonReadyForSubmission);
}
