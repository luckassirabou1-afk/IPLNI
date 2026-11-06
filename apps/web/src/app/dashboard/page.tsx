"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { t, useLanguage } from "../components/language-provider";

type IconName =
  | "home"
  | "book"
  | "calendar"
  | "award"
  | "settings"
  | "bell"
  | "arrow"
  | "clock"
  | "play"
  | "check";

const iconPaths: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6",
  book: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 0V21",
  calendar: "M4 5h16v16H4zM8 3v4m8-4v4M4 10h16",
  award: "M12 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm-3.5-1L7 22l5-3 5 3-1.5-9",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v2m0 16v2m10-10h-2M4 12H2m17.1-7.1-1.4 1.4M6.3 17.7l-1.4 1.4m14.2 0-1.4-1.4M6.3 6.3 4.9 4.9",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12a2 2 0 0 0 4 0",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2",
  play: "m8 5 12 7-12 7V5Z",
  check: "m5 12 4 4L19 6"
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

type DashboardData = {
  stats: {
    activeCourses: number;
    completedLessons: number;
    learningSeconds: number;
    certificates: number;
    learningDaysThisWeek: number;
    activeLearningDates: string[];
  };
  courses: Array<{
    id: string;
    title: string;
    teacher: string;
    progress: number;
    nextLesson: string | null;
    nextLessonId: string | null;
    completedLessons: number;
    totalLessons: number;
    modules: Array<{
      id: string;
      title: string;
      lessons: Array<{
        id: string;
        title: string;
        type: "TEXT" | "VIDEO" | "RESOURCE" | "LIVE";
        assetMimeType: string | null;
      }>;
    }>;
    liveSessions: Array<{
      id: string;
      title: string;
      startsAt: string;
      endsAt: string;
    }>;
  }>;
  nextLiveSession: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    courseTitle: string;
  } | null;
};

type CurrentUser = {
  id: string;
  fullName: string;
  roles: string[];
};

type LoadState = "loading" | "ready" | "unauthenticated" | "error";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("fr-FR") ?? "")
    .join("");
}

export default function LearnerDashboardPage() {
  const { locale } = useLanguage();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    async function loadDashboard() {
      try {
        const userResponse = await fetch(`${apiBaseUrl}/api/v1/auth/me`, {
          credentials: "include"
        });
        if (userResponse.status === 401) {
          if (isCurrent) setLoadState("unauthenticated");
          return;
        }
        if (!userResponse.ok) {
          throw new Error(
            t(
              locale,
              "Le chargement de votre espace a échoué. Réessayez dans un instant.",
              "Unable to load your space. Please try again in a moment."
            )
          );
        }

        const userData = (await userResponse.json()) as { user: CurrentUser };
        const view = new URLSearchParams(window.location.search).get("view");
        if (userData.user.roles.includes("ADMIN")) {
          if (view !== "learner") {
            router.replace("/admin");
            return;
          }
        }
        if (!userData.user.roles.includes("ADMIN") && userData.user.roles.includes("TRAINER")) {
          router.replace("/trainer");
          return;
        }
        if (!userData.user.roles.includes("LEARNER") && !userData.user.roles.includes("ADMIN")) {
          throw new Error(
            t(
              locale,
              "Votre compte n’a pas accès à un espace utilisateur.",
              "Your account does not have access to a user workspace."
            )
          );
        }

        const dashboardResponse = await fetch(`${apiBaseUrl}/api/v1/learner/dashboard`, {
          credentials: "include"
        });
        if (dashboardResponse.status === 401) {
          if (isCurrent) setLoadState("unauthenticated");
          return;
        }
        if (!dashboardResponse.ok) {
          throw new Error(
            t(
              locale,
              "Le chargement de votre espace a échoué. Réessayez dans un instant.",
              "Unable to load your space. Please try again in a moment."
            )
          );
        }
        const dashboardData = (await dashboardResponse.json()) as DashboardData;
        if (isCurrent) {
          setDashboard(dashboardData);
          setUser(userData.user);
          setLoadState("ready");
          setMessage("");
        }
      } catch (error) {
        if (isCurrent) {
          setMessage(
            error instanceof Error
              ? error.message
              : t(locale, "Une erreur inattendue est survenue.", "An unexpected error occurred.")
          );
          setLoadState("error");
        }
      }
    }

    void loadDashboard();
    return () => {
      isCurrent = false;
    };
  }, [locale, refreshKey, router]);

  async function handleLogout() {
    setMessage("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
      if (!response.ok) {
        setMessage(
          t(
            locale,
            "La déconnexion n’a pas abouti. Réessayez.",
            "Sign-out failed. Please try again."
          )
        );
        return;
      }
      setLoadState("unauthenticated");
    } catch {
      setMessage(
        t(
          locale,
          "Impossible de joindre le service pour fermer votre session.",
          "Unable to reach the service to end your session."
        )
      );
    }
  }

  if (loadState !== "ready" || !dashboard || !user) {
    return (
      <main className="auth-state-page">
        <section className="auth-state-card">
          <Link href="/" className="auth-brand">
            <Image src="/iplni-logo.png" alt="" width={48} height={48} priority />
            <span>
              <strong>IPLNI</strong>
              <small>APPRENDRE · PROGRESSER</small>
            </span>
          </Link>
          {loadState === "loading" && (
            <>
              <h1>{t(locale, "Votre espace arrive", "Your space is loading")}</h1>
              <p>
                {t(
                  locale,
                  "Nous récupérons vos formations et votre progression.",
                  "We’re loading your courses and progress."
                )}
              </p>
            </>
          )}
          {loadState === "unauthenticated" && (
            <>
              <h1>{t(locale, "Connectez-vous à votre espace", "Sign in to your space")}</h1>
              <p>
                {t(
                  locale,
                  "Votre tableau de bord est réservé aux apprenants connectés.",
                  "Your dashboard is available to signed-in learners."
                )}
              </p>
              <Link className="button" href="/login">
                {t(locale, "Se connecter", "Sign in")} <span aria-hidden="true">↗</span>
              </Link>
            </>
          )}
          {loadState === "error" && (
            <>
              <h1>{t(locale, "Chargement impossible", "Unable to load")}</h1>
              <p className="auth-state-error">{message}</p>
              <button
                className="button"
                type="button"
                onClick={() => {
                  setLoadState("loading");
                  setRefreshKey((key) => key + 1);
                }}
              >
                {t(locale, "Réessayer", "Try again")}
              </button>
            </>
          )}
        </section>
      </main>
    );
  }

  const firstName = user.fullName.trim().split(/\s+/)[0] ?? user.fullName;
  const today = new Date();
  const dateLabel = today.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });
  const learningHours = Math.floor(dashboard.stats.learningSeconds / 3600);
  const learningMinutes = Math.floor((dashboard.stats.learningSeconds % 3600) / 60);
  const weekStart = new Date(today);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return {
      day: date
        .toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { weekday: "short" })
        .replace(".", "")
        .toLocaleUpperCase(locale === "fr" ? "fr-FR" : "en-GB"),
      date: String(date.getDate()),
      done: dashboard.stats.activeLearningDates.includes(key),
      current: date.toDateString() === today.toDateString()
    };
  });

  return (
    <main className="learner-app">
      <aside className="learner-sidebar">
        <Link href="/" className="learner-brand" aria-label="IPLNI, accueil">
          <Image src="/iplni-logo.png" alt="" width={42} height={42} priority />
          <span>
            <strong>IPLNI</strong>
            <small>{t(locale, "ESPACE APPRENANT", "LEARNER SPACE")}</small>
          </span>
        </Link>

        <p className="sidebar-label">{t(locale, "MENU PRINCIPAL", "MAIN MENU")}</p>
        <nav
          className="learner-nav"
          aria-label={t(locale, "Navigation de l’espace apprenant", "Learner space navigation")}
        >
          <a className="learner-nav-link active" href="#overview" aria-current="page">
            <Icon name="home" size={18} />
            {t(locale, "Vue d’ensemble", "Overview")}
          </a>
          <a className="learner-nav-link" href="#my-courses">
            <Icon name="book" size={18} />
            {t(locale, "Mes formations", "My courses")}
            <span className="nav-count">{dashboard.courses.length}</span>
          </a>
          <a className="learner-nav-link" href="#schedule">
            <Icon name="calendar" size={18} />
            {t(locale, "Mon planning", "My schedule")}
          </a>
          <a className="learner-nav-link" href="#certificates">
            <Icon name="award" size={18} />
            {t(locale, "Mes attestations", "My certificates")}
          </a>
          <Link className="learner-nav-link" href="/courses">
            <Icon name="book" size={18} />
            {t(locale, "Catalogue", "Catalogue")}
          </Link>
          {user.roles.includes("ADMIN") && (
            <>
              <Link className="learner-nav-link" href="/trainer">
                {t(locale, "Espace formateur", "Trainer space")}
              </Link>
              <Link className="learner-nav-link" href="/admin">
                {t(locale, "Espace administrateur", "Admin space")}
              </Link>
            </>
          )}
        </nav>

        <div className="sidebar-help">
          <span className="help-decoration" aria-hidden="true">
            ✳
          </span>
          <strong>{t(locale, "Besoin d’un coup de main ?", "Need a hand?")}</strong>
          <p>
            {t(
              locale,
              "Notre équipe est là pour vous accompagner.",
              "Our team is here to support you."
            )}
          </p>
          <a href="mailto:contact@iplni.org">
            {t(locale, "Contacter l’équipe", "Contact the team")} <Icon name="arrow" size={15} />
          </a>
        </div>

        <div className="sidebar-bottom">
          <div className="learner-profile">
            <span className="profile-avatar">{initialsFor(user.fullName)}</span>
            <span>
              <strong>{user.fullName}</strong>
              <small>{t(locale, "Espace apprenant", "Learner space")}</small>
            </span>
          </div>
        </div>
      </aside>

      <section className="learner-main" id="overview">
        <header className="learner-topbar">
          <div className="breadcrumb">
            <Link href="/">{t(locale, "Accueil", "Home")}</Link>
            <span>/</span>
            <strong>{t(locale, "Mon espace", "My space")}</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-label">{t(locale, "ESPACE APPRENANT", "LEARNER SPACE")}</span>
            <span className="topbar-divider" />
            <button className="logout-button" type="button" onClick={() => void handleLogout()}>
              {t(locale, "Déconnexion", "Sign out")}
            </button>
            <span className="topbar-avatar">{initialsFor(user.fullName)}</span>
          </div>
        </header>

        <div className="learner-content">
          {message && (
            <p className="dashboard-message" role="alert">
              {message}
            </p>
          )}
          <section className="welcome-row">
            <div>
              <p className="learner-date">{dateLabel}</p>
              <h1>
                {t(locale, "Bonjour", "Hello")} {firstName} <span aria-hidden="true">✳</span>
              </h1>
              <p className="welcome-copy">
                {t(
                  locale,
                  "Chaque petit pas vous rapproche de votre objectif. Prêt à continuer ?",
                  "Every small step brings you closer to your goal. Ready to continue?"
                )}
              </p>
            </div>
            <a className="weekly-goal" href="#schedule">
              <span className="goal-ring">
                <span>
                  {dashboard.stats.learningDaysThisWeek}
                  <small>j</small>
                </span>
              </span>
              <span>
                <strong>{t(locale, "Votre semaine", "Your week")}</strong>
                <small>
                  {t(locale, "jours d’apprentissage enregistrés", "learning days recorded")}
                </small>
              </span>
              <Icon name="arrow" size={16} />
            </a>
          </section>

          <section
            className="learner-stats"
            id="certificates"
            aria-label={t(locale, "Ma progression", "My progress")}
          >
            <article className="stat-card">
              <span className="stat-icon stat-icon-green">
                <Icon name="book" size={17} />
              </span>
              <span className="stat-label">
                {t(locale, "Formations en cours", "Active courses")}
              </span>
              <strong>{String(dashboard.stats.activeCourses).padStart(2, "0")}</strong>
              <small>{t(locale, "Vos inscriptions actives", "Your active enrolments")}</small>
            </article>
            <article className="stat-card">
              <span className="stat-icon stat-icon-gold">
                <Icon name="clock" size={17} />
              </span>
              <span className="stat-label">
                {t(locale, "Temps d’apprentissage", "Learning time")}
              </span>
              <strong>
                {learningHours} <small>{t(locale, "h", "h")}</small> {learningMinutes}{" "}
                <small>{t(locale, "min", "min")}</small>
              </strong>
              <small>
                {t(locale, "Temps suivi sur vos cours", "Time tracked across your courses")}
              </small>
            </article>
            <article className="stat-card">
              <span className="stat-icon stat-icon-lilac">
                <Icon name="check" size={17} />
              </span>
              <span className="stat-label">
                {t(locale, "Leçons terminées", "Lessons completed")}
              </span>
              <strong>{dashboard.stats.completedLessons}</strong>
              <small>{t(locale, "Sur vos formations actives", "Across your active courses")}</small>
            </article>
            <article className="stat-card">
              <span className="stat-icon stat-icon-peach">
                <Icon name="award" size={17} />
              </span>
              <span className="stat-label">
                {t(locale, "Attestations obtenues", "Certificates earned")}
              </span>
              <strong>{String(dashboard.stats.certificates).padStart(2, "0")}</strong>
              <small>{t(locale, "Attestations valides", "Valid certificates")}</small>
            </article>
          </section>

          <div className="learner-columns">
            <div className="learner-primary-column">
              <section className="continue-section" id="my-courses">
                <div className="dashboard-section-heading">
                  <div>
                    <p className="learner-overline">
                      {t(locale, "LÀ OÙ VOUS EN ÊTES", "YOUR LEARNING JOURNEY")}
                    </p>
                    <h2>{t(locale, "Reprenez votre élan", "Pick up where you left off")}</h2>
                  </div>
                  <Link href="/courses">
                    {t(locale, "Découvrir le catalogue", "Explore the catalogue")}{" "}
                    <Icon name="arrow" size={15} />
                  </Link>
                </div>
                {dashboard.courses.length === 0 ? (
                  <div className="empty-courses">
                    <p>
                      {t(
                        locale,
                        "Vous n’avez pas encore de formation active. Vos formations apparaîtront ici après validation de votre inscription.",
                        "You don’t have an active course yet. Your courses will appear here once your enrolment is approved."
                      )}
                    </p>
                    <Link className="button button-small" href="/courses">
                      {t(locale, "Découvrir les formations", "Explore courses")}{" "}
                      <span aria-hidden="true">↗</span>
                    </Link>
                  </div>
                ) : (
                  dashboard.courses.map((course, index) => (
                    <article
                      className="learner-course-card"
                      key={course.id}
                      id={index === 0 ? "lesson" : undefined}
                    >
                      <div
                        className={`learner-course-monogram ${index % 2 === 0 ? "learner-course-green" : "learner-course-lilac"}`}
                      >
                        <span>{initialsFor(course.title)}</span>
                        <i aria-hidden="true">✳</i>
                      </div>
                      <div className="learner-course-info">
                        <div className="learner-course-topline">
                          <span>{t(locale, "FORMATION", "COURSE")}</span>
                          <span>
                            {course.progress}% {t(locale, "terminé", "complete")}
                          </span>
                        </div>
                        <h3>{course.title}</h3>
                        <p>
                          {t(locale, "Avec", "With")} {course.teacher}
                        </p>
                        <div
                          className="progress-track"
                          role="progressbar"
                          aria-label={t(
                            locale,
                            `Progression : ${course.progress}%`,
                            `Progress: ${course.progress}%`
                          )}
                          aria-valuenow={course.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <span style={{ width: `${course.progress}%` }} />
                        </div>
                        <div className="next-lesson">
                          <span>
                            {course.nextLesson
                              ? t(locale, "À SUIVRE", "UP NEXT")
                              : t(locale, "PARCOURS", "COURSE")}
                          </span>
                          {course.nextLesson ??
                            t(
                              locale,
                              "Toutes les leçons sont terminées",
                              "All lessons are complete"
                            )}
                        </div>
                      </div>
                      {course.nextLessonId ? (
                        <Link
                          className="resume-button"
                          href={`/learn/${course.id}/${course.nextLessonId}`}
                          aria-label={t(
                            locale,
                            `Continuer ${course.title}`,
                            `Continue ${course.title}`
                          )}
                        >
                          <Icon name="play" size={16} />
                        </Link>
                      ) : (
                        <span
                          className="resume-button course-complete"
                          role="img"
                          aria-label={t(
                            locale,
                            `${course.title} terminée`,
                            `${course.title} completed`
                          )}
                        >
                          <Icon name="check" size={16} />
                        </span>
                      )}
                      <details className="learner-course-content">
                        <summary>
                          {t(locale, "Voir les cours et ressources", "View lessons and resources")}{" "}
                          <span>
                            {course.totalLessons} {t(locale, "leçons", "lessons")}
                          </span>
                        </summary>
                        {course.modules.map((module) => (
                          <section className="learner-module-content" key={module.id}>
                            <h4>{module.title}</h4>
                            <ul>
                              {module.lessons.map((lesson) => (
                                <li key={lesson.id}>
                                  <Link href={`/learn/${course.id}/${lesson.id}`}>
                                    <span>
                                      {lesson.type === "VIDEO"
                                        ? t(locale, "VIDÉO", "VIDEO")
                                        : lesson.type === "RESOURCE"
                                          ? lesson.assetMimeType?.includes("spreadsheet") ||
                                            lesson.assetMimeType === "application/vnd.ms-excel"
                                            ? "EXCEL"
                                            : lesson.assetMimeType?.includes("word") ||
                                                lesson.assetMimeType === "application/msword"
                                              ? "WORD"
                                              : lesson.assetMimeType?.includes("presentation") ||
                                                  lesson.assetMimeType ===
                                                    "application/vnd.ms-powerpoint"
                                                ? "POWERPOINT"
                                                : lesson.assetMimeType === "application/pdf"
                                                  ? "PDF"
                                                  : t(locale, "DOCUMENT", "DOCUMENT")
                                          : lesson.type === "LIVE"
                                            ? t(locale, "DIRECT", "LIVE")
                                            : t(locale, "COURS", "LESSON")}
                                    </span>
                                    {lesson.title}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </section>
                        ))}
                        {course.liveSessions.length > 0 && (
                          <section className="learner-module-content">
                            <h4>{t(locale, "Sessions en direct", "Live sessions")}</h4>
                            <ul>
                              {course.liveSessions.map((session) => {
                                const now = Date.now();
                                const isOpen =
                                  Date.parse(session.startsAt) - now <= 15 * 60 * 1000 &&
                                  Date.parse(session.endsAt) > now;
                                const sessionLabel = `${session.title} · ${new Date(
                                  session.startsAt
                                ).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "Africa/Ouagadougou"
                                })}`;
                                return (
                                  <li key={session.id}>
                                    {isOpen ? (
                                      <Link href={`/live/${session.id}`}>
                                        <span>{t(locale, "DIRECT", "LIVE")}</span>
                                        {sessionLabel} · {t(locale, "Rejoindre", "Join")}
                                      </Link>
                                    ) : (
                                      <span className="learner-session-upcoming">
                                        <span>{t(locale, "DIRECT", "LIVE")}</span>
                                        {sessionLabel} · {t(locale, "À venir", "Upcoming")}
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        )}
                      </details>
                    </article>
                  ))
                )}
              </section>

              <section className="schedule-section" id="schedule">
                <div className="dashboard-section-heading">
                  <div>
                    <p className="learner-overline">
                      {t(locale, "GARDEZ LE RYTHME", "KEEP UP THE MOMENTUM")}
                    </p>
                    <h2>{t(locale, "Votre semaine", "Your week")}</h2>
                  </div>
                  <a href="#schedule">
                    {t(locale, "Cette semaine", "This week")} <span aria-hidden="true">⌄</span>
                  </a>
                </div>
                <div className="week-card">
                  <div className="week-days">
                    {weekDays.map((item) => (
                      <div
                        className={`week-day${item.current ? " current" : ""}${item.done ? " completed" : ""}`}
                        key={item.day}
                      >
                        <span>{item.day}</span>
                        <strong>{item.date}</strong>
                        <i
                          aria-label={
                            item.done
                              ? t(locale, "Objectif atteint", "Goal achieved")
                              : item.current
                                ? t(locale, "Aujourd’hui", "Today")
                                : t(locale, "À venir", "Upcoming")
                          }
                        >
                          {item.done ? "✓" : item.current ? "•" : ""}
                        </i>
                      </div>
                    ))}
                  </div>
                  <div className="week-summary">
                    <span className="summary-mark">✳</span>
                    <p>
                      <strong>
                        {t(locale, "Votre activité cette semaine", "Your activity this week")}
                      </strong>
                      <br />
                      {t(
                        locale,
                        "Les jours actifs sont calculés à partir de vos leçons.",
                        "Active days are based on your lesson activity."
                      )}
                    </p>
                    <span className="summary-count">
                      {dashboard.stats.learningDaysThisWeek}
                      <span>{t(locale, "jours actifs", "active days")}</span>
                    </span>
                  </div>
                </div>
              </section>
            </div>

            <aside className="learner-aside">
              <section className="live-session">
                <div className="aside-heading">
                  <h2>{t(locale, "À ne pas manquer", "Coming up")}</h2>
                  <span className="live-tag">
                    <i /> {t(locale, "BIENTÔT", "UPCOMING")}
                  </span>
                </div>
                {dashboard.nextLiveSession ? (
                  <>
                    <div className="live-date">
                      <span className="live-date-day">
                        {new Date(dashboard.nextLiveSession.startsAt).toLocaleDateString(
                          locale === "fr" ? "fr-FR" : "en-GB",
                          { day: "2-digit", timeZone: "Africa/Ouagadougou" }
                        )}
                      </span>
                      <span>
                        <strong>
                          {new Date(dashboard.nextLiveSession.startsAt)
                            .toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", {
                              month: "short",
                              timeZone: "Africa/Ouagadougou"
                            })
                            .replace(".", "")
                            .toLocaleUpperCase(locale === "fr" ? "fr-FR" : "en-GB")}
                        </strong>
                        <small>
                          {new Date(dashboard.nextLiveSession.startsAt).toLocaleDateString(
                            locale === "fr" ? "fr-FR" : "en-GB",
                            { weekday: "long", timeZone: "Africa/Ouagadougou" }
                          )}
                        </small>
                      </span>
                    </div>
                    <span className="live-course-label">
                      {dashboard.nextLiveSession.courseTitle}
                    </span>
                    <h3>{dashboard.nextLiveSession.title}</h3>
                    <p>
                      {t(
                        locale,
                        "Votre prochaine session en direct avec votre formation.",
                        "Your next live session for this course."
                      )}
                    </p>
                    <div className="live-details">
                      <span>
                        <Icon name="clock" size={14} />
                        {new Date(dashboard.nextLiveSession.startsAt).toLocaleTimeString(
                          locale === "fr" ? "fr-FR" : "en-GB",
                          { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Ouagadougou" }
                        )}
                      </span>
                      <span>{t(locale, "En ligne", "Online")}</span>
                    </div>
                    {new Date(dashboard.nextLiveSession.startsAt).getTime() - Date.now() <=
                      15 * 60 * 1000 &&
                    new Date(dashboard.nextLiveSession.endsAt).getTime() > Date.now() ? (
                      <Link className="live-action" href={`/live/${dashboard.nextLiveSession.id}`}>
                        {t(locale, "Rejoindre le direct", "Join live session")}{" "}
                        <Icon name="arrow" size={15} />
                      </Link>
                    ) : (
                      <p className="live-join-hint">
                        {t(
                          locale,
                          "La salle ouvrira 15 minutes avant le début.",
                          "The room opens 15 minutes before the start."
                        )}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="no-live-session">
                    {t(
                      locale,
                      "Aucune session en direct à venir pour vos formations.",
                      "No upcoming live sessions for your courses."
                    )}
                  </p>
                )}
              </section>
              <section className="daily-quote">
                <span aria-hidden="true">“</span>
                <blockquote>
                  {t(
                    locale,
                    "Un voyage de mille lieues commence toujours par un premier pas.",
                    "A journey of a thousand miles begins with a single step."
                  )}
                </blockquote>
                <cite>— {t(locale, "Proverbe", "Proverb")}</cite>
                <div className="quote-decoration" aria-hidden="true">
                  ✳
                </div>
              </section>
              <section className="support-card">
                <span className="support-icon">✳</span>
                <div>
                  <strong>{t(locale, "Un accompagnement humain", "Personal support")}</strong>
                  <p>
                    {t(
                      locale,
                      "Une question sur votre parcours ? Nous sommes à votre écoute.",
                      "Have a question about your learning journey? We’re here to help."
                    )}
                  </p>
                  <a href="mailto:contact@iplni.org">
                    {t(locale, "Écrire à l’équipe", "Email our team")}{" "}
                    <Icon name="arrow" size={14} />
                  </a>
                </div>
              </section>
            </aside>
          </div>
          <p className="demo-disclaimer">
            {t(
              locale,
              "Les formations, le suivi de progression et les attestations affichés proviennent de votre espace IPLNI.",
              "Courses, progress tracking and certificates shown here come from your IPLNI account."
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
