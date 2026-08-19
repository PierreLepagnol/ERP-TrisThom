export function destructiveCrmResetEnabled(value?: string) {
  return value === "true";
}

export function requireDestructiveCrmResetEnabled(value?: string) {
  if (!destructiveCrmResetEnabled(value)) {
    throw new Error("La remise à zéro CRM est désactivée. Définissez ALLOW_DESTRUCTIVE_CRM_RESET=true uniquement dans un environnement de développement.");
  }
}
