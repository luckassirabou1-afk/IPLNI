"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { t, useLanguage } from "./language-provider";

type ApiResponse = { message?: string; error?: { message?: string } };
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function VerifyEmail() {
  const { locale } = useLanguage();
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"ready" | "checking" | "verified" | "error">("ready");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email") ?? "");
    if (params.get("verified") === "1") {
      setStatus("verified");
      setMessage(
        t(
          localeRef.current,
          "Adresse e-mail vérifiée. Vous pouvez maintenant vous connecter.",
          "Email address verified. You can now sign in."
        )
      );
      return;
    }
    const token = params.get("token");
    if (!token) return;

    let active = true;
    setStatus("checking");
    window.history.replaceState(null, "", "/verify-email?checking=1");
    fetch(`${apiBaseUrl}/api/v1/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    })
      .then(async (response) => {
        const body = (await response.json()) as ApiResponse;
        if (!response.ok)
          throw new Error(body.error?.message ?? "Ce lien est invalide ou a expiré.");
        if (active) {
          setStatus("verified");
          setMessage(body.message ?? "Votre adresse e-mail est vérifiée.");
          window.history.replaceState(null, "", "/verify-email?verified=1");
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setStatus("error");
          setMessage(cause instanceof Error ? cause.message : "La vérification n’a pas abouti.");
          window.history.replaceState(null, "", "/verify-email");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function resend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const body = (await response.json()) as ApiResponse;
      if (!response.ok) throw new Error(body.error?.message ?? "L’envoi du lien a échoué.");
      setMessage(
        body.message ??
          "Si un compte en attente correspond à cette adresse, un nouveau lien lui a été envoyé."
      );
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Impossible d’envoyer le lien.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="auth-state-page">
      <section className="auth-card verify-card">
        <Link href="/" className="auth-brand">
          <Image src="/iplni-logo.png" alt="" width={48} height={48} priority />
          <span>
            <strong>IPLNI</strong>
            <small>{t(locale, "APPRENDRE · PROGRESSER", "LEARN · GROW")}</small>
          </span>
        </Link>
        {status === "checking" ? (
          <>
            <p className="eyebrow">
              {t(locale, "VÉRIFICATION EN COURS", "VERIFICATION IN PROGRESS")}
            </p>
            <h1>{t(locale, "Un instant…", "One moment…")}</h1>
            <p className="auth-intro">
              {t(
                locale,
                "Nous vérifions votre adresse e-mail.",
                "We’re verifying your email address."
              )}
            </p>
          </>
        ) : null}
        {status === "verified" ? (
          <>
            <p className="eyebrow">{t(locale, "BIENVENUE CHEZ IPLNI", "WELCOME TO IPLNI")}</p>
            <h1>{t(locale, "Adresse vérifiée", "Email verified")}</h1>
            <p className="auth-intro">
              {locale === "en" ? "Your email address is verified. You can now sign in." : message}
            </p>
            <Link className="button" href="/login">
              {t(locale, "Se connecter", "Sign in")} <span aria-hidden="true">↗</span>
            </Link>
          </>
        ) : null}
        {status !== "checking" && status !== "verified" && (
          <>
            <p className="eyebrow">{t(locale, "VOTRE COMPTE IPLNI", "YOUR IPLNI ACCOUNT")}</p>
            <h1>{t(locale, "Vérifiez votre e-mail", "Verify your email")}</h1>
            <p
              className={status === "error" ? "verify-feedback verify-error" : "verify-feedback"}
              role="status"
            >
              {locale === "en"
                ? "A confirmation link has been sent. Open it to activate your account. The link expires after 24 hours."
                : message ||
                  "Un lien de confirmation vous a été envoyé. Ouvrez-le pour activer votre compte. Le lien expire après 24 heures."}
            </p>
            <form className="auth-form" onSubmit={(event) => void resend(event)}>
              <label>
                {t(locale, "Adresse e-mail", "Email address")}
                <input
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <button className="button auth-submit" type="submit" disabled={sending}>
                {sending
                  ? t(locale, "Envoi…", "Sending…")
                  : t(locale, "Renvoyer le lien", "Resend link")}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </form>
            <p className="auth-switch">
              <Link href="/login">{t(locale, "Retour à la connexion", "Back to sign in")}</Link>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
