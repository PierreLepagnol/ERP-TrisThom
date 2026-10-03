import type { Doc } from "./_generated/dataModel";

export const commercialStatuses = ["nouveau", "devis_a_preparer", "devis_envoye", "accepte", "termine", "refuse", "annule"] as const;
export type CommercialStatus = typeof commercialStatuses[number];
export function normalizeDossierStatus(status: Doc<"requests">["status"]): CommercialStatus {
  if (status === "a_qualifier") return "nouveau";
  if (status === "qualifie") return "devis_a_preparer";
  if (status === "relance") return "devis_envoye";
  return status;
}
export function assertDossierTransition(request: Pick<Doc<"requests">, "status" | "eventDate" | "eventStartTime" | "eventEndTime">, target: CommercialStatus, document: { exists: boolean; sent: boolean }) {
  const previous = normalizeDossierStatus(request.status);
  if (target === previous) return;
  if (target === "devis_envoye" && !document.exists) throw new Error("Créez un devis avant de le marquer comme envoyé.");
  if (target === "accepte") {
    if (!document.sent) throw new Error("Un devis envoyé est nécessaire avant confirmation.");
    if (request.eventDate == null || !request.eventStartTime || !request.eventEndTime) throw new Error("La date et les horaires sont obligatoires avant confirmation.");
  }
  if (target === "termine" && previous !== "accepte") throw new Error("Confirmez la prestation avant de la terminer.");
}

export function validateDossierFields(fields: { eventDate?: number; eventStartTime?: string; eventEndTime?: string; guestCount?: number }) {
  if (fields.eventDate != null && (!Number.isFinite(fields.eventDate) || Math.abs(fields.eventDate) > 8.64e15)) throw new Error("La date de prestation est invalide.");
  if (fields.guestCount != null && (!Number.isInteger(fields.guestCount) || fields.guestCount < 1)) throw new Error("Le nombre de personnes doit être un entier positif.");
  for (const time of [fields.eventStartTime, fields.eventEndTime]) if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Les horaires doivent être au format HH:MM.");
}
