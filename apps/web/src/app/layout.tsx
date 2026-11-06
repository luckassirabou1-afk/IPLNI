import type { Metadata } from "next";
import { LanguageProvider } from "./components/language-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "IPLNI — Apprendre, progresser",
  description:
    "Des formations en ligne accessibles partout pour apprendre, développer vos compétences et valoriser votre parcours avec IPLNI.",
  referrer: "no-referrer",
  icons: {
    icon: "/iplni-logo.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
