"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { t, useLanguage } from "../../components/language-provider";

type CourseDetails = {
  id: string;
  title: string;
  slug: string;
  description: string;
  languageCode: string;
  level: string | null;
  priceAmount: number;
  currency: string;
  accessDurationDays: number;
  moduleCount: number;
  lessonCount: number;
  trainerNames: string[];
  modules: Array<{
    id: string;
    title: string;
    description: string | null;
    lessons: Array<{ id: string; title: string; type: string; durationSeconds: number | null }>;
  }>;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

function price(amount: number, currency: string, locale: "fr" | "en"): string {
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB").format(amount)} ${currency === "XOF" ? "FCFA" : currency}`;
}

export default function CourseDetailsPage() {
  const { locale } = useLanguage();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [course, setCourse] = useState<CourseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ordering, setOrdering] = useState(false);
  const [orderError, setOrderError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${apiBaseUrl}/api/v1/courses/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const body = (await response.json()) as {
          course?: CourseDetails;
          error?: { message?: string };
        };
        if (!response.ok || !body.course)
          throw new Error(body.error?.message ?? "Cette formation n’est pas disponible.");
        return body.course;
      })
      .then((data) => {
        if (active) setCourse(data);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Impossible de charger la formation.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  async function startOrder() {
    setOrdering(true);
    setOrderError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseSlug: slug })
      });
      const body = (await response.json()) as {
        order?: { reference: string };
        error?: { code?: string; message?: string };
      };
      if (response.status === 401) {
        setOrderError("Connectez-vous à votre compte apprenant pour créer une commande.");
        return;
      }
      if (!response.ok || !body.order) {
        setOrderError(body.error?.message ?? "La commande n’a pas pu être créée.");
        return;
      }
      window.location.assign(`/checkout/${encodeURIComponent(body.order.reference)}`);
    } catch {
      setOrderError("Impossible de joindre l’API. Réessayez lorsque le service sera disponible.");
    } finally {
      setOrdering(false);
    }
  }

  return (
    <main className="course-detail-page">
      <header className="catalog-header">
        <Link className="brand" href="/">
          <Image src="/iplni-logo.png" alt="" width={46} height={46} priority />
          <span className="brand-copy">
            <strong>IPLNI</strong>
            <small>{t(locale, "APPRENDRE · PROGRESSER", "LEARN · GROW")}</small>
          </span>
        </Link>
        <nav>
          <Link href="/courses">{t(locale, "Catalogue", "Catalogue")}</Link>
          <Link href="/dashboard">{t(locale, "Espace apprenant", "Learner space")}</Link>
        </nav>
      </header>
      {loading && (
        <div className="catalog-state">
          {t(locale, "Chargement de la formation…", "Loading course…")}
        </div>
      )}
      {error && (
        <section className="catalog-state catalog-error" role="alert">
          {locale === "en" ? "This course is unavailable." : error}
          <p>
            <Link href="/courses">{t(locale, "Retour au catalogue", "Back to catalogue")}</Link>
          </p>
        </section>
      )}
      {course && (
        <>
          <section className="course-detail-hero">
            <div>
              <Link className="detail-back" href="/courses">
                ← {t(locale, "Toutes les formations", "All courses")}
              </Link>
              <p className="eyebrow">
                {t(locale, "FORMATION IPLNI", "IPLNI COURSE")} ·{" "}
                {course.languageCode.toLocaleUpperCase(locale === "fr" ? "fr-FR" : "en-US")}
              </p>
              <h1>{course.title}</h1>
              <p className="course-detail-description">{course.description}</p>
              <div className="course-detail-tags">
                <span>{course.level ?? t(locale, "Tous niveaux", "All levels")}</span>
                <span>
                  {course.accessDurationDays} {t(locale, "jours d’accès", "days of access")}
                </span>
                <span>
                  {course.moduleCount} {t(locale, "modules", "modules")}
                </span>
              </div>
              <p className="course-instructors">
                {t(locale, "Avec", "With")}{" "}
                {course.trainerNames.join(", ") ||
                  t(locale, "l’équipe pédagogique IPLNI", "the IPLNI teaching team")}
              </p>
            </div>
            <aside className="course-purchase-card">
              <span className="learner-overline">
                {t(locale, "INVESTISSEZ DANS VOTRE AVENIR", "INVEST IN YOUR FUTURE")}
              </span>
              <strong>{price(course.priceAmount, course.currency, locale)}</strong>
              <p>
                {course.lessonCount} {t(locale, "leçons · accès pendant", "lessons · access for")}{" "}
                {course.accessDurationDays}{" "}
                {t(locale, "jours après validation", "days after approval")}
              </p>
              <button
                className="button"
                type="button"
                disabled={ordering}
                onClick={() => void startOrder()}
              >
                {ordering
                  ? t(locale, "Création en cours…", "Creating…")
                  : t(locale, "M’inscrire à la formation", "Enrol in this course")}{" "}
                <span aria-hidden="true">↗</span>
              </button>
              {orderError && (
                <p className="checkout-error" role="alert">
                  {locale === "en"
                    ? "Sign in to your learner account to place an order."
                    : orderError}
                  {orderError.includes("Connectez-vous") && (
                    <>
                      {" "}
                      <Link href={`/login?next=${encodeURIComponent(`/courses/${slug}`)}`}>
                        {t(locale, "Se connecter", "Sign in")}
                      </Link>{" "}
                      ·{" "}
                      <Link href={`/register?next=${encodeURIComponent(`/courses/${slug}`)}`}>
                        {t(locale, "Créer un compte", "Create account")}
                      </Link>
                    </>
                  )}
                </p>
              )}
              <small>
                {t(
                  locale,
                  "Paiement en FCFA, vérifié manuellement par IPLNI.",
                  "Payment in XOF, manually verified by IPLNI."
                )}
              </small>
            </aside>
          </section>
          <section className="course-detail-content">
            <div>
              <p className="learner-overline">
                {t(locale, "VOTRE PARCOURS", "YOUR LEARNING PATH")}
              </p>
              <h2>{t(locale, "Au programme", "Course outline")}</h2>
              {course.modules.length === 0 ? (
                <p>
                  {t(
                    locale,
                    "Le programme détaillé sera bientôt publié.",
                    "The detailed course outline will be published soon."
                  )}
                </p>
              ) : (
                <div className="module-list">
                  {course.modules.map((module, index) => (
                    <article key={module.id}>
                      <span className="module-index">{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <h3>{module.title}</h3>
                        {module.description && <p>{module.description}</p>}
                        <small>
                          {module.lessons.length}{" "}
                          {t(
                            locale,
                            module.lessons.length === 1 ? "leçon" : "leçons",
                            module.lessons.length === 1 ? "lesson" : "lessons"
                          )}
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <aside>
              <h3>{t(locale, "Comment ça marche ?", "How does it work?")}</h3>
              <ol>
                <li>{t(locale, "Créez votre commande.", "Create your order.")}</li>
                <li>
                  {t(
                    locale,
                    "Effectuez le paiement avec le moyen configuré par IPLNI.",
                    "Pay using a method configured by IPLNI."
                  )}
                </li>
                <li>
                  {t(
                    locale,
                    "Déclarez la référence de transaction.",
                    "Submit your transaction reference."
                  )}
                </li>
                <li>
                  {t(
                    locale,
                    "Votre accès sera activé après vérification manuelle.",
                    "Your access will be activated after manual verification."
                  )}
                </li>
              </ol>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}
