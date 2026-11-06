import { describe, expect, it } from "vitest";
import { normalizeBurkinaPhoneNumber } from "../phone.js";

describe("Orange Money configuration", () => {
  it("normalizes Burkina Faso numbers with or without a country code", () => {
    expect(normalizeBurkinaPhoneNumber("56021114")).toBe("+22656021114");
    expect(normalizeBurkinaPhoneNumber("+226 56 02 11 14")).toBe("+22656021114");
  });

  it("rejects malformed phone numbers", () => {
    expect(() => normalizeBurkinaPhoneNumber("12345")).toThrow(/8 chiffres/);
    expect(() => normalizeBurkinaPhoneNumber("+22556021114")).toThrow(/8 chiffres/);
  });
});
