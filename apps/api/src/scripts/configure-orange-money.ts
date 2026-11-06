import "dotenv/config";
import { PaymentProvider } from "@prisma/client";
import { normalizeBurkinaPhoneNumber } from "../phone.js";
import { prisma } from "../prisma.js";

async function main(): Promise<void> {
  const accountReference = process.env.ORANGE_MONEY_ACCOUNT_REFERENCE;
  const accountHolderName = process.env.ORANGE_MONEY_ACCOUNT_HOLDER_NAME?.trim();

  if (
    !accountReference ||
    !accountHolderName ||
    accountHolderName.length < 3 ||
    accountHolderName.length > 160
  ) {
    throw new Error(
      "Définissez ORANGE_MONEY_ACCOUNT_REFERENCE et ORANGE_MONEY_ACCOUNT_HOLDER_NAME dans l’environnement local de l’API."
    );
  }

  const normalizedReference = normalizeBurkinaPhoneNumber(accountReference);
  const methodData = {
    provider: PaymentProvider.ORANGE_MONEY,
    displayName: "Orange Money",
    accountHolderName,
    accountReference: normalizedReference,
    instructions:
      "Effectuez le transfert du montant exact, puis indiquez la référence de transaction reçue. Ne communiquez jamais votre code PIN.",
    isActive: true
  };

  await prisma.paymentMethod.upsert({
    where: {
      provider_accountReference: {
        provider: PaymentProvider.ORANGE_MONEY,
        accountReference: normalizedReference
      }
    },
    create: methodData,
    update: methodData
  });

  console.info("Le moyen de paiement Orange Money a été configuré dans PostgreSQL.");
}

main()
  .catch((error: unknown) => {
    console.error(
      "La configuration Orange Money a échoué.",
      error instanceof Error ? error.message : "Erreur inconnue."
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
