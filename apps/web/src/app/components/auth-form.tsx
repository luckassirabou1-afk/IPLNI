"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { t, useLanguage } from "./language-provider";
import { safeReturnPath } from "./safe-return-path";

type AuthFormProps = {
  mode: "login" | "register";
};

type AuthResponse = {
  user?: { id: string };
  message?: string;
  error?: { code?: string; message?: string };
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function AuthForm({ mode }: AuthFormProps) {
  const { locale } = useLanguage();
  const router = useRouter();
  const [error, setError] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [resendRequired, setResendRequired] = useState(false);
  const [emailForVerification, setEmailForVerification] = useState("");
  const [googleError, setGoogleError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [returnTo, setReturnTo] = useState("/dashboard");
  const isRegister = mode === "register";

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setReturnTo(safeReturnPath(query.get("next"), window.location.origin));
    const googleStatus = query.get("google");
    if (googleStatus === "unavailable") {
      setGoogleError(
        t(
          locale,
          "La connexion Google n’est pas encore configurée sur la plateforme.",
          "Google sign-in is not configured for this platform yet."
        )
      );
    } else if (googleStatus === "account") {
      setGoogleError(
        t(
          locale,
          "Ce compte est suspendu. Contactez l’assistance.",
          "This account is suspended. Contact support."
        )
      );
    } else if (googleStatus === "failed") {
      setGoogleError(
        t(
          locale,
          "La connexion Google a échoué. Réessayez.",
          "Google sign-in failed. Please try again."
        )
      );
    }
  }, [locale]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setVerificationRequired(false);
    setResendRequired(false);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      ...(isRegister ? { fullName: String(formData.get("fullName") ?? "") } : {})
    };
    setEmailForVerification(payload.email);

    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result: AuthResponse = await response.json();
      if (isRegister && response.status === 202) {
        router.push(`/verify-email?email=${encodeURIComponent(payload.email)}`);
        return;
      }
      if (!response.ok || !result.user) {
        setVerificationRequired(result.error?.code === "EMAIL_NOT_VERIFIED");
        setResendRequired(result.error?.code === "VERIFICATION_EMAIL_NOT_SENT");
        setError(
          locale === "en"
            ? "Sign-in or registration failed. Please check your details and try again."
            : (result.error?.message ?? "La connexion au service a échoué. Réessayez.")
        );
        return;
      }
      router.push(returnTo);
      router.refresh();
    } catch {
      setError(
        t(
          locale,
          "Impossible de joindre le service. Vérifiez que l’API IPLNI est démarrée.",
          "Unable to reach the service. Check that the IPLNI API is running."
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="auth-brand">
          <Image src="/iplni-logo.png" alt="" width={48} height={48} priority />
          <span>
            <strong>IPLNI</strong>
            <small>APPRENDRE · PROGRESSER</small>
          </span>
        </Link>
        <p className="eyebrow">
          {isRegister
            ? t(locale, "VOTRE PARCOURS COMMENCE ICI", "YOUR JOURNEY STARTS HERE")
            : t(locale, "HEUREUX DE VOUS RETROUVER", "WELCOME BACK")}
        </p>
        <h1>
          {isRegister
            ? t(locale, "Créer votre compte", "Create your account")
            : t(locale, "Se connecter", "Sign in")}
        </h1>
        <p className="auth-intro">
          {isRegister
            ? t(
                locale,
                "Rejoignez IPLNI et préparez votre prochaine étape.",
                "Join IPLNI and prepare for your next step."
              )
            : t(
                locale,
                "Connectez-vous pour retrouver vos formations et votre progression.",
                "Sign in to find your courses and track your progress."
              )}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isRegister && (
            <label>
              {t(locale, "Nom complet", "Full name")}
              <input
                name="fullName"
                type="text"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
              />
            </label>
          )}
          <label>
            {t(locale, "Adresse e-mail", "Email address")}
            <input name="email" type="email" autoComplete="email" maxLength={254} required />
          </label>
          <label>
            {t(locale, "Mot de passe", "Password")}
            <input
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={isRegister ? 12 : undefined}
              maxLength={128}
              required
            />
            {isRegister && (
              <small className="password-hint">
                {t(locale, "12 caractères minimum.", "At least 12 characters.")}
              </small>
            )}
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          {verificationRequired && (
            <Link
              className="auth-verification-link"
              href={`/verify-email?email=${encodeURIComponent(emailForVerification)}`}
            >
              {t(locale, "Renvoyer le lien de vérification", "Resend verification link")}
            </Link>
          )}
          {resendRequired && (
            <Link
              className="auth-verification-link"
              href={`/verify-email?email=${encodeURIComponent(emailForVerification)}`}
            >
              {t(locale, "Renvoyer le lien de vérification", "Resend verification link")}
            </Link>
          )}
          <button className="button auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? t(locale, "Veuillez patienter…", "Please wait…")
              : isRegister
                ? t(locale, "Créer mon compte", "Create account")
                : t(locale, "Se connecter", "Sign in")}
            {!isSubmitting && <span aria-hidden="true">↗</span>}
          </button>
        </form>

        <div className="auth-divider">
          <span>{t(locale, "ou continuer avec Google", "or continue with Google")}</span>
        </div>
        {googleError && (
          <p className="auth-error auth-google-error" role="alert">
            {googleError}
          </p>
        )}
        <a
          className="google-auth-button"
          href={`${apiBaseUrl}/api/v1/auth/google?page=${mode}&next=${encodeURIComponent(returnTo)}`}
        >
          <span className="google-auth-mark" aria-hidden="true">
            G
          </span>
          {t(locale, "Continuer avec Google", "Continue with Google")}
        </a>

        <p className="auth-switch">
          {isRegister
            ? t(locale, "Vous avez déjà un compte ?", "Already have an account?")
            : t(locale, "Vous n’avez pas encore de compte ?", "Don’t have an account yet?")}{" "}
          <Link
            href={`${isRegister ? "/login" : "/register"}?next=${encodeURIComponent(returnTo)}`}
          >
            {isRegister
              ? t(locale, "Se connecter", "Sign in")
              : t(locale, "Créer un compte", "Create account")}
          </Link>
        </p>
        <p className="auth-privacy">
          {t(
            locale,
            "Vos données de compte sont protégées et utilisées pour votre parcours IPLNI.",
            "Your account data is protected and used to support your IPLNI learning journey."
          )}
        </p>
      </section>
      <aside className="auth-aside">
        <div className="auth-aside-content">
          <span aria-hidden="true">✳</span>
          <blockquote>
            {t(
              locale,
              "Le savoir ouvre des portes. Chaque apprentissage vous rapproche de nouvelles possibilités.",
              "Knowledge opens doors. Every new skill brings you closer to new opportunities."
            )}
          </blockquote>
          <p>{t(locale, "VOTRE AVENIR, VOTRE RYTHME", "YOUR FUTURE, YOUR PACE")}</p>
        </div>
      </aside>
    </main>
  );
}
