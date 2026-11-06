"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { t, useLanguage } from "./language-provider";

type FeaturedCourse = {
  id: string;
  title: string;
  slug: string;
  description: string;
  level: string | null;
  priceAmount: number;
  currency: string;
  accessDurationDays: number;
  trainerNames: string[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function FeaturedCourses() {
  const { locale } = useLanguage();
  const [courses, setCourses] = useState<FeaturedCourse[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${apiBaseUrl}/api/v1/courses`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Course catalog unavailable");
        return (await response.json()) as { courses: FeaturedCourse[] };
      })
      .then((data) => {
        if (active) setCourses(data.courses.slice(0, 3));
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p className="home-courses-state">
        {t(
          locale,
          "Le catalogue n’est pas disponible pour le moment. Réessayez bientôt.",
          "The course catalogue is unavailable right now. Please try again soon."
        )}
      </p>
    );
  }
  if (courses.length === 0) {
    return (
      <div className="home-courses-empty">
        <p>
          {t(
            locale,
            "Les parcours publiés par nos formateurs apparaîtront ici.",
            "Courses published by our trainers will appear here."
          )}
        </p>
        <Link className="button" href="/courses">
          {t(locale, "Consulter le catalogue", "Browse the catalogue")}{" "}
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="course-grid">
      {courses.map((course, index) => (
        <article className="course-card" key={course.id}>
          <div className={`course-art ${["lavender", "mint", "peach"][index % 3]}`}>
            <span className="course-category">
              {course.level ?? t(locale, "FORMATION", "COURSE")}
            </span>
            <span className="course-letter" aria-hidden="true">
              {course.title.slice(0, 1)}
            </span>
            <span className="course-art-caption">
              IPLNI <b>·</b> {t(locale, "FORMATION", "COURSE")}
            </span>
          </div>
          <div className="course-content">
            <div className="course-meta">
              <span>
                {course.accessDurationDays} {t(locale, "jours d’accès", "days of access")}
              </span>
              <span>{course.trainerNames[0] ?? t(locale, "Équipe IPLNI", "IPLNI Team")}</span>
            </div>
            <h3>{course.title}</h3>
            <p>{course.description}</p>
            <div className="course-footer">
              <strong>
                {new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB").format(
                  course.priceAmount
                )}{" "}
                {course.currency === "XOF" ? "FCFA" : course.currency}
              </strong>
              <Link
                href={`/courses/${encodeURIComponent(course.slug)}`}
                aria-label={t(
                  locale,
                  `Découvrir la formation ${course.title}`,
                  `Discover ${course.title}`
                )}
              >
                ↗
              </Link>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
