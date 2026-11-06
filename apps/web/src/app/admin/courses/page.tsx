"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { t, useLanguage } from "../../components/language-provider";

type CourseSubmission = {
  id: string;
  title: string;
  slug: string;
  description: string;
  status: "DRAFT" | "SUBMITTED" | "PUBLISHED" | "ARCHIVED";
  languageCode: string;
  level: string | null;
  priceAmount: number;
  currency: string;
  accessDurationDays: number;
  updatedAt: string;
  creator: { fullName: string; email: string };
  trainers: Array<{ trainer: { fullName: string } }>;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      type: string;
      contentPreview: string | null;
      hasPrivateAsset: boolean;
      assetMimeType: string | null;
    }>;
  }>;
};
type ApiError = { error?: { message?: string } };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

function formatAmount(amount: number, currency: string, locale: "fr" | "en"): string {
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB").format(amount)} ${currency === "XOF" ? "FCFA" : currency}`;
}

export default function AdminCoursesPage() {
  const { locale } = useLanguage();
  const [courses, setCourses] = useState<CourseSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/courses`, {
        credentials: "include"
      });
      const body = (await response.json()) as { courses?: CourseSubmission[] } & ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "Impossible de charger les formations.");
      setCourses(body.courses ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le service ne répond pas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  async function review(courseId: string, decision: "approve" | "reject", note?: string) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/admin/courses/${encodeURIComponent(courseId)}/review`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, ...(note ? { note } : {}) })
        }
      );
      const body = (await response.json()) as ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "La décision de modération a échoué.");
      setMessage(
        decision === "approve"
          ? "Formation publiée au catalogue."
          : "Formation renvoyée au formateur avec son motif."
      );
      await loadCourses();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le service ne répond pas.");
    }
  }

  async function deleteCourse(courseId: string) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/admin/courses/${encodeURIComponent(courseId)}`,
        { method: "DELETE", credentials: "include" }
      );
      const body = (await response.json()) as ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "La suppression de la formation a échoué.");
      setMessage("Formation supprimée.");
      await loadCourses();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le service ne répond pas.");
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
        <nav>
          <Link href="/admin">{t(locale, "Vue d’ensemble", "Overview")}</Link>
          <Link href="/admin/payments">{t(locale, "Paiements", "Payments")}</Link>
          <Link href="/admin/payment-methods">
            {t(locale, "Moyens de paiement", "Payment methods")}
          </Link>
          <Link href="/admin/trainers">{t(locale, "Formateurs", "Trainers")}</Link>
          <Link href="/trainer">{t(locale, "Espace formateur", "Trainer space")}</Link>
          <Link href="/dashboard?view=learner">
            {t(locale, "Espace apprenant", "Learner space")}
          </Link>
        </nav>
      </header>
      <section className="admin-payments-shell">
        <p className="eyebrow">{t(locale, "GESTION PÉDAGOGIQUE", "COURSE MANAGEMENT")}</p>
        <h1>{t(locale, "Gestion des formations", "Manage courses")}</h1>
        <p className="admin-payments-intro">
          {t(
            locale,
            "Consultez toutes les formations, modérez les soumissions et supprimez celles qui n’ont pas d’historique d’achat ou d’inscription.",
            "Review all courses, moderate submissions, and delete courses with no purchase or enrolment history."
          )}
        </p>
        <div className="admin-payments-toolbar">
          <span>
            {courses.length}{" "}
            {t(
              locale,
              courses.length === 1 ? "formation" : "formations",
              courses.length === 1 ? "course" : "courses"
            )}
          </span>
          <button
            className="button button-small"
            type="button"
            onClick={() => void loadCourses()}
            disabled={loading}
          >
            {t(locale, "Actualiser", "Refresh")}
          </button>
        </div>
        {error && (
          <p className="admin-payments-error" role="alert">
            {locale === "en" ? "Unable to load courses. Please try again." : error}{" "}
            {error.includes("Connexion") && (
              <Link href="/login?next=%2Fadmin%2Fcourses">
                {t(locale, "Se connecter", "Sign in")}
              </Link>
            )}
          </p>
        )}
        {message && (
          <p className="admin-payments-success" role="status">
            {locale === "en" ? "Course change saved." : message}
          </p>
        )}
        {loading && (
          <p className="catalog-state">
            {t(locale, "Chargement depuis PostgreSQL…", "Loading from PostgreSQL…")}
          </p>
        )}
        {!loading && !courses.length && !error && (
          <div className="admin-payments-empty">
            <h2>{t(locale, "Aucune formation", "No courses")}</h2>
            <p>
              {t(
                locale,
                "Les formations créées par les formateurs apparaîtront ici.",
                "Courses created by trainers will appear here."
              )}
            </p>
          </div>
        )}
        <div className="admin-payment-list">
          {courses.map((course) => (
            <CourseReviewCard
              key={course.id}
              course={course}
              onReview={review}
              onDelete={deleteCourse}
              locale={locale}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function CourseReviewCard({
  course,
  onReview,
  onDelete,
  locale
}: {
  course: CourseSubmission;
  onReview: (courseId: string, decision: "approve" | "reject", note?: string) => Promise<void>;
  onDelete: (courseId: string) => Promise<void>;
  locale: "fr" | "en";
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function submit(decision: "approve" | "reject") {
    if (course.status !== "SUBMITTED") return;
    if (decision === "reject" && note.trim().length < 3) return;
    if (
      decision === "approve" &&
      !window.confirm(
        locale === "fr"
          ? `Publier « ${course.title} » dans le catalogue IPLNI ?`
          : `Publish "${course.title}" to the IPLNI catalogue?`
      )
    )
      return;
    setSubmitting(true);
    try {
      await onReview(course.id, decision, note.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  }

  async function remove() {
    if (
      !window.confirm(
        locale === "fr"
          ? `Supprimer définitivement « ${course.title} » ?`
          : `Permanently delete "${course.title}"?`
      )
    )
      return;
    setDeleting(true);
    try {
      await onDelete(course.id);
    } finally {
      setDeleting(false);
    }
  }

  const lessonCount = course.modules.reduce((count, module) => count + module.lessons.length, 0);
  return (
    <article className="admin-payment-card">
      <div className="admin-payment-heading">
        <div>
          <span className="learner-overline">
            /{course.slug} ·{" "}
            {course.status === "DRAFT"
              ? t(locale, "Brouillon", "Draft")
              : course.status === "SUBMITTED"
                ? t(locale, "À valider", "Pending review")
                : course.status === "PUBLISHED"
                  ? t(locale, "Publiée", "Published")
                  : t(locale, "Archivée", "Archived")}
          </span>
          <h2>{course.title}</h2>
        </div>
        <strong>{formatAmount(course.priceAmount, course.currency, locale)}</strong>
      </div>
      <p className="admin-course-description">{course.description}</p>
      <dl className="admin-payment-details">
        <div>
          <dt>{t(locale, "Créateur", "Creator")}</dt>
          <dd>
            {course.creator.fullName} · {course.creator.email}
          </dd>
        </div>
        <div>
          <dt>{t(locale, "Formateur(s)", "Trainer(s)")}</dt>
          <dd>{course.trainers.map(({ trainer }) => trainer.fullName).join(", ")}</dd>
        </div>
        <div>
          <dt>{t(locale, "Parcours", "Learning path")}</dt>
          <dd>
            {course.modules.length} {t(locale, "module(s)", "module(s)")}, {lessonCount}{" "}
            {t(locale, "leçon(s)", "lesson(s)")}
          </dd>
        </div>
        <div>
          <dt>{t(locale, "Durée d’accès", "Access period")}</dt>
          <dd>
            {course.accessDurationDays} {t(locale, "jours", "days")}
          </dd>
        </div>
        <div>
          <dt>{t(locale, "Langue / niveau", "Language / level")}</dt>
          <dd>
            {course.languageCode}
            {course.level ? ` · ${course.level}` : ""}
          </dd>
        </div>
      </dl>
      {course.modules.map((module) => (
        <section className="admin-course-module" key={module.id}>
          <h3>{module.title}</h3>
          <ul>
            {module.lessons.map((lesson) => (
              <li key={lesson.id}>
                <strong>{lesson.title}</strong> <span>({lesson.type})</span>
                {lesson.contentPreview && (
                  <p className="admin-course-lesson-preview">
                    {lesson.contentPreview}
                    {lesson.contentPreview.length >= 600 ? "…" : ""}
                  </p>
                )}
                {lesson.type !== "TEXT" && (
                  <small
                    className={
                      lesson.hasPrivateAsset
                        ? "admin-course-asset-ready"
                        : "admin-course-asset-missing"
                    }
                  >
                    {lesson.hasPrivateAsset
                      ? t(
                          locale,
                          `Ressource privée liée (${lesson.assetMimeType ?? "type inconnu"})`,
                          `Private resource attached (${lesson.assetMimeType ?? "unknown type"})`
                        )
                      : t(locale, "Aucune ressource privée liée", "No private resource attached")}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="admin-payment-actions">
        {course.status === "SUBMITTED" && (
          <>
            <label className="admin-payment-note">
              {t(
                locale,
                "Motif à transmettre au formateur en cas de retour",
                "Feedback for the trainer"
              )}
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={1000}
                placeholder={t(
                  locale,
                  "Précisez les corrections attendues (3 caractères minimum).",
                  "Describe the required changes (at least 3 characters)."
                )}
              />
            </label>
            <button
              className="admin-reject-button"
              type="button"
              disabled={submitting || deleting || note.trim().length < 3}
              onClick={() => void submit("reject")}
            >
              {t(locale, "Renvoyer au formateur", "Return to trainer")}
            </button>
          </>
        )}
        {course.status === "SUBMITTED" ? (
          <button
            className="button"
            type="button"
            disabled={submitting || deleting}
            onClick={() => void submit("approve")}
          >
            {submitting
              ? t(locale, "Traitement…", "Processing…")
              : t(locale, "Approuver et publier", "Approve and publish")}
          </button>
        ) : (
          <p className="admin-course-approval-status" role="status">
            {course.status === "DRAFT"
              ? t(
                  locale,
                  "En attente de soumission par le formateur",
                  "Awaiting submission by the trainer"
                )
              : course.status === "PUBLISHED"
                ? t(locale, "Formation déjà publiée", "Course already published")
                : t(locale, "Formation archivée", "Course archived")}
          </p>
        )}
        <button
          className="admin-reject-button"
          type="button"
          disabled={submitting || deleting}
          onClick={() => void remove()}
        >
          {deleting
            ? t(locale, "Suppression…", "Deleting…")
            : t(locale, "Supprimer la formation", "Delete course")}
        </button>
      </div>
    </article>
  );
}
