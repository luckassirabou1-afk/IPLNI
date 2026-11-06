"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { t, useLanguage } from "../../../components/language-provider";

type LiveSession = { id: string; title: string; startsAt: string; endsAt: string };
type Lesson = {
  id: string;
  title: string;
  description: string | null;
  type: "TEXT" | "VIDEO" | "RESOURCE" | "LIVE";
  durationSeconds: number | null;
  contentText: string | null;
  mediaUrl?: string;
  fileName?: string;
  mimeType?: string;
  liveSessions?: LiveSession[];
};
type ApiError = { error?: { code?: string; message?: string } };
const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function LessonPage() {
  const { locale } = useLanguage();
  const params = useParams<{ courseId: string; lessonId: string }>();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadLesson() {
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/v1/learner/courses/${encodeURIComponent(params.courseId)}/lessons/${encodeURIComponent(params.lessonId)}`,
          { credentials: "include" }
        );
        const body = (await response.json()) as {
          lesson?: Lesson;
          liveSessions?: LiveSession[];
        } & ApiError;
        if (!response.ok)
          throw new Error(body.error?.message ?? "Cette leçon ne peut pas être chargée.");
        if (active && body.lesson) setLesson({ ...body.lesson, liveSessions: body.liveSessions });
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Le service ne répond pas.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadLesson();
    return () => {
      active = false;
    };
  }, [params.courseId, params.lessonId]);

  return (
    <main className="lesson-page">
      <header className="catalog-header">
        <Link className="brand" href="/dashboard">
          <Image src="/iplni-logo.png" alt="" width={46} height={46} priority />
          <span className="brand-copy">
            <strong>IPLNI</strong>
            <small>ESPACE APPRENANT</small>
          </span>
        </Link>
        <nav>
          <Link href="/dashboard">{t(locale, "Mon espace", "My space")}</Link>
          <Link href="/courses">{t(locale, "Catalogue", "Catalogue")}</Link>
        </nav>
      </header>
      <article className="lesson-content-shell">
        <Link className="detail-back" href="/dashboard">
          ← {t(locale, "Retour à mon espace", "Back to my space")}
        </Link>
        {loading && (
          <p className="catalog-state">
            {t(locale, "Chargement de la leçon protégée…", "Loading protected lesson…")}
          </p>
        )}
        {!loading && error && (
          <section className="lesson-message">
            <p className="eyebrow">{t(locale, "ACCÈS À LA FORMATION", "COURSE ACCESS")}</p>
            <h1>{t(locale, "Leçon indisponible", "Lesson unavailable")}</h1>
            <p role="alert">
              {locale === "en"
                ? "This lesson is unavailable. Sign in with an active course enrolment and try again."
                : error}
            </p>
            {error.includes("Connexion") && (
              <Link
                className="button"
                href={`/login?next=${encodeURIComponent(`/learn/${params.courseId}/${params.lessonId}`)}`}
              >
                {t(locale, "Se connecter", "Sign in")}
              </Link>
            )}
          </section>
        )}
        {lesson && (
          <>
            <p className="eyebrow">
              {t(locale, "LEÇON", "LESSON")} ·{" "}
              {lesson.type === "TEXT"
                ? t(locale, "LECTURE", "READING")
                : lesson.type === "RESOURCE"
                  ? lesson.mimeType?.includes("spreadsheet") ||
                    lesson.mimeType === "application/vnd.ms-excel"
                    ? t(locale, "FICHIER EXCEL", "EXCEL FILE")
                    : lesson.mimeType?.includes("word") || lesson.mimeType === "application/msword"
                      ? t(locale, "DOCUMENT WORD", "WORD DOCUMENT")
                      : lesson.mimeType?.includes("presentation") ||
                          lesson.mimeType === "application/vnd.ms-powerpoint"
                        ? t(locale, "POWERPOINT", "POWERPOINT")
                        : lesson.mimeType === "application/pdf"
                          ? t(locale, "DOCUMENT PDF", "PDF DOCUMENT")
                          : t(locale, "DOCUMENT", "DOCUMENT")
                  : lesson.type === "VIDEO"
                    ? t(locale, "VIDÉO", "VIDEO")
                    : lesson.type === "LIVE"
                      ? t(locale, "DIRECT", "LIVE SESSION")
                      : t(locale, "DOCUMENT", "DOCUMENT")}
            </p>
            <h1>{lesson.title}</h1>
            {lesson.description && <p className="lesson-description">{lesson.description}</p>}
            {lesson.type === "TEXT" && (
              <>
                <section
                  className="lesson-text-content"
                  aria-label={t(locale, "Contenu de la leçon", "Lesson content")}
                >
                  {lesson.contentText}
                </section>
                <Link className="button lesson-back-button" href="/dashboard">
                  {t(locale, "Terminer la lecture", "Finish reading")}{" "}
                  <span aria-hidden="true">↗</span>
                </Link>
              </>
            )}
            {lesson.type === "VIDEO" && lesson.mediaUrl && (
              <video className="lesson-video" controls preload="metadata" src={lesson.mediaUrl}>
                {t(
                  locale,
                  "Votre navigateur ne prend pas en charge la lecture vidéo.",
                  "Your browser does not support video playback."
                )}
              </video>
            )}
            {lesson.type === "RESOURCE" && lesson.mediaUrl && (
              <div className="lesson-resource">
                <p>{lesson.fileName}</p>
                <a
                  className="button"
                  href={lesson.mediaUrl}
                  target={lesson.mimeType === "application/pdf" ? "_blank" : undefined}
                  rel={lesson.mimeType === "application/pdf" ? "noreferrer" : undefined}
                >
                  {lesson.mimeType === "application/pdf"
                    ? t(locale, "Ouvrir le document PDF", "Open PDF document")
                    : t(locale, "Télécharger le document", "Download document")}{" "}
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            )}
            {lesson.type === "LIVE" && (
              <section className="lesson-live-sessions">
                <h2>{t(locale, "Sessions en direct de la formation", "Course live sessions")}</h2>
                {lesson.liveSessions?.length ? (
                  <ul>
                    {lesson.liveSessions.map((session) => {
                      const now = Date.now();
                      const isOpen =
                        Date.parse(session.startsAt) - now <= 15 * 60 * 1000 &&
                        Date.parse(session.endsAt) > now;
                      return (
                        <li key={session.id}>
                          <span>
                            <strong>{session.title}</strong>
                            <small>
                              {new Date(session.startsAt).toLocaleString(
                                locale === "fr" ? "fr-FR" : "en-GB",
                                { timeZone: "Africa/Ouagadougou" }
                              )}
                            </small>
                          </span>
                          {isOpen ? (
                            <Link className="button" href={`/live/${session.id}`}>
                              {t(locale, "Rejoindre", "Join")} <span aria-hidden="true">↗</span>
                            </Link>
                          ) : (
                            <small>
                              {t(
                                locale,
                                "Ouverture 15 min avant le début",
                                "Opens 15 minutes before it starts"
                              )}
                            </small>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>
                    {t(
                      locale,
                      "Aucun direct n’est programmé pour le moment. Consultez votre espace apprenant après la publication du calendrier.",
                      "No live sessions are scheduled yet. Check your learner dashboard for updates."
                    )}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </article>
    </main>
  );
}
