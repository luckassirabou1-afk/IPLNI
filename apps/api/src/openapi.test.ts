import { describe, expect, it } from "vitest";
import { openApiDocument } from "./openapi.js";

describe("OpenAPI document", () => {
  it("documents every API route without Express-style path parameters", () => {
    const paths = Object.keys(openApiDocument.paths);

    expect(paths.length).toBeGreaterThanOrEqual(35);
    expect(paths).toContain("/api/v1/auth/login");
    expect(paths).toContain("/api/v1/courses/{slug}");
    expect(paths).toContain("/api/v1/admin/trainers");
    expect(paths).toContain("/api/v1/admin/payments/{paymentId}/review");
    expect(paths.some((path) => path.includes(":"))).toBe(false);
  });

  it("describes session authentication for protected operations", () => {
    const sessionInfo = openApiDocument.paths["/api/v1/auth/me"].get;
    const publicCourses = openApiDocument.paths["/api/v1/courses"].get;

    expect(sessionInfo).toHaveProperty("security", [{ sessionCookie: [] }]);
    expect(publicCourses).not.toHaveProperty("security");
    expect(openApiDocument.components.securitySchemes.sessionCookie.name).toBe("iplni_session");
  });
});
