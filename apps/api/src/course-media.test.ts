import { describe, expect, it } from "vitest";
import { LessonType } from "@prisma/client";
import { courseMediaLimits, validateCourseMediaFile } from "./course-media.js";

describe("course media validation", () => {
  it("allows PDFs for resource lessons within the configured limit", () => {
    expect(
      validateCourseMediaFile(LessonType.RESOURCE, "application/pdf", courseMediaLimits.pdf)
    ).toEqual({
      extension: "pdf",
      maxBytes: courseMediaLimits.pdf
    });
  });

  it("allows Word and PowerPoint documents for resource lessons", () => {
    expect(validateCourseMediaFile(LessonType.RESOURCE, "application/msword", 1024).extension).toBe(
      "doc"
    );
    expect(
      validateCourseMediaFile(
        LessonType.RESOURCE,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        1024
      ).extension
    ).toBe("docx");
    expect(
      validateCourseMediaFile(LessonType.RESOURCE, "application/vnd.ms-powerpoint", 1024).extension
    ).toBe("ppt");
    expect(
      validateCourseMediaFile(
        LessonType.RESOURCE,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        1024
      ).extension
    ).toBe("pptx");
  });

  it("allows Excel spreadsheets for resource lessons up to 50 MB", () => {
    expect(
      validateCourseMediaFile(
        LessonType.RESOURCE,
        "application/vnd.ms-excel",
        courseMediaLimits.spreadsheet
      )
    ).toEqual({ extension: "xls", maxBytes: courseMediaLimits.spreadsheet });
    expect(
      validateCourseMediaFile(
        LessonType.RESOURCE,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        1024
      ).extension
    ).toBe("xlsx");
  });

  it("allows MP4 and WebM files for video lessons", () => {
    expect(validateCourseMediaFile(LessonType.VIDEO, "video/mp4", 1024).extension).toBe("mp4");
    expect(validateCourseMediaFile(LessonType.VIDEO, "video/webm", 1024).extension).toBe("webm");
  });

  it("rejects mismatched types, empty files, and files over the size limit", () => {
    expect(() => validateCourseMediaFile(LessonType.VIDEO, "application/pdf", 1024)).toThrow();
    expect(() => validateCourseMediaFile(LessonType.RESOURCE, "application/pdf", 0)).toThrow();
    expect(() =>
      validateCourseMediaFile(LessonType.RESOURCE, "application/pdf", courseMediaLimits.pdf + 1)
    ).toThrow();
    expect(() =>
      validateCourseMediaFile(LessonType.VIDEO, "video/mp4", courseMediaLimits.video + 1)
    ).toThrow();
    expect(() =>
      validateCourseMediaFile(
        LessonType.RESOURCE,
        "application/msword",
        courseMediaLimits.office + 1
      )
    ).toThrow();
    expect(() =>
      validateCourseMediaFile(
        LessonType.RESOURCE,
        "application/vnd.ms-excel",
        courseMediaLimits.spreadsheet + 1
      )
    ).toThrow();
  });
});
