"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { t, useLanguage } from "../../components/language-provider";

type LiveSession = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  courseTitle: string;
  meetingUrl: string;
  roomName?: string;
  domain?: string;
  displayName: string;
};
type ApiError = { error?: { message?: string; code?: string } };
type JitsiApi = { dispose: () => void };
type JitsiOptions = {
  roomName: string;
  parentNode: HTMLElement;
  userInfo: { displayName: string };
  configOverwrite: Record<string, boolean>;
  width: string;
  height: string;
};
type JitsiConstructor = new (domain: string, options: JitsiOptions) => JitsiApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiConstructor;
  }
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function LiveSessionPage() {
  const { locale } = useLanguage();
  const params = useParams<{ sessionId: string }>();
  const roomRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roomError, setRoomError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadSession() {
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/v1/learner/live-sessions/${encodeURIComponent(params.sessionId)}`,
          { credentials: "include" }
        );
        const body = (await response.json()) as { session?: LiveSession } & ApiError;
        if (!response.ok)
          throw new Error(body.error?.message ?? "Impossible d’accéder à cette session.");
        if (active) setSession(body.session ?? null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Le service ne répond pas.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadSession();
    return () => {
      active = false;
    };
  }, [params.sessionId]);

  useEffect(() => {
    if (!session?.domain || !session.roomName || !roomRef.current) return;
    const domain = session.domain;
    const roomName = session.roomName;
    let active = true;
    let api: JitsiApi | null = null;
    const script = document.createElement("script");
    script.src = `https://${domain}/external_api.js`;
    script.async = true;
    script.onload = () => {
      if (!active) return;
      if (!window.JitsiMeetExternalAPI || !roomRef.current) {
        setRoomError(
          "L’outil de visioconférence n’a pas pu démarrer. Actualisez la page pour réessayer."
        );
        return;
      }
      try {
        api = new window.JitsiMeetExternalAPI(domain, {
          roomName,
          parentNode: roomRef.current,
          userInfo: { displayName: session.displayName },
          configOverwrite: { prejoinPageEnabled: true },
          width: "100%",
          height: "100%"
        });
      } catch {
        setRoomError(
          "La salle vidéo n’a pas pu être ouverte. Vérifiez votre connexion et réessayez."
        );
      }
    };
    script.onerror = () => {
      if (active)
        setRoomError("Impossible de charger Jitsi Meet. Vérifiez votre connexion internet.");
    };
    document.head.appendChild(script);
    return () => {
      active = false;
      api?.dispose();
      script.remove();
    };
  }, [session]);

  return (
    <main className="live-page">
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
      <section className="live-shell">
        <Link className="detail-back" href="/dashboard">
          ← {t(locale, "Retour à mon espace", "Back to my space")}
        </Link>
        {loading && (
          <p className="catalog-state">
            {t(
              locale,
              "Vérification de votre accès à la salle…",
              "Checking your access to the room…"
            )}
          </p>
        )}
        {!loading && error && (
          <section className="live-message">
            <p className="eyebrow">{t(locale, "SESSION EN DIRECT", "LIVE SESSION")}</p>
            <h1>{t(locale, "La salle n’est pas disponible", "The meeting room is unavailable")}</h1>
            <p role="alert">
              {locale === "en"
                ? "This live session is unavailable. Check your enrolment or the session schedule."
                : error}
            </p>
            {error.includes("Connexion") && (
              <Link
                className="button"
                href={`/login?next=${encodeURIComponent(`/live/${params.sessionId}`)}`}
              >
                {t(locale, "Se connecter", "Sign in")}
              </Link>
            )}
          </section>
        )}
        {session && (
          <>
            <p className="eyebrow">
              {t(locale, "SESSION EN DIRECT", "LIVE SESSION")} · {session.courseTitle}
            </p>
            <h1>{session.title}</h1>
            <p className="live-time">
              {new Date(session.startsAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Africa/Ouagadougou"
              })}
            </p>
            {roomError && (
              <p className="live-room-error" role="alert">
                {roomError}
              </p>
            )}
            {session.domain && session.roomName ? (
              <>
                <div
                  className="live-room-frame"
                  ref={roomRef}
                  aria-label={t(
                    locale,
                    "Salle de visioconférence Jitsi Meet",
                    "Jitsi Meet video conference room"
                  )}
                />
                <p className="live-privacy-note">
                  {t(
                    locale,
                    "La visioconférence est fournie par Jitsi Meet. Autorisez le micro et la caméra dans votre navigateur si vous souhaitez intervenir.",
                    "Video conferencing is provided by Jitsi Meet. Allow microphone and camera access in your browser if you want to participate."
                  )}
                </p>
              </>
            ) : (
              <a className="button" href={session.meetingUrl} target="_blank" rel="noreferrer">
                {t(locale, "Rejoindre le direct", "Join the live session")}
              </a>
            )}
          </>
        )}
      </section>
    </main>
  );
}
