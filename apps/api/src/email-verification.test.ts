import { describe, expect, it } from "vitest";
import { verificationTokenHash } from "./email-verification.js";

describe("email verification tokens", () => {
  it("stores a deterministic digest rather than the raw token", () => {
    const token = "a-random-one-time-verification-token";

    expect(verificationTokenHash(token)).toHaveLength(64);
    expect(verificationTokenHash(token)).toBe(verificationTokenHash(token));
    expect(verificationTokenHash(token)).not.toBe(token);
    expect(verificationTokenHash(`${token}-different`)).not.toBe(verificationTokenHash(token));
  });
});
