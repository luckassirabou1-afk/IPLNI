import { describe, expect, it } from "vitest";
import { evaluateRateLimit } from "./rate-limit.js";

describe("authentication rate limits", () => {
  const now = new Date("2026-10-20T10:00:00.000Z");

  it("allows attempts within the configured limit", () => {
    expect(evaluateRateLimit(5, new Date(now.getTime() - 60_000), 5, 900, now)).toEqual({
      allowed: true,
      retryAfterSeconds: 0
    });
  });

  it("blocks excess attempts for the remainder of the window", () => {
    expect(evaluateRateLimit(6, new Date(now.getTime() - 60_000), 5, 900, now)).toEqual({
      allowed: false,
      retryAfterSeconds: 840
    });
  });

  it("allows attempts again once the window has elapsed", () => {
    expect(evaluateRateLimit(6, new Date(now.getTime() - 901_000), 5, 900, now)).toEqual({
      allowed: true,
      retryAfterSeconds: 0
    });
  });
});
