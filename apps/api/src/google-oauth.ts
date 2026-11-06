import { z } from "zod";

const googleTokenResponseSchema = z.object({ access_token: z.string().min(1) });
const googleProfileSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email().max(254),
  email_verified: z.boolean(),
  name: z.string().trim().min(1).max(100)
});

export type GoogleProfile = {
  googleAccountId: string;
  email: string;
  fullName: string;
};

export type GoogleOAuthConfiguration = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webUrl: string;
};

export function googleOAuthConfiguration(): GoogleOAuthConfiguration {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, WEB_URL } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI || !WEB_URL) {
    throw new Error("La connexion Google n’est pas configurée.");
  }

  const redirectUri = new URL(GOOGLE_REDIRECT_URI);
  const webUrl = new URL(WEB_URL);
  if (
    !["http:", "https:"].includes(redirectUri.protocol) ||
    !["http:", "https:"].includes(webUrl.protocol) ||
    (process.env.NODE_ENV === "production" &&
      (redirectUri.protocol !== "https:" || webUrl.protocol !== "https:"))
  ) {
    throw new Error("Les URL de redirection Google doivent utiliser HTTPS en production.");
  }

  return {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    redirectUri: redirectUri.toString(),
    webUrl: webUrl.toString()
  };
}

export function safeRelativePath(value: unknown, fallback = "/dashboard"): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }

  try {
    const resolved = new URL(value, "https://iplni.local");
    return resolved.origin === "https://iplni.local"
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

export function googleAuthorizationUrl(
  configuration: GoogleOAuthConfiguration,
  state: string
): string {
  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: configuration.clientId,
    redirect_uri: configuration.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account"
  }).toString();
  return authorizationUrl.toString();
}

export async function googleProfileFromAuthorizationCode(
  configuration: GoogleOAuthConfiguration,
  code: string
): Promise<GoogleProfile> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      redirect_uri: configuration.redirectUri,
      grant_type: "authorization_code"
    })
  });
  if (!tokenResponse.ok) throw new Error("Google n’a pas accepté le code d’autorisation.");

  const token = googleTokenResponseSchema.safeParse(await tokenResponse.json());
  if (!token.success) throw new Error("La réponse de jeton Google est invalide.");

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.data.access_token}` }
  });
  if (!profileResponse.ok) throw new Error("Google n’a pas retourné le profil utilisateur.");

  const profile = googleProfileSchema.safeParse(await profileResponse.json());
  if (!profile.success || !profile.data.email_verified) {
    throw new Error("Le profil Google n’a pas d’adresse e-mail vérifiée valide.");
  }

  return {
    googleAccountId: profile.data.sub,
    email: profile.data.email.toLowerCase(),
    fullName: profile.data.name
  };
}
