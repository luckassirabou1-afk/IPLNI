"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type Locale = "fr" | "en";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const storageKey = "iplni-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("fr");

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(storageKey);
    const browserLocale = window.navigator.language.toLowerCase().startsWith("en") ? "en" : "fr";
    const initialLocale =
      savedLocale === "en" || savedLocale === "fr" ? savedLocale : browserLocale;
    setLocale(initialLocale);
    document.documentElement.lang = initialLocale;
  }, []);

  function selectLocale(nextLocale: Locale) {
    window.localStorage.setItem(storageKey, nextLocale);
    document.documentElement.lang = nextLocale;
    setLocale(nextLocale);
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale: selectLocale }}>
      {children}
      <LanguageSwitcher />
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider.");
  return context;
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();
  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={locale === "fr" ? "Choisir la langue" : "Choose language"}
    >
      <button type="button" onClick={() => setLocale("fr")} aria-pressed={locale === "fr"}>
        FR
      </button>
      <span aria-hidden="true">|</span>
      <button type="button" onClick={() => setLocale("en")} aria-pressed={locale === "en"}>
        EN
      </button>
    </div>
  );
}

export function t(locale: Locale, french: string, english: string): string {
  return locale === "fr" ? french : english;
}
