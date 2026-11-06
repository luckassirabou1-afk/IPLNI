export function normalizeBurkinaPhoneNumber(value: string): string {
  const normalized = value.replace(/[\s()-]/g, "");
  if (!/^(?:\+226)?\d{8}$/.test(normalized)) {
    throw new Error(
      "ORANGE_MONEY_ACCOUNT_REFERENCE doit être un numéro burkinabè à 8 chiffres, avec ou sans +226."
    );
  }
  return normalized.startsWith("+226") ? normalized : `+226${normalized}`;
}
