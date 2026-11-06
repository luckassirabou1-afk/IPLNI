"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { t, useLanguage } from "../../components/language-provider";

type Payment = {
  id: string;
  provider: string;
  providerReference: string | null;
  amount: number;
  currency: string;
  status: "SUBMITTED" | "UNDER_REVIEW";
  submittedAt: string;
  order: {
    reference: string;
    user: { fullName: string; email: string };
    items: Array<{ course: { title: string } }>;
  };
};

type ApiError = { error?: { message?: string } };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
const providerLabels: Record<string, string> = {
  ORANGE_MONEY: "Orange Money",
  MOOV_MONEY: "Moov Money",
  CORIS_BANK: "Coris Bank",
  OTHER: "Autre"
};

function formatAmount(amount: number, currency: string, locale: "fr" | "en"): string {
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB").format(amount)} ${currency === "XOF" ? "FCFA" : currency}`;
}

export default function AdminPaymentsPage() {
  const { locale } = useLanguage();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadPayments = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const url = new URL(`${apiBaseUrl}/api/v1/admin/payments`);
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetch(url, { credentials: "include" });
      const body = (await response.json()) as {
        payments?: Payment[];
        nextCursor?: string | null;
      } & ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "Impossible de charger les paiements.");
      setPayments((current) =>
        cursor ? [...current, ...(body.payments ?? [])] : (body.payments ?? [])
      );
      setNextCursor(body.nextCursor ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le service ne répond pas.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  async function reviewPayment(paymentId: string, decision: "confirm" | "reject", note: string) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/admin/payments/${encodeURIComponent(paymentId)}/review`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, ...(note.trim() ? { note: note.trim() } : {}) })
        }
      );
      const body = (await response.json()) as ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "La décision n’a pas pu être enregistrée.");
      setMessage(
        decision === "confirm"
          ? t(
              locale,
              "Paiement confirmé et accès à la formation activé.",
              "Payment confirmed and course access activated."
            )
          : t(
              locale,
              "Paiement refusé. L’apprenant peut soumettre une nouvelle référence.",
              "Payment declined. The learner can submit a new transaction reference."
            )
      );
      await loadPayments();
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
      <section className="admin-payments-shell">
        <Link className="detail-back" href="/">
          ← {t(locale, "Accueil", "Home")}
        </Link>
        <p className="eyebrow">{t(locale, "GESTION DES INSCRIPTIONS", "ENROLMENT MANAGEMENT")}</p>
        <h1>{t(locale, "Vérification des paiements", "Payment review")}</h1>
        <p className="admin-payments-intro">
          {t(
            locale,
            "Vérifiez le transfert auprès de l’opérateur avant de confirmer. La confirmation active l’accès à la formation.",
            "Verify the transfer with the provider before confirming. Confirmation activates course access."
          )}
        </p>
        <div className="admin-payments-toolbar">
          <span>
            {payments.length}{" "}
            {t(
              locale,
              payments.length === 1 ? "déclaration chargée" : "déclarations chargées",
              payments.length === 1 ? "submission loaded" : "submissions loaded"
            )}
          </span>
          <button
            className="button button-small"
            type="button"
            onClick={() => void loadPayments()}
            disabled={loading}
          >
            {t(locale, "Actualiser", "Refresh")}
          </button>
        </div>
        {error && (
          <p className="admin-payments-error" role="alert">
            {locale === "en" ? "Unable to complete the request. Please try again." : error}{" "}
            {error.includes("Connexion") && (
              <Link href="/login?next=%2Fadmin%2Fpayments">
                {t(locale, "Se connecter", "Sign in")}
              </Link>
            )}
          </p>
        )}
        {message && (
          <p className="admin-payments-success" role="status">
            {message}
          </p>
        )}
        {loading && (
          <p className="catalog-state">
            {t(
              locale,
              "Chargement des déclarations depuis le serveur…",
              "Loading submissions from the server…"
            )}
          </p>
        )}
        {!loading && payments.length === 0 && !error && (
          <div className="admin-payments-empty">
            <span aria-hidden="true">✓</span>
            <h2>{t(locale, "Aucun paiement en attente", "No pending payments")}</h2>
            <p>
              {t(
                locale,
                "Les nouvelles déclarations apparaîtront ici après leur enregistrement.",
                "New payment submissions will appear here."
              )}
            </p>
          </div>
        )}
        <div className="admin-payment-list">
          {payments.map((payment) => (
            <AdminPaymentCard
              key={payment.id}
              payment={payment}
              onReview={reviewPayment}
              locale={locale}
            />
          ))}
        </div>
        {!loading && nextCursor && (
          <button
            className="button admin-load-more"
            type="button"
            disabled={loadingMore}
            onClick={() => void loadPayments(nextCursor)}
          >
            {loadingMore
              ? t(locale, "Chargement…", "Loading…")
              : t(locale, "Charger les déclarations suivantes", "Load more submissions")}
          </button>
        )}
      </section>
    </main>
  );
}

function AdminPaymentCard({
  payment,
  onReview,
  locale
}: {
  payment: Payment;
  onReview: (paymentId: string, decision: "confirm" | "reject", note: string) => Promise<void>;
  locale: "fr" | "en";
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitDecision(decision: "confirm" | "reject") {
    if (decision === "reject" && note.trim().length < 3) return;
    if (
      decision === "confirm" &&
      !window.confirm(
        locale === "fr"
          ? `Confirmer le paiement de ${formatAmount(payment.amount, payment.currency, locale)} pour « ${payment.order.items.map(({ course }) => course.title).join(", ")} » et activer l’accès ?`
          : `Confirm the payment of ${formatAmount(payment.amount, payment.currency, locale)} for "${payment.order.items.map(({ course }) => course.title).join(", ")}" and activate access?`
      )
    )
      return;
    setSubmitting(true);
    try {
      await onReview(payment.id, decision, note);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="admin-payment-card">
      <div className="admin-payment-heading">
        <div>
          <span className="learner-overline">
            {t(locale, "COMMANDE", "ORDER")} {payment.order.reference}
          </span>
          <h2>{payment.order.items.map(({ course }) => course.title).join(", ")}</h2>
        </div>
        <strong>{formatAmount(payment.amount, payment.currency, locale)}</strong>
      </div>
      <dl className="admin-payment-details">
        <div>
          <dt>{t(locale, "Apprenant", "Learner")}</dt>
          <dd>{payment.order.user.fullName}</dd>
        </div>
        <div>
          <dt>{t(locale, "E-mail", "Email")}</dt>
          <dd>
            <a href={`mailto:${payment.order.user.email}`}>{payment.order.user.email}</a>
          </dd>
        </div>
        <div>
          <dt>{t(locale, "Moyen de paiement", "Payment method")}</dt>
          <dd>{providerLabels[payment.provider] ?? payment.provider}</dd>
        </div>
        <div>
          <dt>{t(locale, "Référence de transaction", "Transaction reference")}</dt>
          <dd>{payment.providerReference ?? t(locale, "Non fournie", "Not provided")}</dd>
        </div>
        <div>
          <dt>{t(locale, "Déclaré le", "Submitted on")}</dt>
          <dd>
            {new Date(payment.submittedAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", {
              dateStyle: "medium",
              timeStyle: "short"
            })}
          </dd>
        </div>
        <div>
          <dt>{t(locale, "État", "Status")}</dt>
          <dd>
            {payment.status === "SUBMITTED"
              ? t(locale, "À vérifier", "Needs review")
              : t(locale, "En cours de vérification", "Under review")}
          </dd>
        </div>
      </dl>
      <label className="admin-payment-note">
        {t(locale, "Note de vérification", "Review note")}
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          placeholder={t(
            locale,
            "Motif obligatoire en cas de refus (3 caractères minimum).",
            "A reason is required to reject (at least 3 characters)."
          )}
        />
      </label>
      <div className="admin-payment-actions">
        <button
          type="button"
          className="button"
          disabled={submitting}
          onClick={() => void submitDecision("confirm")}
        >
          {submitting
            ? t(locale, "Enregistrement…", "Saving…")
            : t(locale, "Confirmer le paiement", "Confirm payment")}
        </button>
        <button
          type="button"
          className="admin-reject-button"
          disabled={submitting || note.trim().length < 3}
          onClick={() => void submitDecision("reject")}
        >
          {t(locale, "Refuser la déclaration", "Reject submission")}
        </button>
      </div>
    </article>
  );
}
