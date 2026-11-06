import nodemailer from "nodemailer";

type SmtpConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

function smtpConfiguration(): SmtpConfiguration {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  const port = Number(SMTP_PORT);
  if (
    !SMTP_HOST ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !SMTP_USER ||
    !SMTP_PASSWORD ||
    !SMTP_FROM
  ) {
    throw new Error("Le service d’e-mail SMTP n’est pas configuré.");
  }

  return {
    host: SMTP_HOST,
    port,
    secure: SMTP_SECURE === "true",
    user: SMTP_USER,
    password: SMTP_PASSWORD,
    from: SMTP_FROM
  };
}

export function assertEmailDeliveryConfigured(): void {
  smtpConfiguration();
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const config = smtpConfiguration();
  const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
  const verificationUrl = new URL("/verify-email", webUrl);
  verificationUrl.searchParams.set("token", token);

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password }
  });

  await transporter.sendMail({
    from: config.from,
    to,
    subject: "Confirmez votre adresse e-mail — IPLNI",
    text: `Pour confirmer votre adresse e-mail et activer votre compte IPLNI, ouvrez ce lien (valable 24 heures) : ${verificationUrl.toString()}`,
    html: `<p>Bienvenue sur IPLNI.</p><p><a href="${verificationUrl.toString()}">Confirmer mon adresse e-mail</a></p><p>Ce lien expire dans 24 heures. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p>`
  });
}
