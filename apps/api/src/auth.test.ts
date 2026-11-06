import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth.js";

describe("password hashing", () => {
  it("verifies the password used to create a hash", async () => {
    const password = "un-mot-de-passe-long";
    const encodedHash = await hashPassword(password);

    await expect(verifyPassword(password, encodedHash)).resolves.toBe(true);
    await expect(verifyPassword("un-autre-mot-de-passe", encodedHash)).resolves.toBe(false);
  });

  it("uses a unique salt for each password hash", async () => {
    const firstHash = await hashPassword("un-mot-de-passe-long");
    const secondHash = await hashPassword("un-mot-de-passe-long");

    expect(firstHash).not.toBe(secondHash);
  });

  it("rejects malformed hashes", async () => {
    await expect(verifyPassword("password", "not-a-scrypt-hash")).resolves.toBe(false);
  });
});
