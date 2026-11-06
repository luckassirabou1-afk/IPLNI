import { describe, expect, it } from "vitest";
import { isAllowedCorsOrigin } from "./cors-origin.js";

describe("CORS origins", () => {
  it("allows the configured origin", () => {
    expect(
      isAllowedCorsOrigin("https://learn.example.com", "https://learn.example.com", "production")
    ).toBe(true);
  });

  it("allows local development servers on fallback ports", () => {
    expect(
      isAllowedCorsOrigin("http://localhost:3001", "http://localhost:3000", "development")
    ).toBe(true);
  });

  it("allows requests without an Origin header", () => {
    expect(isAllowedCorsOrigin(undefined, "http://localhost:3000", "production")).toBe(true);
  });

  it("rejects unconfigured origins in production", () => {
    expect(
      isAllowedCorsOrigin("http://localhost:3001", "https://learn.example.com", "production")
    ).toBe(false);
    expect(
      isAllowedCorsOrigin("https://attacker.example", "https://learn.example.com", "production")
    ).toBe(false);
  });

  it("does not allow lookalike local hosts during development", () => {
    expect(isAllowedCorsOrigin("http://localhost.attacker.example", undefined, "development")).toBe(
      false
    );
    expect(isAllowedCorsOrigin("https://localhost:3001", undefined, "development")).toBe(false);
  });
});
