"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { t, useLanguage } from "../components/language-provider";

type Course = {
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
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

function formatPrice(amount: number, currency: string, locale: "fr" | "en"): string {
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB").format(amount)} ${currency === "XOF" ? "FCFA" : currency}`;
}

export default function CoursesPage() {
  const { locale } = useLanguage();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`${apiBaseUrl}/api/v1/courses`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Le catalogue est momentanément indisponible.");
        return (await response.json()) as { courses: Course[] };
      })
      .then((data) => {
        if (active) setCourses(data.courses);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Le catalogue n’a pas pu être chargé.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <Link className="brand" href="/">
          <Image src="/iplni-logo.png" alt="" width={46} height={46} priority />
          <span className="brand-copy">
            <strong>IPLNI</strong>
            <small>{t(locale, "APPRENDRE · PROGRESSER", "LEARN · GROW")}</small>
          </span>
        </Link>
        <nav>
          <Link href="/">{t(locale, "Accueil", "Home")}</Link>
          <Link href="/dashboard">{t(locale, "Espace apprenant", "Learner space")}</Link>
          <Link className="button button-small" href="/login">
            {t(locale, "Se connecter", "Sign in")} <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </header>

      <section className="catalog-hero">
        <p className="eyebrow">{t(locale, "LE CATALOGUE IPLNI", "THE IPLNI CATALOGUE")}</p>
        <h1>
          {locale === "fr" ? (
            <>
              Choisissez votre
              <br />
              <em>prochaine étape.</em>
            </>
          ) : (
            <>
              Choose your
              <br />
              <em>next step.</em>
            </>
          )}
        </h1>
        <p>
          {t(
            locale,
            "Des formations conçues pour vos ambitions. Apprenez à votre rythme, accompagné par des formateurs engagés.",
            "Courses designed around your ambitions. Learn at your own pace with the support of dedicated trainers."
          )}
        </p>
        <span className="catalog-hero-mark" aria-hidden="true">
          ✳
        </span>
      </section>

      <section className="catalog-body">
        <div className="catalog-heading">
          <div>
            <p className="learner-overline">
              {t(locale, "APPRENDRE, PROGRESSER, RÉUSSIR", "LEARN, GROW, SUCCEED")}
            </p>
            <h2>{t(locale, "Les formations disponibles", "Available courses")}</h2>
          </div>
          <span>
            {courses.length}{" "}
            {t(
              locale,
              courses.length === 1 ? "formation" : "formations",
              courses.length === 1 ? "course" : "courses"
            )}
          </span>
        </div>
        {loading && (
          <div className="catalog-state">
            {t(locale, "Chargement des formations…", "Loading courses…")}
          </div>
        )}
        {error && (
          <div className="catalog-state catalog-error" role="alert">
            {locale === "en"
              ? "The catalogue is temporarily unavailable. Check that the API and PostgreSQL are running."
              : `${error} Vérifiez que l’API et PostgreSQL sont disponibles.`}
          </div>
        )}
        {!loading && !error && courses.length === 0 && (
          <div className="catalog-state">
            {t(
              locale,
              "Aucune formation n’est publiée pour le moment. Revenez bientôt découvrir les prochains parcours IPLNI.",
              "No courses are published yet. Check back soon to discover upcoming IPLNI learning paths."
            )}
          </div>
        )}
        {!loading && !error && courses.length > 0 && (
          <div className="catalog-grid">
            {courses.map((course, index) => (
              <article className="catalog-card" key={course.id}>
                <div className={`catalog-card-art catalog-art-${index % 3}`}>
                  <span>{course.languageCode.toLocaleUpperCase("fr-FR")}</span>
                  <b aria-hidden="true">{course.title.slice(0, 1)}</b>
                  <small>IPLNI · {t(locale, "FORMATION", "COURSE")}</small>
                </div>
                <div className="catalog-card-content">
                  <div className="catalog-tags">
                    <span>{course.level ?? t(locale, "Tous niveaux", "All levels")}</span>
                    <span>
                      {course.accessDurationDays} {t(locale, "jours d’accès", "days of access")}
                    </span>
                  </div>
                  <h3>{course.title}</h3>
                  <p>{course.description}</p>
                  <div className="catalog-card-meta">
                    <span>
                      {course.moduleCount} {t(locale, "modules", "modules")} · {course.lessonCount}{" "}
                      {t(locale, "leçons", "lessons")}
                    </span>
                    <span>{course.trainerNames[0] ?? t(locale, "Équipe IPLNI", "IPLNI Team")}</span>
                  </div>
                  <div className="catalog-card-footer">
                    <strong>{formatPrice(course.priceAmount, course.currency, locale)}</strong>
                    <Link href={`/courses/${encodeURIComponent(course.slug)}`}>
                      {t(locale, "Découvrir", "Discover")} <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="catalog-payment-note">
          {t(
            locale,
            "Le paiement est déclaré par l’apprenant puis vérifié manuellement par un administrateur. L’accès est activé après confirmation.",
            "Learners submit payment details for manual review by an administrator. Course access is activated once payment is confirmed."
          )}
        </p>
      </section>
      <footer className="catalog-footer">
        <Link href="/">IPLNI</Link>
        <span>{t(locale, "Le savoir ouvre des portes.", "Knowledge opens doors.")}</span>
        <Link href="/register">{t(locale, "Créer un compte", "Create account")}</Link>
      </footer>
    </main>
  );
}
