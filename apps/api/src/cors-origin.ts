const localDevelopmentHosts = new Set(["localhost", "127.0.0.1", "::1"]);

export function isAllowedCorsOrigin(
  origin: string | undefined,
  configuredOrigin: string | undefined,
  nodeEnv: string | undefined
): boolean {
  if (!origin) return true;

  if (origin === (configuredOrigin ?? "http://localhost:3000")) return true;
  if (nodeEnv === "production") return false;

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.protocol === "http:" && localDevelopmentHosts.has(parsedOrigin.hostname);
  } catch {
    return false;
  }
}
