"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { t, useLanguage } from "../components/language-provider";
import TrainerCourseSubmissionForm from "./course-submission-form";

type CourseStatus = "DRAFT" | "SUBMITTED" | "PUBLISHED" | "ARCHIVED";
type Lesson = {
  id: string;
  title: string;
  description: string | null;
  type: "TEXT" | "VIDEO" | "RESOURCE" | "LIVE";
  position: number;
  contentText: string | null;
  contentAssetId: string | null;
  contentAsset: { originalName: string; mimeType: string } | null;
  readyForSubmission: boolean;
  isPreview: boolean;
};
type Module = {
  id: string;
  title: string;
  description: string | null;
  position: number;
  lessons: Lesson[];
};
type TrainerLiveSession = { id: string; title: string; startsAt: string; endsAt: string };
type Course = {
  id: string;
  title: string;
  slug: string;
  status: CourseStatus;
  reviewNote: string | null;
  priceAmount: number;
  currency: string;
  updatedAt: string;
  enrollmentCount: number;
  moduleCount: number;
  lessonCount: number;
  modules: Module[];
  liveSessions: TrainerLiveSession[];
};
type ApiError = { error?: { message?: string } };
type UserProfile = { user?: { roles?: string[] } };
type UploadPolicy = {
  upload?: { storageKey: string; url: string; fields: Record<string, string> };
  error?: { message?: string };
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
const mediaSizeLimits = {
  pdf: 25 * 1024 * 1024,
  office: 50 * 1024 * 1024,
  video: 500 * 1024 * 1024
};
const officeDocumentTypes =
  ".doc,.docx,.xls,.xlsx,.ppt,.pptx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation";

function uploadToGoogleCloud(
  url: string,
  fields: Record<string, string>,
  file: File,
  onProgress: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    Object.entries(fields).forEach(([name, value]) => formData.append(name, value));
    formData.append("file", file);

    request.open("POST", url);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            "Le stockage a refusé le fichier. Vérifiez la configuration CORS du bucket puis réessayez."
          )
        );
      }
    });
    request.addEventListener("error", () =>
      reject(new Error("Le téléversement a échoué. Vérifiez votre connexion internet."))
    );
    request.addEventListener("abort", () => reject(new Error("Le téléversement a été annulé.")));
    request.send(formData);
  });
}

function isLessonType(value: string): value is Lesson["type"] {
  return value === "TEXT" || value === "VIDEO" || value === "RESOURCE" || value === "LIVE";
}
const statusLabels: Record<Course["status"], string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "En attente de validation",
  PUBLISHED: "Publiée",
  ARCHIVED: "Archivée"
};
const courseFilters: Array<{ value: "ALL" | CourseStatus; label: string }> = [
  { value: "ALL", label: "Toutes" },
  { value: "DRAFT", label: "Brouillons" },
  { value: "SUBMITTED", label: "À valider" },
  { value: "PUBLISHED", label: "Publiées" },
  { value: "ARCHIVED", label: "Archivées" }
];

export default function TrainerDashboardPage() {
  const { locale } = useLanguage();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"ALL" | CourseStatus>("ALL");
  const [search, setSearch] = useState("");
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [response, profileResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/v1/trainer/dashboard`, { credentials: "include" }),
        fetch(`${apiBaseUrl}/api/v1/auth/me`, { credentials: "include" })
      ]);
      const body = (await response.json()) as { courses?: Course[] } & ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "Impossible de charger l’espace formateur.");
      const profile = (await profileResponse.json()) as UserProfile;
      if (!profileResponse.ok)
        throw new Error("Impossible de vérifier les autorisations du compte.");
      setIsAdmin(profile.user?.roles?.includes("ADMIN") ?? false);
      setCourses(body.courses ?? []);
    } catch (cause) {
      setError(
        locale === "en"
          ? "Unable to load your courses. Please try again."
          : cause instanceof Error
            ? cause.message
            : "Le service ne répond pas."
      );
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const courseCounts = {
    total: courses.length,
    drafts: courses.filter((course) => course.status === "DRAFT").length,
    submitted: courses.filter((course) => course.status === "SUBMITTED").length,
    published: courses.filter((course) => course.status === "PUBLISHED").length
  };
  const activeLearnerCount = courses.reduce((count, course) => count + course.enrollmentCount, 0);
  const upcomingLiveSessions = courses
    .flatMap((course) =>
      course.liveSessions.map((session) => ({ ...session, courseTitle: course.title }))
    )
    .sort((first, second) => Date.parse(first.startsAt) - Date.parse(second.startsAt));
  const visibleCourses = courses.filter((course) => {
    const matchesFilter = filter === "ALL" || course.status === filter;
    const query = search.trim().toLocaleLowerCase("fr-FR");
    return (
      matchesFilter &&
      (!query || `${course.title} ${course.slug}`.toLocaleLowerCase("fr-FR").includes(query))
    );
  });

  async function createCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError("");
    setMessage("");
    const data = new FormData(formElement);
    const payload = {
      title: String(data.get("title") ?? ""),
      slug: String(data.get("slug") ?? ""),
      description: String(data.get("description") ?? ""),
      languageCode: String(data.get("languageCode") ?? "fr"),
      level: String(data.get("level") ?? "") || null,
      priceAmount: Number(data.get("priceAmount")),
      accessDurationDays: Number(data.get("accessDurationDays"))
    };
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/trainer/courses`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "La création du brouillon a échoué.");
      formElement.reset();
      setShowCourseForm(false);
      setMessage(
        t(
          locale,
          "Brouillon créé. Ajoutez un module et son contenu avant de le soumettre.",
          "Draft created. Add a module and its content before submitting it."
        )
      );
      await loadDashboard();
    } catch (cause) {
      setError(
        locale === "en"
          ? "Unable to create the course. Check the information and try again."
          : cause instanceof Error
            ? cause.message
            : "Le service ne répond pas."
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
            <small>{t(locale, "ESPACE FORMATEUR", "TRAINER SPACE")}</small>
          </span>
        </Link>
        <nav>
          <Link href="/courses">{t(locale, "Catalogue", "Catalogue")}</Link>
          {isAdmin && (
            <Link href="/admin">{t(locale, "Espace administrateur", "Admin space")}</Link>
          )}
        </nav>
      </header>
      <section className="admin-payments-shell trainer-dashboard">
        <div className="trainer-welcome">
          <div>
            <p className="eyebrow">
              {t(locale, "VOTRE ESPACE PÉDAGOGIQUE", "YOUR TEACHING SPACE")}
            </p>
            <h1>
              {locale === "fr" ? (
                <>
                  Préparez vos <em>formations.</em>
                </>
              ) : (
                <>
                  Build your <em>courses.</em>
                </>
              )}
            </h1>
            <p className="admin-payments-intro">
              {t(
                locale,
                "Construisez votre parcours étape par étape, puis envoyez-le à l’administration. Une fois validé, il sera proposé aux apprenants.",
                "Build your course step by step, then submit it to the administrators. Once approved, it will be available to learners."
              )}
            </p>
          </div>
          <button
            className="button trainer-create-cta"
            type="button"
            onClick={() => setShowCourseForm(true)}
          >
            + {t(locale, "Nouvelle formation", "New course")}
          </button>
        </div>
        <div
          className="trainer-overview"
          aria-label={t(locale, "Indicateurs de votre espace", "Workspace metrics")}
        >
          <article className="trainer-overview-card">
            <span>{t(locale, "Mes formations", "My courses")}</span>
            <strong>{courseCounts.total}</strong>
            <small>{t(locale, "tous statuts confondus", "across all statuses")}</small>
          </article>
          <article className="trainer-overview-card">
            <span>{t(locale, "Inscriptions actives", "Active enrolments")}</span>
            <strong>{activeLearnerCount}</strong>
            <small>
              {t(locale, "sur l’ensemble de vos formations", "across all your courses")}
            </small>
          </article>
          <article className="trainer-overview-card">
            <span>{t(locale, "Prochains directs", "Upcoming live sessions")}</span>
            <strong>{upcomingLiveSessions.length}</strong>
            <small>{t(locale, "sessions programmées", "scheduled sessions")}</small>
          </article>
          <article className="trainer-overview-card">
            <span>{t(locale, "Publiées", "Published")}</span>
            <strong>{courseCounts.published}</strong>
            <small>{t(locale, "visibles au catalogue", "visible in the catalogue")}</small>
          </article>
        </div>
        <section
          className="trainer-upcoming"
          aria-label={t(locale, "Prochains directs", "Upcoming live sessions")}
        >
          <div className="trainer-upcoming-heading">
            <div>
              <span className="learner-overline">{t(locale, "À VENIR", "COMING UP")}</span>
              <h2>{t(locale, "Vos prochains directs", "Your upcoming live sessions")}</h2>
            </div>
          </div>
          {upcomingLiveSessions.length > 0 ? (
            <ul className="trainer-upcoming-list">
              {upcomingLiveSessions.slice(0, 3).map((session) => {
                const canJoin = Date.parse(session.startsAt) - Date.now() <= 15 * 60 * 1000;
                return (
                  <li key={session.id}>
                    <span className="trainer-upcoming-date" aria-hidden="true">
                      {new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
                        day: "2-digit",
                        month: "short",
                        timeZone: "Africa/Ouagadougou"
                      }).format(new Date(session.startsAt))}
                    </span>
                    <span className="trainer-upcoming-details">
                      <strong>{session.title}</strong>
                      <small>
                        {session.courseTitle} ·{" "}
                        {new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
                          weekday: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Africa/Ouagadougou"
                        }).format(new Date(session.startsAt))}
                      </small>
                    </span>
                    {canJoin ? (
                      <Link className="trainer-upcoming-action" href={`/live/${session.id}`}>
                        {t(locale, "Rejoindre", "Join")}
                      </Link>
                    ) : (
                      <span className="trainer-upcoming-wait">
                        {t(locale, "Ouverture 15 min avant", "Opens 15 min before")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="trainer-upcoming-empty">
              {t(
                locale,
                "Aucun direct programmé pour le moment.",
                "No live sessions scheduled yet."
              )}
            </p>
          )}
        </section>
        {error && (
          <p className="admin-payments-error" role="alert">
            {locale === "en"
              ? "Unable to complete this request. Please check your connection and try again."
              : error}{" "}
            {error.includes("Connexion") && (
              <Link href="/login?next=%2Ftrainer">{t(locale, "Se connecter", "Sign in")}</Link>
            )}
          </p>
        )}
        {message && (
          <p className="admin-payments-success" role="status">
            {message}
          </p>
        )}

        {showCourseForm && (
          <section
            className="admin-method-form-section trainer-create-form"
            id="creation-formation"
          >
            <div className="trainer-form-heading">
              <div>
                <span className="learner-overline">
                  {t(locale, "NOUVEAU PARCOURS", "NEW LEARNING PATH")}
                </span>
                <h2>{t(locale, "Créer un brouillon", "Create a draft")}</h2>
              </div>
              <button
                className="trainer-close-form"
                type="button"
                onClick={() => setShowCourseForm(false)}
                aria-label={t(locale, "Fermer le formulaire", "Close form")}
              >
                ×
              </button>
            </div>
            <form className="admin-method-form" onSubmit={createCourse}>
              <label>
                {t(locale, "Titre de la formation", "Course title")}
                <input
                  name="title"
                  minLength={4}
                  maxLength={160}
                  placeholder={t(locale, "Ex. Français professionnel", "E.g. Professional English")}
                  required
                />
              </label>
              <label>
                {t(locale, "Adresse (slug, sans espace)", "URL slug (no spaces)")}
                <input
                  name="slug"
                  pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*"
                  minLength={3}
                  maxLength={160}
                  placeholder="professional-english"
                  required
                />
              </label>
              <label>
                {t(locale, "Langue", "Language")}
                <input
                  name="languageCode"
                  defaultValue="fr"
                  pattern="[a-z]{2}(-[A-Z]{2})?"
                  required
                />
              </label>
              <label>
                {t(locale, "Niveau", "Level")}
                <input
                  name="level"
                  maxLength={60}
                  placeholder={t(locale, "Débutant, intermédiaire…", "Beginner, intermediate…")}
                />
              </label>
              <label>
                {t(locale, "Prix (FCFA)", "Price (XOF)")}
                <input
                  name="priceAmount"
                  type="number"
                  min={1}
                  max={100000000}
                  step={1}
                  placeholder="25000"
                  required
                />
              </label>
              <label>
                {t(locale, "Durée d’accès (jours)", "Access period (days)")}
                <input
                  name="accessDurationDays"
                  type="number"
                  min={1}
                  max={1095}
                  step={1}
                  defaultValue={365}
                  required
                />
              </label>
              <label className="admin-method-instructions">
                {t(locale, "Description", "Description")}
                <textarea
                  name="description"
                  minLength={30}
                  maxLength={5000}
                  placeholder={t(
                    locale,
                    "Présentez les objectifs, le public visé et les compétences abordées…",
                    "Describe the objectives, intended audience and skills covered…"
                  )}
                  required
                />
              </label>
              <div className="admin-payment-actions admin-trainer-submit">
                <button className="button" type="submit" disabled={saving}>
                  {saving
                    ? t(locale, "Création…", "Creating…")
                    : t(locale, "Créer le brouillon", "Create draft")}
                </button>
              </div>
            </form>
          </section>
        )}

        <div className="admin-payments-toolbar">
          <div className="trainer-list-heading">
            <div>
              <span className="learner-overline">
                {t(locale, "VOTRE BIBLIOTHÈQUE", "YOUR LIBRARY")}
              </span>
              <h2>{t(locale, "Mes formations", "My courses")}</h2>
            </div>
            <span>
              {visibleCourses.length}{" "}
              {t(
                locale,
                visibleCourses.length === 1 ? "résultat" : "résultats",
                visibleCourses.length === 1 ? "result" : "results"
              )}
            </span>
          </div>
          <button
            className="button button-small"
            type="button"
            onClick={() => void loadDashboard()}
            disabled={loading}
          >
            {t(locale, "Actualiser", "Refresh")}
          </button>
        </div>
        <div className="trainer-course-tools">
          <div
            className="trainer-filter-list"
            aria-label={t(locale, "Filtrer les formations", "Filter courses")}
          >
            {courseFilters.map((item) => (
              <button
                className={filter === item.value ? "is-selected" : ""}
                type="button"
                key={item.value}
                onClick={() => setFilter(item.value)}
              >
                {t(
                  locale,
                  item.label,
                  item.value === "ALL"
                    ? "All"
                    : item.value === "DRAFT"
                      ? "Drafts"
                      : item.value === "SUBMITTED"
                        ? "Pending review"
                        : item.value === "PUBLISHED"
                          ? "Published"
                          : "Archived"
                )}
                {item.value !== "ALL" && (
                  <span>{courses.filter((course) => course.status === item.value).length}</span>
                )}
              </button>
            ))}
          </div>
          <label className="trainer-search">
            {t(locale, "Rechercher", "Search")}
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t(locale, "Titre ou adresse…", "Title or slug…")}
            />
          </label>
        </div>
        {loading && (
          <p className="catalog-state">
            {t(
              locale,
              "Chargement de vos formations depuis PostgreSQL…",
              "Loading your courses from PostgreSQL…"
            )}
          </p>
        )}
        {!loading && !courses.length && !error && (
          <div className="admin-payments-empty">
            <h2>{t(locale, "Aucun brouillon", "No drafts")}</h2>
            <p>
              {t(
                locale,
                "Créez une formation pour commencer votre parcours pédagogique.",
                "Create a course to start building your teaching resources."
              )}
            </p>
          </div>
        )}
        {!loading && courses.length > 0 && visibleCourses.length === 0 && (
          <div className="admin-payments-empty">
            <h2>{t(locale, "Aucune formation trouvée", "No courses found")}</h2>
            <p>
              {t(
                locale,
                "Modifiez votre recherche ou choisissez un autre filtre.",
                "Change your search or choose another filter."
              )}
            </p>
            <button
              className="trainer-reset-filter"
              type="button"
              onClick={() => {
                setSearch("");
                setFilter("ALL");
              }}
            >
              {t(locale, "Effacer les filtres", "Clear filters")}
            </button>
          </div>
        )}
        <div className="admin-payment-list">
          {visibleCourses.map((course) => (
            <TrainerCourseCard
              key={course.id}
              course={course}
              onRefresh={loadDashboard}
              onError={setError}
              onMessage={setMessage}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function AddLessonForm({
  moduleId,
  saving,
  locale,
  onSubmit
}: {
  moduleId: string;
  saving: boolean;
  locale: "fr" | "en";
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const [type, setType] = useState<Lesson["type"]>("TEXT");
  const typeSelectId = `lesson-type-${moduleId}`;
  return (
    <form
      className="admin-method-form trainer-lesson-form"
      id={`trainer-add-lesson-${moduleId}`}
      onSubmit={onSubmit}
    >
      <label>
        {t(locale, "Titre de la leçon", "Lesson title")}
        <input name="title" minLength={3} maxLength={160} required />
      </label>
      <label>
        {t(locale, "Résumé (facultatif)", "Summary (optional)")}
        <input name="description" maxLength={1000} />
      </label>
      <label htmlFor={typeSelectId}>
        {t(locale, "Type de contenu", "Content type")}
        <select
          id={typeSelectId}
          name="type"
          value={type}
          onChange={(event) => {
            if (isLessonType(event.target.value)) setType(event.target.value);
          }}
        >
          <option value="TEXT">{t(locale, "Leçon texte", "Text lesson")}</option>
          <option value="VIDEO">{t(locale, "Vidéo", "Video")}</option>
          <option value="RESOURCE">
            {t(locale, "Document PDF, Word ou PowerPoint", "PDF, Word or PowerPoint document")}
          </option>
          <option value="LIVE">{t(locale, "Session en direct", "Live session")}</option>
        </select>
      </label>
      {type === "TEXT" ? (
        <label className="admin-method-instructions">
          {t(locale, "Contenu de la leçon", "Lesson content")}
          <textarea name="contentText" minLength={20} maxLength={100000} required />
        </label>
      ) : (
        <p className="trainer-media-notice">
          {type === "VIDEO"
            ? t(
                locale,
                "Après la création, téléversez une vidéo MP4 ou WebM (500 Mo maximum).",
                "After creating the lesson, upload an MP4 or WebM video (up to 500 MB)."
              )
            : type === "RESOURCE"
              ? t(
                  locale,
                  "Après la création, importez un PDF (25 Mo maximum), un document Word, Excel ou une présentation PowerPoint (50 Mo maximum).",
                  "After creating the lesson, import a PDF (up to 25 MB), Word document, Excel spreadsheet or PowerPoint presentation (up to 50 MB)."
                )
              : t(
                  locale,
                  "Après publication, planifiez les directs dans cette formation. Les apprenants inscrits pourront les rejoindre depuis leur espace.",
                  "After publication, schedule live sessions for this course. Enrolled learners can join from their dashboard."
                )}
        </p>
      )}
      <label className="admin-method-active">
        <input type="checkbox" name="isPreview" />
        {t(
          locale,
          "Leçon de présentation visible avant inscription",
          "Preview lesson visible before enrolment"
        )}
      </label>
      <div className="admin-payment-actions admin-trainer-submit">
        <button className="button" type="submit" disabled={saving}>
          {saving ? t(locale, "Ajout…", "Adding…") : t(locale, "Ajouter la leçon", "Add lesson")}
        </button>
      </div>
    </form>
  );
}

function TrainerCourseCard({
  course,
  onRefresh,
  onError,
  onMessage
}: {
  course: Course;
  onRefresh: () => Promise<void>;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}) {
  const { locale } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [importHint, setImportHint] = useState("");
  const [submissionError, setSubmissionError] = useState("");
  const canEdit = course.status === "DRAFT";
  const canScheduleLive = course.status === "PUBLISHED";
  const submissionReady =
    course.moduleCount > 0 &&
    course.lessonCount > 0 &&
    course.modules.every((module) => module.lessons.every((lesson) => lesson.readyForSubmission));
  const hasIncompleteLesson = course.modules.some((module) =>
    module.lessons.some((lesson) => !lesson.readyForSubmission)
  );
  const incompleteLessons = course.modules.flatMap((module) =>
    module.lessons
      .filter((lesson) => !lesson.readyForSubmission)
      .map((lesson) => ({ ...lesson, moduleTitle: module.title }))
  );
  const preparationSteps = [
    { label: "Structure", done: course.moduleCount > 0 },
    { label: "Contenu", done: course.lessonCount > 0 },
    { label: "Prête à soumettre", done: submissionReady }
  ];
  const preparationProgress = preparationSteps.filter((step) => step.done).length;

  function openFileImport() {
    setImportHint("");
    const firstMediaLesson = course.modules
      .flatMap((module) => module.lessons)
      .find((lesson) => lesson.type === "VIDEO" || lesson.type === "RESOURCE");

    if (firstMediaLesson) {
      document
        .getElementById(`trainer-upload-form-${firstMediaLesson.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      setImportHint(
        t(
          locale,
          "Choisissez un fichier dans le formulaire ci-dessous, puis cliquez sur « Importer le fichier ».",
          "Choose a file in the form below, then click “Import file”."
        )
      );
      return;
    }

    const firstModule = course.modules[0];
    if (firstModule) {
      document
        .getElementById(`trainer-add-lesson-${firstModule.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      setImportHint(
        t(
          locale,
          "Ajoutez d’abord une leçon de type Vidéo ou Document ; son formulaire d’import apparaîtra ensuite.",
          "First add a Video or Resource lesson; its upload form will appear afterward."
        )
      );
      return;
    }

    document
      .getElementById(`trainer-course-controls-${course.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setImportHint(
      t(
        locale,
        "Ajoutez d’abord un module, puis une leçon Vidéo ou Document pour importer un fichier.",
        "First add a module, then a Video or Resource lesson to upload a file."
      )
    );
  }

  function focusLesson(lesson: Lesson) {
    const targetId =
      lesson.type === "VIDEO" || lesson.type === "RESOURCE"
        ? `trainer-upload-form-${lesson.id}`
        : `trainer-edit-lesson-${lesson.id}`;
    const target = document.getElementById(targetId);
    if (target instanceof HTMLDetailsElement) target.open = true;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function postForm(
    event: React.FormEvent<HTMLFormElement>,
    url: string,
    successMessage: string,
    method: "POST" | "PATCH" = "POST"
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    onError("");
    onMessage("");
    const formData = new FormData(formElement);
    const payload: Record<string, unknown> = {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || null
    };
    if (formData.has("type")) {
      const type = String(formData.get("type") ?? "TEXT");
      payload.type = type;
      if (type === "TEXT") payload.contentText = String(formData.get("contentText") ?? "");
      payload.isPreview = formData.get("isPreview") === "on";
    }
    try {
      const response = await fetch(`${apiBaseUrl}${url}`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = (await response.json()) as ApiError;
      if (!response.ok) throw new Error(body.error?.message ?? "Enregistrement impossible.");
      formElement.reset();
      onMessage(successMessage);
      await onRefresh();
    } catch (cause) {
      onError(
        locale === "en"
          ? "Unable to save these changes. Please try again."
          : cause instanceof Error
            ? cause.message
            : "Le service ne répond pas."
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitForReview() {
    setSaving(true);
    setSubmissionError("");
    onError("");
    onMessage("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/trainer/courses/${encodeURIComponent(course.id)}/submit`,
        {
          method: "POST",
          credentials: "include"
        }
      );
      const body = (await response.json()) as ApiError & {
        course?: { id?: string; status?: CourseStatus };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "La soumission a échoué.");
      if (body.course?.id !== course.id || body.course.status !== "SUBMITTED") {
        throw new Error(
          t(
            locale,
            "La formation n’a pas été confirmée comme envoyée. Actualisez la page et réessayez.",
            "The course was not confirmed as submitted. Refresh the page and try again."
          )
        );
      }
      onMessage(
        t(
          locale,
          "Formation envoyée à l’administration pour validation.",
          "Course submitted for administrator review."
        )
      );
      await onRefresh();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : t(locale, "Le service ne répond pas.", "The service is unavailable.");
      setSubmissionError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteDraft() {
    if (
      !window.confirm(
        t(
          locale,
          `Supprimer définitivement le brouillon « ${course.title} » et tout son contenu ?`,
          `Permanently delete the draft "${course.title}" and all its content?`
        )
      )
    ) {
      return;
    }

    setSaving(true);
    onError("");
    onMessage("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/trainer/courses/${encodeURIComponent(course.id)}`,
        { method: "DELETE", credentials: "include" }
      );
      const body = (await response.json()) as ApiError;
      if (!response.ok) {
        throw new Error(body.error?.message ?? "La suppression du brouillon a échoué.");
      }

      onMessage(t(locale, "Brouillon supprimé.", "Draft deleted."));
      await onRefresh();
    } catch (cause) {
      onError(
        locale === "en"
          ? "Unable to delete this draft. Please try again."
          : cause instanceof Error
            ? cause.message
            : "Le service ne répond pas."
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadLessonMedia(event: React.FormEvent<HTMLFormElement>, lesson: Lesson) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      onError(t(locale, "Choisissez un fichier non vide.", "Choose a non-empty file."));
      return;
    }

    const maxSize =
      lesson.type === "RESOURCE"
        ? file.type === "application/pdf"
          ? mediaSizeLimits.pdf
          : mediaSizeLimits.office
        : mediaSizeLimits.video;
    if (file.size > maxSize) {
      onError(
        lesson.type === "RESOURCE"
          ? file.type === "application/pdf"
            ? t(
                locale,
                "Un fichier PDF ne peut pas dépasser 25 Mo.",
                "PDF files must be 25 MB or smaller."
              )
            : t(
                locale,
                "Un document Word, Excel ou PowerPoint ne peut pas dépasser 50 Mo.",
                "Word, Excel and PowerPoint files must be 50 MB or smaller."
              )
          : t(locale, "Une vidéo ne peut pas dépasser 500 Mo.", "Videos must be 500 MB or smaller.")
      );
      return;
    }

    setSaving(true);
    setUploadProgress(0);
    onError("");
    onMessage("");
    try {
      const policyResponse = await fetch(
        `${apiBaseUrl}/api/v1/trainer/lessons/${encodeURIComponent(lesson.id)}/upload-policy`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, mimeType: file.type, sizeBytes: file.size })
        }
      );
      const policyBody = (await policyResponse.json()) as UploadPolicy;
      if (!policyResponse.ok || !policyBody.upload) {
        throw new Error(policyBody.error?.message ?? "Impossible de préparer le téléversement.");
      }

      await uploadToGoogleCloud(
        policyBody.upload.url,
        policyBody.upload.fields,
        file,
        setUploadProgress
      );
      const completionResponse = await fetch(
        `${apiBaseUrl}/api/v1/trainer/lessons/${encodeURIComponent(lesson.id)}/complete-upload`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storageKey: policyBody.upload.storageKey, fileName: file.name })
        }
      );
      const completionBody = (await completionResponse.json()) as ApiError;
      if (!completionResponse.ok) {
        throw new Error(
          completionBody.error?.message ??
            "Le fichier a été téléversé mais n’a pas pu être lié à la leçon."
        );
      }

      setUploadProgress(100);
      onMessage(t(locale, "Fichier lié à la leçon.", "File attached to the lesson."));
      await onRefresh();
    } catch (cause) {
      onError(
        locale === "en"
          ? "Unable to upload this file. Check its type, size, and your connection."
          : cause instanceof Error
            ? cause.message
            : "Le téléversement a échoué."
      );
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  }

  async function createLiveSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const startsAt = new Date(`${String(formData.get("startsAt") ?? "")}:00Z`);
    const endsAt = new Date(`${String(formData.get("endsAt") ?? "")}:00Z`);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      onError(
        t(
          locale,
          "Indiquez une date de début et une date de fin valides.",
          "Enter valid start and end dates."
        )
      );
      return;
    }
    setSaving(true);
    onError("");
    onMessage("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/trainer/courses/${encodeURIComponent(course.id)}/live-sessions`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: String(formData.get("title") ?? ""),
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            ...(String(formData.get("meetingUrl") ?? "").trim()
              ? { meetingUrl: String(formData.get("meetingUrl")).trim() }
              : {})
          })
        }
      );
      const body = (await response.json()) as ApiError;
      if (!response.ok)
        throw new Error(
          locale === "en"
            ? "Unable to schedule the live session. Check the dates and try again."
            : (body.error?.message ?? "La création de la session a échoué.")
        );
      formElement.reset();
      onMessage(
        t(
          locale,
          "Session planifiée. Les apprenants inscrits la retrouveront dans leur espace.",
          "Live session scheduled. Enrolled learners will find it in their dashboard."
        )
      );
      await onRefresh();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Le service ne répond pas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="admin-payment-card trainer-course-card">
      <div className="admin-payment-heading">
        <div>
          <span className="learner-overline">{course.slug}</span>
          <h2>{course.title}</h2>
        </div>
        <span className={`admin-method-status trainer-status-${course.status.toLowerCase()}`}>
          {t(
            locale,
            statusLabels[course.status],
            (
              {
                DRAFT: "Draft",
                SUBMITTED: "Pending review",
                PUBLISHED: "Published",
                ARCHIVED: "Archived"
              } as const
            )[course.status]
          )}
        </span>
      </div>
      {canEdit && (
        <div className="trainer-preparation">
          <div className="trainer-preparation-heading">
            <strong>{t(locale, "Préparation du cours", "Course setup")}</strong>
            <span>
              {preparationProgress}/3 {t(locale, "étapes", "steps")}
            </span>
          </div>
          <div
            className="trainer-progress-track"
            role="progressbar"
            aria-label={t(locale, "Progression de préparation", "Setup progress")}
            aria-valuenow={preparationProgress}
            aria-valuemin={0}
            aria-valuemax={3}
          >
            <span style={{ width: `${(preparationProgress / 3) * 100}%` }} />
          </div>
          <ol>
            {preparationSteps.map((step) => (
              <li className={step.done ? "is-done" : ""} key={step.label}>
                <span aria-hidden="true">{step.done ? "✓" : "○"}</span>
                {t(
                  locale,
                  step.label,
                  step.label === "Structure"
                    ? "Structure"
                    : step.label === "Contenu"
                      ? "Content"
                      : "Ready to submit"
                )}
              </li>
            ))}
          </ol>
          <div className="trainer-import-action">
            <button
              className="button button-small trainer-import-cta"
              type="button"
              onClick={openFileImport}
            >
              {t(locale, "Importer un fichier", "Upload a file")}
            </button>
            {importHint && (
              <p className="trainer-import-hint" role="status">
                {importHint}
              </p>
            )}
          </div>
        </div>
      )}
      <dl className="admin-payment-details">
        <div>
          <dt>{t(locale, "Inscriptions actives", "Active enrolments")}</dt>
          <dd>{course.enrollmentCount}</dd>
        </div>
        <div>
          <dt>{t(locale, "Modules", "Modules")}</dt>
          <dd>{course.moduleCount}</dd>
        </div>
        <div>
          <dt>{t(locale, "Leçons", "Lessons")}</dt>
          <dd>{course.lessonCount}</dd>
        </div>
        <div>
          <dt>{t(locale, "Tarif", "Price")}</dt>
          <dd>
            {new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB").format(course.priceAmount)}{" "}
            FCFA
          </dd>
        </div>
      </dl>
      {course.reviewNote && (
        <p className="admin-course-review-note">
          <strong>{t(locale, "Retour de l’administration :", "Administrator feedback:")}</strong>{" "}
          {course.reviewNote}
        </p>
      )}
      {canScheduleLive && (
        <section className="trainer-live-management">
          <p className="trainer-builder-label">
            {t(locale, "VISIOCONFÉRENCES JITSI", "JITSI VIDEO CALLS")}
          </p>
          {course.liveSessions.length > 0 && (
            <ul className="trainer-live-list">
              {course.liveSessions.map((session) => (
                <li key={session.id}>
                  <span>
                    <strong>{session.title}</strong>
                    <small>
                      {new Date(session.startsAt).toLocaleDateString(
                        locale === "fr" ? "fr-FR" : "en-GB",
                        {
                          day: "numeric",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Africa/Ouagadougou"
                        }
                      )}
                    </small>
                  </span>
                  {new Date(session.startsAt).getTime() - Date.now() <= 15 * 60 * 1000 ? (
                    <Link className="admin-reject-button" href={`/live/${session.id}`}>
                      {t(locale, "Rejoindre", "Join")}
                    </Link>
                  ) : (
                    <small>{t(locale, "Ouverture 15 min avant", "Opens 15 min before")}</small>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form className="admin-method-form trainer-live-form" onSubmit={createLiveSession}>
            <label>
              {t(locale, "Titre du direct", "Live session title")}
              <input
                name="title"
                minLength={3}
                maxLength={160}
                placeholder={t(locale, "Ex. Questions-réponses", "E.g. Q&A session")}
                required
              />
            </label>
            <label>
              {t(locale, "Début (heure de Ouagadougou)", "Starts at (Ouagadougou time)")}
              <input name="startsAt" type="datetime-local" required />
            </label>
            <label>
              {t(locale, "Fin (heure de Ouagadougou)", "Ends at (Ouagadougou time)")}
              <input name="endsAt" type="datetime-local" required />
            </label>
            <label>
              {t(locale, "Lien du direct (facultatif)", "Live link (optional)")}
              <input
                name="meetingUrl"
                type="url"
                placeholder="https://..."
                inputMode="url"
                autoComplete="url"
              />
              <small>
                {t(
                  locale,
                  "Sans lien, une salle Jitsi sera créée automatiquement.",
                  "Leave blank to create a Jitsi room automatically."
                )}
              </small>
            </label>
            <div className="admin-payment-actions admin-trainer-submit">
              <button className="button" type="submit" disabled={saving}>
                {saving
                  ? t(locale, "Planification…", "Scheduling…")
                  : t(locale, "Planifier le direct", "Schedule live session")}
              </button>
            </div>
          </form>
        </section>
      )}
      {course.modules.map((module) => (
        <section className="trainer-module" key={module.id}>
          <h3>
            <span>
              {t(locale, "MODULE", "MODULE")} {String(module.position).padStart(2, "0")}
            </span>
            {module.title}
          </h3>
          {module.description && <p>{module.description}</p>}
          {module.lessons.length === 0 && (
            <p className="trainer-empty-lessons">
              {t(
                locale,
                "Aucune leçon pour le moment. Ajoutez votre premier contenu ci-dessous.",
                "No lessons yet. Add your first learning content below."
              )}
            </p>
          )}
          <ol>
            {module.lessons.map((lesson) => (
              <li key={lesson.id}>
                <div>
                  <strong>{lesson.title}</strong>{" "}
                  <span>
                    {lesson.type === "TEXT" ? t(locale, "Leçon texte", "Text lesson") : lesson.type}
                  </span>
                </div>
                {canEdit && (
                  <details className="trainer-lesson-edit" id={`trainer-edit-lesson-${lesson.id}`}>
                    <summary>{t(locale, "Modifier cette leçon", "Edit this lesson")}</summary>
                    <form
                      className="admin-method-form trainer-lesson-form"
                      onSubmit={(event) =>
                        postForm(
                          event,
                          `/api/v1/trainer/lessons/${lesson.id}`,
                          t(locale, "Leçon mise à jour.", "Lesson updated."),
                          "PATCH"
                        )
                      }
                    >
                      <label>
                        {t(locale, "Titre", "Title")}
                        <input
                          name="title"
                          defaultValue={lesson.title}
                          minLength={3}
                          maxLength={160}
                          required
                        />
                      </label>
                      <label>
                        {t(locale, "Résumé", "Summary")}
                        <input
                          name="description"
                          defaultValue={lesson.description ?? ""}
                          maxLength={1000}
                        />
                      </label>
                      {lesson.type === "TEXT" && (
                        <label className="admin-method-instructions">
                          {t(locale, "Contenu", "Content")}
                          <textarea
                            name="contentText"
                            defaultValue={lesson.contentText ?? ""}
                            minLength={20}
                            maxLength={100000}
                            required
                          />
                        </label>
                      )}
                      <label className="admin-method-active">
                        <input type="checkbox" name="isPreview" defaultChecked={lesson.isPreview} />
                        {t(
                          locale,
                          "Leçon de présentation visible avant inscription",
                          "Preview lesson visible before enrolment"
                        )}
                      </label>
                      <input type="hidden" name="type" value={lesson.type} />
                      <div className="admin-payment-actions admin-trainer-submit">
                        <button className="button" type="submit" disabled={saving}>
                          {saving
                            ? t(locale, "Enregistrement…", "Saving…")
                            : t(locale, "Enregistrer la leçon", "Save lesson")}
                        </button>
                      </div>
                    </form>
                  </details>
                )}
                {canEdit && (lesson.type === "VIDEO" || lesson.type === "RESOURCE") && (
                  <form
                    className="admin-method-form trainer-lesson-form trainer-upload-form"
                    id={`trainer-upload-form-${lesson.id}`}
                    onSubmit={(event) => void uploadLessonMedia(event, lesson)}
                  >
                    <div className="trainer-upload-field">
                      <span className="trainer-upload-label">
                        {lesson.type === "VIDEO"
                          ? t(
                              locale,
                              "Fichier vidéo MP4 ou WebM (500 Mo maximum)",
                              "MP4 or WebM video (up to 500 MB)"
                            )
                          : t(
                              locale,
                              "PDF (25 Mo), Word, Excel ou PowerPoint (50 Mo maximum)",
                              "PDF (up to 25 MB), Word, Excel or PowerPoint (up to 50 MB)"
                            )}
                      </span>
                      <label className="trainer-import-picker">
                        <input
                          className="trainer-import-input"
                          name="file"
                          type="file"
                          accept={
                            lesson.type === "VIDEO"
                              ? "video/mp4,video/webm"
                              : `application/pdf,.pdf,${officeDocumentTypes}`
                          }
                          required={!lesson.contentAsset}
                        />
                        <span className="button button-small">
                          {t(locale, "Choisir un fichier", "Choose a file")}
                        </span>
                      </label>
                    </div>
                    {lesson.contentAsset && (
                      <p className="trainer-upload-file">
                        {t(locale, "Fichier actuel :", "Current file:")}{" "}
                        {lesson.contentAsset.originalName}
                      </p>
                    )}
                    {uploadProgress !== null && (
                      <progress
                        className="trainer-upload-progress"
                        value={uploadProgress}
                        max={100}
                      >
                        {uploadProgress}%
                      </progress>
                    )}
                    <div className="admin-payment-actions admin-trainer-submit">
                      <button className="button" type="submit" disabled={saving}>
                        {saving
                          ? t(locale, "Téléversement…", "Uploading…")
                          : lesson.contentAsset
                            ? t(locale, "Importer un nouveau fichier", "Import a new file")
                            : t(locale, "Importer le fichier", "Import file")}
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ol>
          {canEdit && (
            <AddLessonForm
              moduleId={module.id}
              saving={saving}
              locale={locale}
              onSubmit={(event) =>
                postForm(
                  event,
                  `/api/v1/trainer/modules/${module.id}/lessons`,
                  t(locale, "Leçon ajoutée au module.", "Lesson added to the module.")
                )
              }
            />
          )}
        </section>
      ))}
      {canEdit && (
        <div className="trainer-course-controls" id={`trainer-course-controls-${course.id}`}>
          <p className="trainer-builder-label">
            {t(locale, "CONTINUER LA PRÉPARATION", "CONTINUE BUILDING")}
          </p>
          <form
            className="admin-method-form trainer-module-form"
            onSubmit={(event) =>
              postForm(
                event,
                `/api/v1/trainer/courses/${course.id}/modules`,
                t(locale, "Module ajouté à la formation.", "Module added to the course.")
              )
            }
          >
            <label>
              {t(locale, "Ajouter un module", "Add a module")}
              <input name="title" minLength={3} maxLength={160} required />
            </label>
            <label>
              {t(locale, "Description (facultative)", "Description (optional)")}
              <input name="description" maxLength={1000} />
            </label>
            <div className="admin-payment-actions admin-trainer-submit">
              <button className="admin-reject-button" type="submit" disabled={saving}>
                {saving
                  ? t(locale, "Ajout…", "Adding…")
                  : t(locale, "Ajouter un module", "Add module")}
              </button>
            </div>
          </form>
          <p className="trainer-media-notice">
            {t(
              locale,
              "Importez les vidéos MP4/WebM, PDF, documents Word, Excel et PowerPoint dans chaque leçon. Soumettez ensuite la formation à l’administration : les fichiers seront visibles aux apprenants après validation.",
              "Import MP4/WebM videos, PDFs, Word, Excel and PowerPoint files into each lesson. Then submit the course for review; learners can access the files after approval."
            )}
          </p>
          {!submissionReady && (
            <p className="trainer-import-hint" role="status">
              {!course.moduleCount || !course.lessonCount
                ? t(
                    locale,
                    "Ajoutez au moins un module et une leçon avant de soumettre la formation.",
                    "Add at least one module and one lesson before submitting the course."
                  )
                : hasIncompleteLesson
                  ? t(
                      locale,
                      "Complétez le contenu texte et importez un fichier valide pour chaque leçon vidéo ou document.",
                      "Complete text lesson content and upload a valid file for each video or resource lesson."
                    )
                  : t(
                      locale,
                      "Vérifiez le contenu de la formation avant de la soumettre.",
                      "Check the course content before submitting it."
                    )}
              {incompleteLessons.length > 0 && (
                <span>
                  {" "}
                  {incompleteLessons.map((lesson, index) => (
                    <span key={lesson.id}>
                      {index > 0 ? ", " : ""}
                      <button
                        className="trainer-incomplete-lesson"
                        type="button"
                        onClick={() => focusLesson(lesson)}
                      >
                        {lesson.moduleTitle} — {lesson.title}
                      </button>
                      {lesson.type === "TEXT"
                        ? t(locale, " (contenu texte requis)", " (text content required)")
                        : lesson.type === "VIDEO"
                          ? t(locale, " (vidéo à importer)", " (video upload required)")
                          : lesson.type === "RESOURCE"
                            ? t(locale, " (document à importer)", " (document upload required)")
                            : ""}
                    </span>
                  ))}
                </span>
              )}
            </p>
          )}
          {submissionError && (
            <p className="admin-payments-error" role="alert">
              {submissionError}
            </p>
          )}
          <TrainerCourseSubmissionForm
            saving={saving}
            label={t(locale, "Soumettre à l’administration", "Submit for review")}
            submittingLabel={t(locale, "Envoi…", "Submitting…")}
            onSubmit={() => void submitForReview()}
          />
          <div className="admin-payment-actions admin-trainer-submit">
            <button
              className="admin-reject-button"
              type="button"
              disabled={saving}
              onClick={() => void deleteDraft()}
            >
              {t(locale, "Supprimer le brouillon", "Delete draft")}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
