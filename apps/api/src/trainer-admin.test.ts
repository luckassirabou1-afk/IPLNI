import { describe, expect, it } from "vitest";
import { assignTrainerRoleSchema } from "./trainer-admin.js";

describe("trainer role assignment validation", () => {
  it("normalizes the email address of the existing account", () => {
    expect(assignTrainerRoleSchema.parse({ email: "  Trainer@Example.org " })).toEqual({
      email: "trainer@example.org"
    });
  });

  it("rejects malformed or oversized email addresses", () => {
    expect(assignTrainerRoleSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
    expect(
      assignTrainerRoleSchema.safeParse({ email: `${"a".repeat(250)}@example.org` }).success
    ).toBe(false);
  });
});
