"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { t, useLanguage } from "../../components/language-provider";

type Trainer = {
  id: string;
  fullName: string;
  email: string;
  assignedAt: string;
};
type ApiError = { error?: { message?: string } };
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function AdminTrainersPage() {
  const { locale } = useLanguage();
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadTrainers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/trainers`, {
        credentials: "include"
      });
      const body = (await response.json()) as { trainers?: Trainer[] } & ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "Impossible de charger les formateurs.");
      setTrainers(body.trainers ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le service ne répond pas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTrainers();
  }, [loadTrainers]);

  async function addTrainer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = new FormData(form).get("email");
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/trainers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const body = (await response.json()) as { trainer?: Trainer } & ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "Impossible d’ajouter ce formateur.");
      form.reset();
      setMessage(
        t(
          locale,
          `${body.trainer?.fullName ?? "Le compte"} a maintenant accès à l’espace formateur.`,
          `${body.trainer?.fullName ?? "The account"} now has access to the trainer dashboard.`
        )
      );
      await loadTrainers();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t(locale, "Le service ne répond pas.", "Service unavailable.")
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="admin-payments-page">
      <header className="catalog-header">
        <Link className="brand" href="/">
          <Image src="/iplni-logo.png" alt="" width={46} height={46} priority />
          <span className="brand-copy">
            <strong>IPLNI</strong>
            <small>{t(locale, "ESPACE ADMINISTRATEUR", "ADMIN SPACE")}</small>
          </span>
        </Link>
        <nav aria-label={t(locale, "Navigation administrateur", "Administrator navigation")}>
          <Link href="/admin">{t(locale, "Vue d’ensemble", "Overview")}</Link>
          <Link href="/admin/payments">{t(locale, "Paiements", "Payments")}</Link>
          <Link href="/admin/courses">{t(locale, "Formations", "Courses")}</Link>
          <Link href="/admin/trainers" aria-current="page">
            {t(locale, "Formateurs", "Trainers")}
          </Link>
          <Link href="/admin/payment-methods">
            {t(locale, "Moyens de paiement", "Payment methods")}
          </Link>
        </nav>
      </header>

      <section className="admin-payments-shell">
        <p className="eyebrow">{t(locale, "ÉQUIPE PÉDAGOGIQUE", "TEACHING TEAM")}</p>
        <h1>{t(locale, "Gérer les formateurs", "Manage trainers")}</h1>
        <p className="admin-payments-intro">
          {t(
            locale,
            "Ajoutez un compte actif comme formateur pour lui permettre de créer ses formations, préparer ses modules et importer ses ressources.",
            "Grant an active account trainer access so they can create courses, prepare modules and upload learning resources."
          )}
        </p>

        {error && (
          <p className="admin-payments-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="admin-payments-success" role="status">
            {message}
          </p>
        )}

        <section className="admin-method-form-section trainer-admin-add">
          <h2>{t(locale, "Ajouter un formateur", "Add a trainer")}</h2>
          <p>
            {t(
              locale,
              "Saisissez l’adresse e-mail du compte déjà inscrit et vérifié. Aucun compte n’est créé sans son titulaire.",
              "Enter the email of an existing verified account. No account is created without its owner."
            )}
          </p>
          <form className="admin-method-form" onSubmit={addTrainer}>
            <label>
              {t(locale, "E-mail du compte", "Account email")}
              <input name="email" type="email" autoComplete="email" maxLength={254} required />
            </label>
            <div className="admin-payment-actions">
              <button className="button" type="submit" disabled={saving}>
                {saving
                  ? t(locale, "Ajout en cours…", "Adding…")
                  : t(locale, "Donner l’accès formateur", "Grant trainer access")}
              </button>
            </div>
          </form>
        </section>

        <div className="admin-payments-toolbar trainer-admin-toolbar">
          <h2>{t(locale, "Formateurs actifs", "Active trainers")}</h2>
          <button
            className="button button-small"
            type="button"
            onClick={() => void loadTrainers()}
            disabled={loading}
          >
            {t(locale, "Actualiser", "Refresh")}
          </button>
        </div>
        {loading && <p className="catalog-state">{t(locale, "Chargement…", "Loading…")}</p>}
        {!loading && trainers.length === 0 && !error && (
          <div className="admin-payments-empty">
            <h2>{t(locale, "Aucun formateur pour le moment", "No trainers yet")}</h2>
            <p>
              {t(
                locale,
                "Les comptes ajoutés apparaîtront ici.",
                "Added trainer accounts will appear here."
              )}
            </p>
          </div>
        )}
        <ul className="trainer-admin-list">
          {trainers.map((trainer) => (
            <li key={trainer.id}>
              <span>
                <strong>{trainer.fullName}</strong>
                <small>{trainer.email}</small>
              </span>
              <time dateTime={trainer.assignedAt}>
                {new Date(trainer.assignedAt).toLocaleDateString(
                  locale === "fr" ? "fr-FR" : "en-GB"
                )}
              </time>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
