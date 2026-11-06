import { describe, expect, it } from "vitest";
import {
  googleAuthorizationUrl,
  safeRelativePath,
  type GoogleOAuthConfiguration
} from "./google-oauth.js";

const configuration: GoogleOAuthConfiguration = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "http://localhost:4000/api/v1/auth/google/callback",
  webUrl: "http://localhost:3000"
};

describe("Google OAuth helpers", () => {
  it("requests identity and profile scopes and includes the callback state", () => {
    const url = new URL(googleAuthorizationUrl(configuration, "random-state"));

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("random-state");
    expect(url.searchParams.get("redirect_uri")).toBe(configuration.redirectUri);
  });

  it("accepts only same-site relative return paths", () => {
    expect(safeRelativePath("/courses?sort=recent")).toBe("/courses?sort=recent");
    expect(safeRelativePath("//attacker.example")).toBe("/dashboard");
    expect(safeRelativePath("https://attacker.example")).toBe("/dashboard");
    expect(safeRelativePath("/\\attacker.example")).toBe("/dashboard");
  });
});
