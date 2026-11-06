import express from "express";
import type { NextFunction, Request, Response } from "express";
import type { Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  transaction: vi.fn(),
  courseFindUnique: vi.fn(),
  courseUpdate: vi.fn(),
  auditLogCreate: vi.fn()
}));

vi.mock("./prisma.js", () => ({
  prisma: { $transaction: mocks.transaction }
}));

vi.mock("./auth.js", () => ({
  requireSession: (_req: Request, res: Response, next: NextFunction) => {
    res.locals.userId = mocks.adminId;
    next();
  }
}));

vi.mock("./role.js", () => ({
  requireRole: () => (_req: Request, res: Response, next: NextFunction) => {
    res.locals.userId = mocks.adminId;
    next();
  }
}));

import adminRouter from "./routes/admin.js";

const courseId = "22222222-2222-4222-8222-222222222222";
const readyText = "Un contenu suffisamment détaillé pour être étudié par l’apprenant.";
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json(), adminRouter);
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
    throw new Error("Unable to determine the admin route test server address.");
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
          findUnique: mocks.courseFindUnique,
          update: mocks.courseUpdate
        },
        auditLog: { create: mocks.auditLogCreate }
      } as never)
  );
});

describe("admin course review route", () => {
  it("approves a submitted course, publishes it, and records the decision", async () => {
    mocks.courseFindUnique.mockResolvedValue({
      id: courseId,
      title: "Formation test",
      status: "SUBMITTED",
      modules: [
        {
          lessons: [{ type: "TEXT", contentText: readyText, contentAsset: null }]
        }
      ]
    });
    mocks.courseUpdate.mockResolvedValue({ id: courseId, status: "PUBLISHED" });

    const response = await fetch(`${baseUrl}/courses/${courseId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      course: { id: courseId, status: "PUBLISHED" }
    });
    expect(mocks.courseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: courseId },
        data: { status: "PUBLISHED", reviewNote: null }
      })
    );
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: mocks.adminId,
          action: "COURSE_PUBLISHED",
          entityId: courseId
        })
      })
    );
  });

  it("does not publish an incomplete submitted course", async () => {
    mocks.courseFindUnique.mockResolvedValue({
      id: courseId,
      title: "Formation incomplète",
      status: "SUBMITTED",
      modules: [{ lessons: [{ type: "TEXT", contentText: "Trop court", contentAsset: null }] }]
    });

    const response = await fetch(`${baseUrl}/courses/${courseId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" })
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "COURSE_CONTENT_INCOMPLETE" }
    });
    expect(mocks.courseUpdate).not.toHaveBeenCalled();
  });

  it("returns a rejected course to draft with administrator feedback", async () => {
    mocks.courseFindUnique.mockResolvedValue({
      id: courseId,
      title: "Formation à corriger",
      status: "SUBMITTED",
      modules: []
    });
    mocks.courseUpdate.mockResolvedValue({ id: courseId, status: "DRAFT" });

    const response = await fetch(`${baseUrl}/courses/${courseId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "reject", note: "Ajouter une leçon." })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      course: { id: courseId, status: "DRAFT" }
    });
    expect(mocks.courseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "DRAFT", reviewNote: "Ajouter une leçon." }
      })
    );
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "COURSE_RETURNED_TO_DRAFT" })
      })
    );
  });
});
