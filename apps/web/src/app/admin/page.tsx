"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { t, useLanguage } from "../components/language-provider";

type DashboardStats = {
  activeLearners: number;
  draftCourses: number;
  submittedCourses: number;
  publishedCourses: number;
  pendingPayments: number;
  pendingOrders: number;
  activeEnrollments: number;
};
type ApiError = { error?: { message?: string } };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function AdminDashboardPage() {
  const { locale } = useLanguage();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/dashboard`, {
        credentials: "include"
      });
      const body = (await response.json()) as { stats?: DashboardStats } & ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "Impossible de charger le tableau de bord.");
      if (!body.stats) throw new Error("Les indicateurs du tableau de bord sont indisponibles.");
      setStats(body.stats);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le service ne répond pas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const metrics = stats
    ? [
        {
          label: t(locale, "Apprenants actifs", "Active learners"),
          value: stats.activeLearners,
          hint: t(locale, "comptes vérifiés et actifs", "verified, active accounts"),
          tone: "blue"
        },
        {
          label: t(locale, "Inscriptions actives", "Active enrollments"),
          value: stats.activeEnrollments,
          hint: t(locale, "accès actuellement valides", "currently valid course access"),
          tone: "green"
        },
        {
          label: t(locale, "Formations publiées", "Published courses"),
          value: stats.publishedCourses,
          hint: t(locale, "visibles au catalogue", "visible in the catalogue"),
          tone: "gold"
        },
        {
          label: t(locale, "Commandes en attente", "Pending orders"),
          value: stats.pendingOrders,
          hint: t(locale, "non expirées", "not expired"),
          tone: "slate"
        }
      ]
    : [];

  return (
    <main className="admin-payments-page admin-dashboard-page">
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
          <Link href="/admin/trainers">{t(locale, "Formateurs", "Trainers")}</Link>
          <Link href="/admin/payment-methods">
            {t(locale, "Moyens de paiement", "Payment methods")}
          </Link>
          <Link href="/trainer">{t(locale, "Espace formateur", "Trainer space")}</Link>
          <Link href="/dashboard?view=learner">
            {t(locale, "Espace apprenant", "Learner space")}
          </Link>
        </nav>
      </header>

      <section className="admin-payments-shell admin-dashboard-shell">
        <div className="admin-dashboard-heading">
          <div>
            <p className="eyebrow">{t(locale, "PILOTAGE DE LA PLATEFORME", "PLATFORM OVERVIEW")}</p>
            <h1>{t(locale, "Tableau de bord", "Admin dashboard")}</h1>
            <p className="admin-payments-intro">
              {t(
                locale,
                "Suivez l’activité d’IPLNI et traitez les opérations prioritaires depuis un seul espace.",
                "Monitor IPLNI activity and handle priority operations from one place."
              )}
            </p>
          </div>
          <button
            className="button button-small"
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
          >
            {loading
              ? t(locale, "Actualisation…", "Refreshing…")
              : t(locale, "Actualiser", "Refresh")}
          </button>
        </div>

        {error && (
          <div className="admin-dashboard-alert" role="alert">
            <p>{error}</p>
            {error.includes("Connexion") && (
              <Link href="/login?next=%2Fadmin">{t(locale, "Se connecter", "Sign in")}</Link>
            )}
            <button type="button" onClick={() => void loadDashboard()}>
              {t(locale, "Réessayer", "Try again")}
            </button>
          </div>
        )}

        {loading && (
          <p className="catalog-state">
            {t(
              locale,
              "Chargement des indicateurs depuis PostgreSQL…",
              "Loading platform metrics from PostgreSQL…"
            )}
          </p>
        )}
        {!loading && !error && stats && (
          <>
            <div
              className="admin-dashboard-metrics"
              aria-label={t(locale, "Indicateurs de la plateforme", "Platform metrics")}
            >
              {metrics.map((metric) => (
                <article
                  className={`admin-dashboard-metric admin-dashboard-metric-${metric.tone}`}
                  key={metric.label}
                >
                  <span>{metric.label}</span>
                  <strong>
                    {metric.value.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")}
                  </strong>
                  <small>{metric.hint}</small>
                </article>
              ))}
            </div>

            <div className="admin-dashboard-sections">
              <section className="admin-dashboard-panel">
                <div className="admin-dashboard-section-heading">
                  <div>
                    <span className="learner-overline">
                      {t(locale, "À TRAITER", "NEEDS ATTENTION")}
                    </span>
                    <h2>{t(locale, "Opérations en attente", "Pending operations")}</h2>
                  </div>
                </div>
                <Link className="admin-dashboard-action" href="/admin/payments">
                  <span className="admin-dashboard-action-icon">01</span>
                  <span>
                    <strong>{t(locale, "Vérifier les paiements", "Review payments")}</strong>
                    <small>
                      {t(
                        locale,
                        "Déclarations à rapprocher manuellement",
                        "Payment submissions awaiting manual review"
                      )}
                    </small>
                  </span>
                  <b>{stats.pendingPayments}</b>
                  <span className="admin-dashboard-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
                <Link className="admin-dashboard-action" href="/admin/courses">
                  <span className="admin-dashboard-action-icon">02</span>
                  <span>
                    <strong>{t(locale, "Modérer les formations", "Review courses")}</strong>
                    <small>
                      {t(
                        locale,
                        "Soumissions des formateurs à examiner",
                        "Trainer submissions awaiting review"
                      )}
                    </small>
                  </span>
                  <b>{stats.submittedCourses}</b>
                  <span className="admin-dashboard-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </section>

              <section className="admin-dashboard-panel">
                <div className="admin-dashboard-section-heading">
                  <div>
                    <span className="learner-overline">
                      {t(locale, "ACCÈS RAPIDE", "QUICK ACCESS")}
                    </span>
                    <h2>{t(locale, "Gestion", "Management")}</h2>
                  </div>
                </div>
                <Link className="admin-dashboard-action" href="/admin/payment-methods">
                  <span className="admin-dashboard-action-icon">03</span>
                  <span>
                    <strong>{t(locale, "Moyens de paiement", "Payment methods")}</strong>
                    <small>
                      {t(
                        locale,
                        "Gérer les coordonnées visibles au paiement",
                        "Manage payment details shown at checkout"
                      )}
                    </small>
                  </span>
                  <span className="admin-dashboard-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
                <Link className="admin-dashboard-action" href="/admin/courses">
                  <span className="admin-dashboard-action-icon">04</span>
                  <span>
                    <strong>{t(locale, "Suivi des formations", "Course overview")}</strong>
                    <small>
                      {t(
                        locale,
                        "{count} brouillons à compléter",
                        "{count} drafts to complete"
                      ).replace("{count}", String(stats.draftCourses))}
                    </small>
                  </span>
                  <span className="admin-dashboard-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
                <Link className="admin-dashboard-action" href="/admin/trainers">
                  <span className="admin-dashboard-action-icon">05</span>
                  <span>
                    <strong>{t(locale, "Intégrer des formateurs", "Add trainers")}</strong>
                    <small>
                      {t(
                        locale,
                        "Donner accès au tableau de bord formateur",
                        "Grant access to the trainer dashboard"
                      )}
                    </small>
                  </span>
                  <span className="admin-dashboard-arrow" aria-hidden="true">
                    →
                  </span>
                </Link>
              </section>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
