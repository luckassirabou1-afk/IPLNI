"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { t, useLanguage } from "../../components/language-provider";

type Provider = "ORANGE_MONEY" | "MOOV_MONEY" | "CORIS_BANK" | "OTHER";
type PaymentMethod = {
  id: string;
  provider: Provider;
  displayName: string;
  accountHolderName: string;
  accountReference: string;
  instructions: string | null;
  isActive: boolean;
};
type MethodForm = Omit<PaymentMethod, "id">;
type ApiError = { error?: { message?: string } };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
const providers: Array<{ value: Provider; label: string }> = [
  { value: "ORANGE_MONEY", label: "Orange Money" },
  { value: "MOOV_MONEY", label: "Moov Money" },
  { value: "CORIS_BANK", label: "Coris Bank" },
  { value: "OTHER", label: "Autre" }
];

function emptyForm(): MethodForm {
  return {
    provider: "ORANGE_MONEY",
    displayName: "",
    accountHolderName: "",
    accountReference: "",
    instructions: "",
    isActive: true
  };
}

export default function AdminPaymentMethodsPage() {
  const { locale } = useLanguage();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [form, setForm] = useState<MethodForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadMethods = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/payment-methods`, {
        credentials: "include"
      });
      const body = (await response.json()) as { methods?: PaymentMethod[] } & ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "Impossible de charger les moyens de paiement.");
      setMethods(body.methods ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le service ne répond pas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMethods();
  }, [loadMethods]);

  function editMethod(method: PaymentMethod) {
    setEditingId(method.id);
    setForm({
      provider: method.provider,
      displayName: method.displayName,
      accountHolderName: method.accountHolderName,
      accountReference: method.accountReference,
      instructions: method.instructions ?? "",
      isActive: method.isActive
    });
    setError("");
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
    setError("");
    setMessage("");
  }

  async function saveMethod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentMethod = methods.find(({ id }) => id === editingId);
    if (
      currentMethod?.isActive &&
      !form.isActive &&
      !window.confirm(
        `Désactiver « ${currentMethod.displayName} » ? Il ne sera plus proposé pour les nouveaux paiements.`
      )
    )
      return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/admin/payment-methods${editingId ? `/${encodeURIComponent(editingId)}` : ""}`,
        {
          method: editingId ? "PATCH" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, instructions: form.instructions?.trim() || null })
        }
      );
      const body = (await response.json()) as ApiError;
      if (!response.ok)
        throw new Error(body.error?.message ?? "Impossible d’enregistrer ce moyen de paiement.");
      resetForm();
      setMessage(
        editingId
          ? t(locale, "Moyen de paiement mis à jour.", "Payment method updated.")
          : t(locale, "Moyen de paiement ajouté.", "Payment method added.")
      );
      await loadMethods();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Le service ne répond pas.");
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
            <small>{t(locale, "ESPACE ADMINISTRATEUR", "ADMIN SPACE")}</small>
          </span>
        </Link>
        <nav>
          <Link href="/admin">{t(locale, "Vue d’ensemble", "Overview")}</Link>
          <Link href="/admin/payments">{t(locale, "Paiements", "Payments")}</Link>
          <Link href="/admin/courses">{t(locale, "Formations", "Courses")}</Link>
          <Link href="/admin/trainers">{t(locale, "Formateurs", "Trainers")}</Link>
          <Link href="/trainer">{t(locale, "Espace formateur", "Trainer space")}</Link>
          <Link href="/dashboard?view=learner">
            {t(locale, "Espace apprenant", "Learner space")}
          </Link>
        </nav>
      </header>
      <section className="admin-payments-shell">
        <Link className="detail-back" href="/admin/payments">
          ← {t(locale, "Vérification des paiements", "Payment review")}
        </Link>
        <p className="eyebrow">
          {t(locale, "CONFIGURATION DES ENCAISSEMENTS", "PAYMENT CONFIGURATION")}
        </p>
        <h1>{t(locale, "Moyens de paiement", "Payment methods")}</h1>
        <p className="admin-payments-intro">
          {t(
            locale,
            "Les comptes actifs sont affichés aux apprenants au moment du paiement. Les modifications sont enregistrées dans PostgreSQL et journalisées.",
            "Active accounts are shown to learners at checkout. Changes are stored in PostgreSQL and added to the audit log."
          )}
        </p>

        <section className="admin-method-form-section">
          <h2>
            {editingId
              ? t(locale, "Modifier le moyen de paiement", "Edit payment method")
              : t(locale, "Ajouter un moyen de paiement", "Add payment method")}
          </h2>
          {error && (
            <p className="admin-payments-error" role="alert">
              {locale === "en"
                ? "Unable to save or load the payment method. Please try again."
                : error}{" "}
              {error.includes("Connexion") && (
                <Link href="/login?next=%2Fadmin%2Fpayment-methods">
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
          <form className="admin-method-form" onSubmit={saveMethod}>
            <label>
              {t(locale, "Opérateur ou réseau", "Provider or network")}
              <select
                value={form.provider}
                onChange={(event) => {
                  const selectedProvider = providers.find(
                    ({ value }) => value === event.target.value
                  );
                  if (selectedProvider)
                    setForm((value) => ({ ...value, provider: selectedProvider.value }));
                }}
              >
                {providers.map((provider) => (
                  <option value={provider.value} key={provider.value}>
                    {provider.value === "OTHER" ? t(locale, "Autre", "Other") : provider.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t(locale, "Nom affiché", "Display name")}
              <input
                value={form.displayName}
                onChange={(event) =>
                  setForm((value) => ({ ...value, displayName: event.target.value }))
                }
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            <label>
              {t(locale, "Nom du titulaire", "Account holder name")}
              <input
                value={form.accountHolderName}
                onChange={(event) =>
                  setForm((value) => ({ ...value, accountHolderName: event.target.value }))
                }
                minLength={2}
                maxLength={160}
                required
              />
            </label>
            <label>
              {t(locale, "Numéro ou référence du compte", "Account number or reference")}
              <input
                value={form.accountReference}
                onChange={(event) =>
                  setForm((value) => ({ ...value, accountReference: event.target.value }))
                }
                minLength={3}
                maxLength={160}
                autoComplete="off"
                required
              />
            </label>
            <label className="admin-method-instructions">
              {t(locale, "Instructions pour l’apprenant", "Instructions for learners")}
              <textarea
                value={form.instructions ?? ""}
                onChange={(event) =>
                  setForm((value) => ({ ...value, instructions: event.target.value }))
                }
                maxLength={500}
              />
            </label>
            <label className="admin-method-active">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((value) => ({ ...value, isActive: event.target.checked }))
                }
              />
              {t(locale, "Disponible pour les nouveaux paiements", "Available for new payments")}
            </label>
            <div className="admin-payment-actions">
              <button className="button" type="submit" disabled={saving}>
                {saving
                  ? t(locale, "Enregistrement…", "Saving…")
                  : editingId
                    ? t(locale, "Enregistrer les modifications", "Save changes")
                    : t(locale, "Ajouter le moyen de paiement", "Add payment method")}
              </button>
              {editingId && (
                <button
                  className="admin-reject-button"
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                >
                  {t(locale, "Annuler", "Cancel")}
                </button>
              )}
            </div>
          </form>
        </section>

        <div className="admin-payments-toolbar">
          <span>
            {t(locale, "Comptes configurés", "Configured accounts")} ({methods.length})
          </span>
          <button
            className="button button-small"
            type="button"
            onClick={() => void loadMethods()}
            disabled={loading}
          >
            {t(locale, "Actualiser", "Refresh")}
          </button>
        </div>
        {loading && (
          <p className="catalog-state">
            {t(locale, "Chargement depuis PostgreSQL…", "Loading from PostgreSQL…")}
          </p>
        )}
        {!loading && methods.length === 0 && !error && (
          <div className="admin-payments-empty">
            <h2>{t(locale, "Aucun moyen configuré", "No payment methods configured")}</h2>
            <p>
              {t(
                locale,
                "Ajoutez un compte de paiement réel pour le proposer aux apprenants.",
                "Add a real payment account to make it available to learners."
              )}
            </p>
          </div>
        )}
        <div className="admin-payment-list">
          {methods.map((method) => (
            <article className="admin-method-card" key={method.id}>
              <div className="admin-payment-heading">
                <div>
                  <span className="learner-overline">
                    {providers.find(({ value }) => value === method.provider)?.label ??
                      method.provider}
                  </span>
                  <h2>{method.displayName}</h2>
                </div>
                <span className={`admin-method-status${method.isActive ? " is-active" : ""}`}>
                  {method.isActive
                    ? t(locale, "Actif", "Active")
                    : t(locale, "Désactivé", "Disabled")}
                </span>
              </div>
              <dl className="admin-payment-details">
                <div>
                  <dt>{t(locale, "Titulaire", "Account holder")}</dt>
                  <dd>{method.accountHolderName}</dd>
                </div>
                <div>
                  <dt>{t(locale, "Compte", "Account")}</dt>
                  <dd>{method.accountReference}</dd>
                </div>
                <div>
                  <dt>{t(locale, "Instructions", "Instructions")}</dt>
                  <dd>
                    {method.instructions ||
                      t(
                        locale,
                        "Aucune instruction supplémentaire.",
                        "No additional instructions."
                      )}
                  </dd>
                </div>
              </dl>
              <button
                className="admin-reject-button"
                type="button"
                onClick={() => editMethod(method)}
              >
                {t(locale, "Modifier", "Edit")}
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
