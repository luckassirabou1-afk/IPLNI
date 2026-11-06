"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { t, useLanguage } from "../../components/language-provider";

type PaymentStatus =
  "SUBMITTED" | "UNDER_REVIEW" | "CONFIRMED" | "REJECTED" | "REFUND_PENDING" | "REFUNDED";
type Order = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  expiresAt: string;
  items: Array<{ course: { title: string; slug: string } }>;
  payments: Array<{ status: PaymentStatus; submittedAt: string }>;
};
type PaymentMethod = {
  id: string;
  provider: string;
  displayName: string;
  accountHolderName: string;
  accountReference: string;
  instructions: string | null;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
function paymentLabel(status: PaymentStatus, locale: "fr" | "en"): string {
  const labels: Record<PaymentStatus, [string, string]> = {
    SUBMITTED: [
      "Déclaration reçue, en attente de vérification",
      "Payment submitted, awaiting review"
    ],
    UNDER_REVIEW: ["Paiement en cours de vérification", "Payment is being reviewed"],
    CONFIRMED: ["Paiement confirmé", "Payment confirmed"],
    REJECTED: [
      "Paiement refusé, vous pouvez soumettre une nouvelle référence",
      "Payment declined. You may submit a new transaction reference"
    ],
    REFUND_PENDING: ["Remboursement en cours de traitement", "Refund is being processed"],
    REFUNDED: ["Paiement remboursé", "Payment refunded"]
  };
  return labels[status][locale === "fr" ? 0 : 1];
}

function formatAmount(amount: number, currency: string, locale: "fr" | "en"): string {
  return `${new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB").format(amount)} ${currency === "XOF" ? "FCFA" : currency}`;
}

export default function CheckoutPage() {
  const { locale } = useLanguage();
  const params = useParams<{ reference: string }>();
  const reference = params.reference;
  const [order, setOrder] = useState<Order | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [providerReference, setProviderReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    async function loadCheckout() {
      try {
        const [orderResponse, methodsResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/api/v1/orders/${encodeURIComponent(reference)}`, {
            credentials: "include"
          }),
          fetch(`${apiBaseUrl}/api/v1/payments/methods`)
        ]);
        if (orderResponse.status === 401) {
          if (active) setError("Connectez-vous au compte qui a créé cette commande.");
          return;
        }
        const orderBody = (await orderResponse.json()) as {
          order?: Order;
          error?: { message?: string };
        };
        const methodsBody = (await methodsResponse.json()) as { methods?: PaymentMethod[] };
        if (!orderResponse.ok || !orderBody.order)
          throw new Error(orderBody.error?.message ?? "Commande introuvable.");
        if (!methodsResponse.ok)
          throw new Error("Impossible de charger les moyens de paiement configurés.");
        if (active) {
          setOrder(orderBody.order);
          setMethods(methodsBody.methods ?? []);
          setSelectedMethod(methodsBody.methods?.[0]?.id ?? "");
        }
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Le parcours de paiement ne peut pas être chargé."
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadCheckout();
    return () => {
      active = false;
    };
  }, [reference]);

  async function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMethod) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/orders/${encodeURIComponent(reference)}/payments`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethodId: selectedMethod, providerReference })
        }
      );
      const body = (await response.json()) as { message?: string; error?: { message?: string } };
      if (!response.ok) {
        setError(body.error?.message ?? "La déclaration de paiement a échoué.");
        return;
      }
      setSuccess(body.message ?? "Déclaration envoyée.");
      setProviderReference("");
      const refreshed = await fetch(
        `${apiBaseUrl}/api/v1/orders/${encodeURIComponent(reference)}`,
        { credentials: "include" }
      );
      if (!refreshed.ok)
        throw new Error(
          "La déclaration est enregistrée, mais le statut de commande n’a pas pu être actualisé."
        );
      const refreshedBody = (await refreshed.json()) as { order: Order };
      setOrder(refreshedBody.order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible d’envoyer la déclaration.");
    } finally {
      setSubmitting(false);
    }
  }

  const lastPayment = order?.payments[0];
  const orderExpired = order ? new Date(order.expiresAt) <= new Date() : false;
  const canSubmit = Boolean(
    order &&
    order.status === "PENDING" &&
    !orderExpired &&
    methods.length &&
    (!lastPayment || lastPayment.status === "REJECTED")
  );

  return (
    <main className="checkout-page">
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
          <Link href="/dashboard">{t(locale, "Mon espace", "My space")}</Link>
        </nav>
      </header>
      <section className="checkout-layout">
        <div className="checkout-main">
          <Link className="detail-back" href="/courses">
            ← {t(locale, "Retour au catalogue", "Back to catalogue")}
          </Link>
          <p className="eyebrow">{t(locale, "INSCRIPTION IPLNI", "IPLNI ENROLMENT")}</p>
          <h1>
            {locale === "fr" ? (
              <>
                Finalisez votre
                <br />
                <em>inscription.</em>
              </>
            ) : (
              <>
                Complete your
                <br />
                <em>enrolment.</em>
              </>
            )}
          </h1>
          <p className="checkout-intro">
            {t(
              locale,
              "Le paiement s’effectue directement auprès du moyen de paiement affiché. IPLNI vérifie ensuite votre référence manuellement.",
              "Pay directly using the payment details shown. IPLNI will then manually verify your transaction reference."
            )}
          </p>
          {loading && (
            <p className="catalog-state">
              {t(locale, "Chargement de votre commande…", "Loading your order…")}
            </p>
          )}
          {!loading && error && (
            <p className="checkout-error" role="alert">
              {locale === "en"
                ? "Unable to load this order. Please check your sign-in and try again."
                : error}{" "}
              {error.includes("Connectez-vous") && (
                <Link href={`/login?next=${encodeURIComponent(`/checkout/${reference}`)}`}>
                  {t(locale, "Se connecter", "Sign in")}
                </Link>
              )}
            </p>
          )}
          {order && (
            <>
              <section className="order-summary">
                <span className="learner-overline">
                  {t(locale, "VOTRE COMMANDE", "YOUR ORDER")}
                </span>
                <h2>
                  {order.items[0]?.course.title ?? t(locale, "Formation IPLNI", "IPLNI course")}
                </h2>
                <div>
                  <span>{t(locale, "Référence commande", "Order reference")}</span>
                  <strong>{order.reference}</strong>
                </div>
                <div>
                  <span>{t(locale, "Montant à régler", "Amount due")}</span>
                  <strong>{formatAmount(order.amount, order.currency, locale)}</strong>
                </div>
                <div>
                  <span>{t(locale, "Expiration", "Expires")}</span>
                  <strong>
                    {new Date(order.expiresAt).toLocaleString(locale === "fr" ? "fr-FR" : "en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    })}
                  </strong>
                </div>
              </section>
              {lastPayment && (
                <p
                  className={`payment-status payment-status-${lastPayment.status.toLowerCase()}`}
                  role="status"
                >
                  {paymentLabel(lastPayment.status, locale)}.
                </p>
              )}
              {order.status !== "PENDING" && (
                <p className="payment-status">
                  {t(locale, "Statut de commande", "Order status")}: {order.status}.
                </p>
              )}
              {orderExpired && (
                <p className="checkout-error">
                  {t(
                    locale,
                    "Cette commande a expiré. Revenez à la formation pour créer une nouvelle commande.",
                    "This order has expired. Return to the course to create a new order."
                  )}
                </p>
              )}
              {canSubmit && (
                <>
                  <section className="payment-method-list">
                    <h2>1. {t(locale, "Effectuez votre paiement", "Make your payment")}</h2>
                    {methods.map((method) => (
                      <label
                        className={`payment-method${selectedMethod === method.id ? " selected" : ""}`}
                        key={method.id}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={method.id}
                          checked={selectedMethod === method.id}
                          onChange={() => setSelectedMethod(method.id)}
                        />
                        <span>
                          <strong>{method.displayName}</strong>
                          <small>
                            {t(locale, "Au nom de", "Account holder:")} {method.accountHolderName}
                          </small>
                          <b>{method.accountReference}</b>
                          {method.instructions && <small>{method.instructions}</small>}
                        </span>
                      </label>
                    ))}
                  </section>
                  <form className="payment-submit-form" onSubmit={submitPayment}>
                    <h2>2. {t(locale, "Déclarez votre transaction", "Submit your transaction")}</h2>
                    <label>
                      {t(locale, "Référence de transaction", "Transaction reference")}
                      <input
                        value={providerReference}
                        onChange={(event) => setProviderReference(event.target.value)}
                        minLength={3}
                        maxLength={120}
                        required
                        placeholder={t(
                          locale,
                          "Référence communiquée par votre opérateur",
                          "Reference provided by your payment provider"
                        )}
                      />
                    </label>
                    <p>
                      {t(
                        locale,
                        "Ne transmettez jamais votre code secret ou votre code PIN. Une capture d’écran seule ne suffit pas comme preuve de paiement.",
                        "Never share your password or PIN. A screenshot alone is not sufficient proof of payment."
                      )}
                    </p>
                    {error && (
                      <p className="checkout-error" role="alert">
                        {error}
                      </p>
                    )}
                    {success && (
                      <p className="checkout-success" role="status">
                        {success}
                      </p>
                    )}
                    <button
                      className="button"
                      type="submit"
                      disabled={submitting || !selectedMethod}
                    >
                      {submitting
                        ? t(locale, "Envoi…", "Sending…")
                        : t(locale, "Envoyer pour vérification", "Submit for review")}{" "}
                      <span aria-hidden="true">↗</span>
                    </button>
                  </form>
                </>
              )}
              {!loading && methods.length === 0 && order.status === "PENDING" && (
                <p className="payment-empty">
                  {t(
                    locale,
                    "Aucun moyen de paiement n’est configuré pour l’instant. Contactez IPLNI avant d’effectuer un paiement ; aucun numéro ou compte ne doit être supposé.",
                    "No payment method is configured yet. Contact IPLNI before paying; do not guess an account number or details."
                  )}
                </p>
              )}
              {lastPayment && lastPayment.status !== "REJECTED" && (
                <p className="payment-help">
                  {t(
                    locale,
                    "La formation restera verrouillée jusqu’à la confirmation du paiement par un administrateur.",
                    "Course access remains locked until an administrator confirms your payment."
                  )}
                </p>
              )}
            </>
          )}
        </div>
        <aside className="checkout-aside">
          <span className="checkout-aside-symbol">✳</span>
          <h2>
            {locale === "fr" ? (
              <>
                Un paiement
                <br />
                clair, un accès
                <br />
                <em>bien accompagné.</em>
              </>
            ) : (
              <>
                Clear payment,
                <br />
                supported
                <br />
                <em>learning.</em>
              </>
            )}
          </h2>
          <ol>
            <li>
              {t(locale, "Payez avec les coordonnées affichées.", "Pay using the details shown.")}
            </li>
            <li>
              {t(
                locale,
                "Soumettez la référence de transaction.",
                "Submit your transaction reference."
              )}
            </li>
            <li>
              {t(
                locale,
                "Un administrateur vérifie le paiement.",
                "An administrator reviews your payment."
              )}
            </li>
            <li>
              {t(
                locale,
                "Votre accès est activé après confirmation.",
                "Your access is activated once payment is confirmed."
              )}
            </li>
          </ol>
          <p>
            {t(
              locale,
              "IPLNI ne vous demandera jamais de communiquer votre code PIN.",
              "IPLNI will never ask you to share your PIN."
            )}
          </p>
        </aside>
      </section>
    </main>
  );
}
