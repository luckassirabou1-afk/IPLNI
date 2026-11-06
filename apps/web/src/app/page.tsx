"use client";

import Image from "next/image";
import Link from "next/link";
import FeaturedCourses from "./components/featured-courses";
import { t, useLanguage } from "./components/language-provider";

export default function HomePage() {
  const { locale } = useLanguage();
  const benefits = [
    {
      icon: "◷",
      title: t(locale, "À votre rythme", "At your own pace"),
      description: t(
        locale,
        "Apprenez où vous voulez et quand vous le souhaitez, depuis votre téléphone ou ordinateur.",
        "Learn wherever and whenever you want, from your phone or computer."
      )
    },
    {
      icon: "▤",
      title: t(locale, "Des cours vivants", "Engaging courses"),
      description: t(
        locale,
        "Vidéos, documents pratiques, quiz et séances en direct avec vos formateurs.",
        "Videos, practical resources, quizzes and live sessions with your trainers."
      )
    },
    {
      icon: "✦",
      title: t(locale, "Une attestation utile", "A valuable certificate"),
      description: t(
        locale,
        "Valorisez les compétences acquises avec une attestation adaptée à votre formation.",
        "Showcase your skills with a certificate tailored to your course."
      )
    }
  ];
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="IPLNI, accueil">
          <Image src="/iplni-logo.png" alt="" width={48} height={48} priority />
          <span className="brand-copy">
            <strong>IPLNI</strong>
            <small>{t(locale, "APPRENDRE · PROGRESSER", "LEARN · GROW")}</small>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Navigation principale">
          <a href="#formations">{t(locale, "Formations", "Courses")}</a>
          <a href="#approche">{t(locale, "Notre approche", "Our approach")}</a>
          <a href="#institut">{t(locale, "L’institut", "The institute")}</a>
        </nav>
        <div className="header-actions">
          <Link className="login-link" href="/login">
            {t(locale, "Se connecter", "Sign in")}
          </Link>
          <Link className="button button-small" href="/register">
            {t(locale, "Commencer", "Get started")} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-dot" />{" "}
            {t(locale, "L’institut qui vous fait grandir", "An institute to help you grow")}
          </p>
          <h1>
            {locale === "fr" ? (
              <>
                Vos ambitions
                <br />
                méritent <em>une voie.</em>
              </>
            ) : (
              <>
                Your ambitions
                <br />
                deserve <em>a path.</em>
              </>
            )}
          </h1>
          <p className="hero-description">
            {t(
              locale,
              "Des formations en ligne pensées pour votre avenir. Apprenez une langue, développez vos compétences et avancez à votre rythme, accompagné par des formateurs passionnés.",
              "Online courses designed for your future. Learn a language, build your skills and move forward at your own pace with passionate trainers by your side."
            )}
          </p>
          <div className="hero-actions">
            <a className="button" href="#formations">
              {t(locale, "Explorer les formations", "Explore courses")}{" "}
              <span aria-hidden="true">↗</span>
            </a>
            <a className="text-link" href="#approche">
              <span className="play-icon" aria-hidden="true">
                ▶
              </span>{" "}
              {t(locale, "Découvrir IPLNI", "Discover IPLNI")}
            </a>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack" aria-hidden="true">
              <span>AM</span>
              <span>FK</span>
              <span>JD</span>
              <span className="avatar-plus">+</span>
            </div>
            <p>
              <strong>
                {t(
                  locale,
                  "Votre prochain chapitre commence ici.",
                  "Your next chapter starts here."
                )}
              </strong>
              <br />
              {t(
                locale,
                "Rejoignez une communauté qui avance.",
                "Join a community moving forward."
              )}
            </p>
          </div>
        </div>
        <div className="hero-art">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="hero-image-wrap">
            <Image
              src="/learning-illustration.svg"
              alt={t(
                locale,
                "Une fille et un garçon en tenue élégante apprennent ensemble autour d’un livre",
                "A girl and a boy in elegant clothing learn together around a book"
              )}
              width={650}
              height={600}
              priority
              className="hero-image"
            />
          </div>
          <div className="floating-card live-card">
            <span className="live-indicator" />
            <span>
              <strong>{t(locale, "En direct", "Live")}</strong>
              <small>{t(locale, "Atelier de conversation", "Conversation workshop")}</small>
            </span>
            <span className="card-arrow" aria-hidden="true">
              ↗
            </span>
          </div>
          <div className="floating-card progress-card">
            <span className="progress-icon">✦</span>
            <span>
              <strong>{t(locale, "Un pas de plus", "One step further")}</strong>
              <small>{t(locale, "Votre avenir se construit ici", "Build your future here")}</small>
            </span>
          </div>
        </div>
        <div className="hero-stamp" aria-hidden="true">
          <span>
            {locale === "fr" ? (
              <>
                LE SAVOIR
                <br />
                VOUS OUVRE
                <br />
                DES PORTES
              </>
            ) : (
              <>
                KNOWLEDGE
                <br />
                OPENS
                <br />
                DOORS
              </>
            )}
          </span>
          <b>✳</b>
        </div>
      </section>

      <section className="trust-strip" id="institut">
        <p>
          {t(
            locale,
            "APPRENDRE AUTREMENT, AVANCER POUR DE VRAI",
            "LEARN DIFFERENTLY, MOVE FORWARD"
          )}
        </p>
        <div>
          <span className="trust-symbol">◎</span>{" "}
          {t(locale, "Formations accessibles partout", "Courses accessible anywhere")}
        </div>
        <div>
          <span className="trust-symbol">✳</span>{" "}
          {t(locale, "Accompagnement humain", "Personal support")}
        </div>
        <div>
          <span className="trust-symbol">◇</span>{" "}
          {t(locale, "Attestation de fin de parcours", "Course completion certificate")}
        </div>
      </section>

      <section className="benefits section-shell" id="approche">
        <div className="section-heading">
          <p className="eyebrow">
            {t(locale, "UNE FORMATION QUI VOUS RESSEMBLE", "LEARNING THAT FITS YOU")}
          </p>
          <h2>
            {locale === "fr" ? (
              <>
                Apprendre devrait
                <br />
                vous <em>ressembler.</em>
              </>
            ) : (
              <>
                Learning should
                <br />
                <em>feel like you.</em>
              </>
            )}
          </h2>
          <p className="section-intro">
            {t(
              locale,
              "Pas de parcours imposé. Juste les bons outils, les bonnes personnes et un chemin conçu pour vous.",
              "No one-size-fits-all path. Just the right tools, the right people and a journey designed for you."
            )}
          </p>
        </div>
        <div className="benefit-list">
          {benefits.map((benefit, index) => (
            <article className="benefit-item" key={benefit.title}>
              <span className={`benefit-icon benefit-icon-${index + 1}`} aria-hidden="true">
                {benefit.icon}
              </span>
              <div>
                <h3>{benefit.title}</h3>
                <p>{benefit.description}</p>
              </div>
              <span className="benefit-number">0{index + 1}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="courses-section" id="formations">
        <div className="section-shell">
          <div className="courses-heading">
            <div>
              <p className="eyebrow">
                {t(locale, "CHOISISSEZ VOTRE PROCHAINE ÉTAPE", "CHOOSE YOUR NEXT STEP")}
              </p>
              <h2>
                {locale === "fr" ? (
                  <>
                    Le bon départ,
                    <br />
                    <em>c’est maintenant.</em>
                  </>
                ) : (
                  <>
                    The right start
                    <br />
                    <em>is right now.</em>
                  </>
                )}
              </h2>
            </div>
            <Link className="text-link course-link" href="/courses">
              {t(locale, "Toutes les formations", "All courses")} <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <FeaturedCourses />
          <p className="payment-note">
            <span aria-hidden="true">✓</span>{" "}
            {t(
              locale,
              "Paiement en FCFA · Accès après validation de votre inscription",
              "Pay in XOF · Access after your enrolment is approved"
            )}
          </p>
        </div>
      </section>

      <section className="closing-cta">
        <div className="closing-mark" aria-hidden="true">
          ✳
        </div>
        <p className="eyebrow">
          {t(locale, "VOTRE AVENIR N’ATTEND PAS", "YOUR FUTURE CAN’T WAIT")}
        </p>
        <h2>
          {locale === "fr" ? (
            <>
              La suite de votre histoire
              <br />
              commence <em>aujourd’hui.</em>
            </>
          ) : (
            <>
              The next chapter
              <br />
              starts <em>today.</em>
            </>
          )}
        </h2>
        <Link className="button button-light" href="/register">
          {t(locale, "Rejoindre IPLNI", "Join IPLNI")} <span aria-hidden="true">↗</span>
        </Link>
        <span className="cta-note">
          {t(
            locale,
            "Simplement. À votre rythme. À votre façon.",
            "Simply. At your pace. Your way."
          )}
        </span>
      </section>

      <footer className="site-footer">
        <Link className="brand footer-brand" href="/" aria-label="IPLNI, accueil">
          <Image src="/iplni-logo.png" alt="" width={42} height={42} />
          <span className="brand-copy">
            <strong>IPLNI</strong>
            <small>{t(locale, "APPRENDRE · PROGRESSER", "LEARN · GROW")}</small>
          </span>
        </Link>
        <p>{t(locale, "Le savoir ouvre des portes.", "Knowledge opens doors.")}</p>
        <span>
          © {new Date().getFullYear()} IPLNI.{" "}
          {t(locale, "Tous droits réservés.", "All rights reserved.")}
        </span>
      </footer>
    </main>
  );
}
