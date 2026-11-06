import { RoleCode } from "@prisma/client";
import type { RequestHandler } from "express";
import { prisma } from "./prisma.js";

export function requireRole(roleCode: RoleCode): RequestHandler {
  return requireAnyRole(roleCode);
}

export function requireAnyRole(...roleCodes: RoleCode[]): RequestHandler {
  if (roleCodes.length === 0) {
    throw new Error("Au moins un rôle doit être autorisé.");
  }

  return async (_req, res, next) => {
    const assignment = await prisma.userRole.findFirst({
      where: { userId: res.locals.userId, role: { code: { in: roleCodes } } },
      select: { userId: true }
    });
    if (!assignment) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Accès non autorisé." } });
      return;
    }
    next();
  };
}
