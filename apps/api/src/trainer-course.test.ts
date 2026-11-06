import { describe, expect, it } from "vitest";
import {
  createCourseSchema,
  createLessonSchema,
  courseSubmissionReviewSchema,
  courseReadyForSubmission,
  liveMeetingUrlSchema,
  lessonReadyForSubmission
} from "./trainer-course.js";

describe("trainer course input validation", () => {
  it("accepts only HTTPS live meeting links when one is provided", () => {
    expect(liveMeetingUrlSchema.safeParse(undefined).success).toBe(true);
    expect(liveMeetingUrlSchema.safeParse("https://example.com/live").success).toBe(true);
    expect(liveMeetingUrlSchema.safeParse("http://example.com/live").success).toBe(false);
    expect(liveMeetingUrlSchema.safeParse("not-a-url").success).toBe(false);
  });

  it("accepts valid course data and normalizes a slug", () => {
    const parsed = createCourseSchema.safeParse({
      title: "Français professionnel",
      slug: "Francais-Professionnel",
      description: "Une formation détaillée pour progresser dans un contexte professionnel.",
      priceAmount: 25000,
      accessDurationDays: 90
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.slug).toBe("francais-professionnel");
  });

  it("requires substantial text for a text lesson and disallows unrelated content", () => {
    const base = { title: "Première leçon", type: "TEXT" };
    expect(createLessonSchema.safeParse({ ...base, contentText: "Trop court" }).success).toBe(
      false
    );
    expect(
      createLessonSchema.safeParse({
        title: "Première leçon",
        type: "TEXT",
        contentText: "Un contenu suffisamment détaillé pour être étudié par l’apprenant."
      }).success
    ).toBe(true);
    expect(
      createLessonSchema.safeParse({
        title: "Vidéo",
        type: "VIDEO",
        contentText: "Ce contenu ne correspond pas à une vidéo."
      }).success
    ).toBe(false);
  });

  it("requires a reason when an administrator rejects a course", () => {
    expect(courseSubmissionReviewSchema.safeParse({ decision: "reject" }).success).toBe(false);
    expect(
      courseSubmissionReviewSchema.safeParse({ decision: "reject", note: "À compléter" }).success
    ).toBe(true);
  });

  it("requires uploaded files for video and document lessons but permits scheduled live-lesson placeholders", () => {
    expect(
      lessonReadyForSubmission({
        type: "TEXT",
        contentText: "Contenu trop court",
        contentAsset: null
      })
    ).toBe(false);
    expect(
      lessonReadyForSubmission({
        type: "TEXT",
        contentText: "Un contenu suffisamment détaillé pour être étudié par l’apprenant.",
        contentAsset: null
      })
    ).toBe(true);
    expect(
      lessonReadyForSubmission({
        type: "VIDEO",
        contentText: null,
        contentAsset: { mimeType: "video/mp4" }
      })
    ).toBe(true);
    expect(
      lessonReadyForSubmission({
        type: "RESOURCE",
        contentText: null,
        contentAsset: { mimeType: "application/pdf" }
      })
    ).toBe(true);
    expect(
      lessonReadyForSubmission({
        type: "RESOURCE",
        contentText: null,
        contentAsset: {
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }
      })
    ).toBe(true);
    expect(
      lessonReadyForSubmission({
        type: "RESOURCE",
        contentText: null,
        contentAsset: {
          mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        }
      })
    ).toBe(true);
    expect(
      lessonReadyForSubmission({
        type: "RESOURCE",
        contentText: null,
        contentAsset: {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
      })
    ).toBe(true);
    expect(lessonReadyForSubmission({ type: "VIDEO", contentText: null, contentAsset: null })).toBe(
      false
    );
    expect(
      lessonReadyForSubmission({
        type: "RESOURCE",
        contentText: null,
        contentAsset: { mimeType: "video/mp4" }
      })
    ).toBe(false);
    expect(lessonReadyForSubmission({ type: "LIVE", contentText: null, contentAsset: null })).toBe(
      true
    );
  });

  it("only allows submission when modules and all their lessons are ready", () => {
    expect(courseReadyForSubmission([])).toBe(false);
    expect(courseReadyForSubmission([{ lessons: [] }])).toBe(false);
    expect(
      courseReadyForSubmission([
        {
          lessons: [
            {
              type: "TEXT",
              contentText: "Un contenu suffisamment détaillé pour être étudié par l’apprenant.",
              contentAsset: null
            }
          ]
        }
      ])
    ).toBe(true);
    expect(
      courseReadyForSubmission([
        {
          lessons: [
            { type: "LIVE", contentText: null, contentAsset: null },
            { type: "VIDEO", contentText: null, contentAsset: null }
          ]
        }
      ])
    ).toBe(false);
  });
});
