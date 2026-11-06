import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  trainerId: "11111111-1111-4111-8111-111111111111",
  transaction: vi.fn(),
  courseFindFirst: vi.fn(),
  courseCreate: vi.fn(),
  courseUpdate: vi.fn(),
  courseDelete: vi.fn(),
  moduleFindFirst: vi.fn(),
  moduleCreate: vi.fn(),
  lessonFindFirst: vi.fn(),
  lessonCreate: vi.fn(),
  auditLogCreate: vi.fn(),
  assetFindMany: vi.fn(),
  assetDeleteMany: vi.fn(),
  deleteCourseMediaObject: vi.fn()
}));

vi.mock("./prisma.js", () => ({
  prisma: {
    $transaction: mocks.transaction,
    course: {
      findFirst: mocks.courseFindFirst,
      create: mocks.courseCreate,
      update: mocks.courseUpdate,
      delete: mocks.courseDelete
    },
    learningModule: { findFirst: mocks.moduleFindFirst, create: mocks.moduleCreate },
    lesson: { findFirst: mocks.lessonFindFirst, create: mocks.lessonCreate },
    auditLog: { create: mocks.auditLogCreate },
    asset: { findMany: mocks.assetFindMany, deleteMany: mocks.assetDeleteMany }
  }
}));

vi.mock("./auth.js", () => ({
  requireSession: (_req: Request, res: Response, next: NextFunction) => {
    res.locals.userId = mocks.trainerId;
    next();
  }
}));

vi.mock("./role.js", () => ({
  requireAnyRole: () => (_req: Request, res: Response, next: NextFunction) => {
    res.locals.userId = mocks.trainerId;
    next();
  }
}));

vi.mock("./course-media.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./course-media.js")>();
  return { ...actual, deleteCourseMediaObject: mocks.deleteCourseMediaObject };
});

import trainerRouter from "./routes/trainer.js";

const courseId = "22222222-2222-4222-8222-222222222222";
const readyText = "Un contenu suffisamment détaillé pour être étudié par l’apprenant.";
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json(), trainerRouter);
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(500).json({ error: { message: error instanceof Error ? error.message : "Erreur" } });
  });
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine the trainer route test server address.");
  }
  baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(
    async (operation: (transaction: never) => Promise<unknown>) =>
      operation({
        course: {
          findFirst: mocks.courseFindFirst,
          create: mocks.courseCreate,
          update: mocks.courseUpdate,
          delete: mocks.courseDelete
        },
        learningModule: { findFirst: mocks.moduleFindFirst, create: mocks.moduleCreate },
        lesson: { findFirst: mocks.lessonFindFirst, create: mocks.lessonCreate },
        auditLog: { create: mocks.auditLogCreate },
        asset: { findMany: mocks.assetFindMany, deleteMany: mocks.assetDeleteMany }
      } as never)
  );
});

describe("trainer course workflow routes", () => {
  it("creates a draft, adds a module and lesson, then submits it for review", async () => {
    const moduleId = "33333333-3333-4333-8333-333333333333";
    const lessonId = "44444444-4444-4444-8444-444444444444";
    mocks.courseCreate.mockResolvedValue({
      id: courseId,
      title: "Formation test",
      slug: "formation-test",
      status: "DRAFT"
    });
    mocks.courseFindFirst.mockResolvedValueOnce({ id: courseId }).mockResolvedValueOnce({
      id: courseId,
      modules: [
        {
          lessons: [{ type: "TEXT", contentText: readyText, contentAsset: null }]
        }
      ]
    });
    mocks.moduleFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: moduleId });
    mocks.moduleCreate.mockResolvedValue({ id: moduleId, title: "Module 1", position: 1 });
    mocks.lessonFindFirst.mockResolvedValue(null);
    mocks.lessonCreate.mockResolvedValue({
      id: lessonId,
      title: "Première leçon",
      type: "TEXT",
      position: 1
    });
    mocks.courseUpdate.mockResolvedValue({ id: courseId, status: "SUBMITTED" });

    const draftResponse = await fetch(`${baseUrl}/courses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Formation test",
        slug: "Formation-test",
        description: "Une formation détaillée pour progresser dans un contexte professionnel.",
        priceAmount: 25000,
        accessDurationDays: 90
      })
    });
    expect(draftResponse.status).toBe(201);
    await expect(draftResponse.json()).resolves.toMatchObject({
      course: { id: courseId, status: "DRAFT" }
    });

    const moduleResponse = await fetch(`${baseUrl}/courses/${courseId}/modules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Module 1" })
    });
    expect(moduleResponse.status).toBe(201);
    await expect(moduleResponse.json()).resolves.toMatchObject({
      module: { id: moduleId, position: 1 }
    });

    const lessonResponse = await fetch(`${baseUrl}/modules/${moduleId}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Première leçon",
        type: "TEXT",
        contentText: readyText
      })
    });
    expect(lessonResponse.status).toBe(201);
    await expect(lessonResponse.json()).resolves.toMatchObject({
      lesson: { id: lessonId, type: "TEXT" }
    });

    const submitResponse = await fetch(`${baseUrl}/courses/${courseId}/submit`, {
      method: "POST"
    });
    expect(submitResponse.status).toBe(200);
    await expect(submitResponse.json()).resolves.toEqual({
      course: { id: courseId, status: "SUBMITTED" }
    });
    expect(mocks.courseCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DRAFT" }) })
    );
    expect(mocks.courseUpdate).toHaveBeenCalledWith({
      where: { id: courseId },
      data: { status: "SUBMITTED", reviewNote: null }
    });
  });

  it("submits a complete draft and records the submitted status", async () => {
    mocks.courseFindFirst.mockResolvedValue({
      id: courseId,
      modules: [
        {
          lessons: [{ type: "TEXT", contentText: readyText, contentAsset: null }]
        }
      ]
    });

    const response = await fetch(`${baseUrl}/courses/${courseId}/submit`, { method: "POST" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      course: { id: courseId, status: "SUBMITTED" }
    });
    expect(mocks.courseUpdate).toHaveBeenCalledWith({
      where: { id: courseId },
      data: { status: "SUBMITTED", reviewNote: null }
    });
    expect(mocks.auditLogCreate).toHaveBeenCalled();
  });

  it("explains when a lesson is incomplete and does not change the draft", async () => {
    mocks.courseFindFirst.mockResolvedValue({
      id: courseId,
      modules: [
        {
          lessons: [{ type: "TEXT", contentText: "Trop court", contentAsset: null }]
        }
      ]
    });

    const response = await fetch(`${baseUrl}/courses/${courseId}/submit`, { method: "POST" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "COURSE_LESSON_CONTENT_REQUIRED" }
    });
    expect(mocks.courseUpdate).not.toHaveBeenCalled();
  });

  it("deletes only an owned draft and records the deletion", async () => {
    mocks.courseFindFirst.mockResolvedValue({
      id: courseId,
      title: "Formation test",
      modules: [],
      _count: { orderItems: 0, enrollments: 0 }
    });
    mocks.courseDelete.mockResolvedValue({});

    const response = await fetch(`${baseUrl}/courses/${courseId}`, { method: "DELETE" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      course: { id: courseId, deleted: true }
    });
    expect(mocks.courseDelete).toHaveBeenCalledWith({ where: { id: courseId } });
    expect(mocks.courseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: courseId,
          status: "DRAFT",
          trainers: { some: { trainerId: mocks.trainerId } }
        }
      })
    );
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "COURSE_DRAFT_DELETED",
          entityId: courseId
        })
      })
    );
  });

  it("removes unused private media when deleting a draft", async () => {
    const asset = {
      id: "33333333-3333-4333-8333-333333333333",
      storageKey: "course-media/draft/lesson.mp4"
    };
    mocks.courseFindFirst.mockResolvedValue({
      id: courseId,
      title: "Formation avec vidéo",
      modules: [{ lessons: [{ contentAsset: asset }] }],
      _count: { orderItems: 0, enrollments: 0 }
    });
    mocks.courseDelete.mockResolvedValue({});
    mocks.assetFindMany.mockResolvedValue([asset]);
    mocks.assetDeleteMany.mockResolvedValue({ count: 1 });
    mocks.deleteCourseMediaObject.mockResolvedValue(undefined);

    const response = await fetch(`${baseUrl}/courses/${courseId}`, { method: "DELETE" });

    expect(response.status).toBe(200);
    expect(mocks.assetDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: [asset.id] } }
    });
    expect(mocks.deleteCourseMediaObject).toHaveBeenCalledWith(asset.storageKey);
  });

  it("does not delete a draft that has enrollments or orders", async () => {
    mocks.courseFindFirst.mockResolvedValue({
      id: courseId,
      title: "Formation déjà utilisée",
      modules: [],
      _count: { orderItems: 1, enrollments: 0 }
    });

    const response = await fetch(`${baseUrl}/courses/${courseId}`, { method: "DELETE" });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "COURSE_HAS_HISTORY" }
    });
    expect(mocks.courseDelete).not.toHaveBeenCalled();
  });
});
