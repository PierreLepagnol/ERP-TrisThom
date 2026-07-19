import type { LocalRequest } from "@/lib/local-crm";

export type QualificationCriterion = {
  id: "date" | "location" | "guestCount" | "service" | "budget" | "schedule" | "contact" | "requirements";
  label: string;
  complete: boolean;
};

export type RequestNextAction = {
  title: string;
  description: string;
  kind: "contact" | "qualify" | "quote" | "send_quote" | "follow_up" | "prepare_service" | "archive" | "review_quote";
};

export function getRequestQualification(request: Pick<LocalRequest, "contactEmail" | "contactPhone" | "eventDate" | "eventAddress" | "venue" | "eventType" | "guestCount" | "eventStartTime" | "eventEndTime" | "budgetCents" | "budgetPerPersonCents" | "dietaryRequirements" | "specialNeeds" | "staffingNeeds">): QualificationCriterion[] {
  return [
    { id: "date", label: "Date de l’événement", complete: Boolean(request.eventDate) },
    { id: "location", label: "Lieu ou adresse", complete: Boolean(request.eventAddress || request.venue) },
    { id: "guestCount", label: "Nombre de personnes", complete: Boolean(request.guestCount) },
    { id: "service", label: "Type de prestation", complete: Boolean(request.eventType) },
    { id: "budget", label: "Budget", complete: Boolean(request.budgetCents || request.budgetPerPersonCents) },
    { id: "schedule", label: "Horaires", complete: Boolean(request.eventStartTime && request.eventEndTime) },
    { id: "contact", label: "Coordonnées du client", complete: Boolean(request.contactEmail || request.contactPhone) },
    { id: "requirements", label: "Besoins particuliers", complete: Boolean(request.dietaryRequirements || request.specialNeeds || request.staffingNeeds) },
  ];
}

export function getMissingQualificationInformation(request: Parameters<typeof getRequestQualification>[0]) {
  return getRequestQualification(request).filter((criterion) => !criterion.complete).map((criterion) => criterion.label);
}

export function getRequestNextAction(request: LocalRequest, now = Date.now()): RequestNextAction {
  const qualification = getRequestQualification(request);
  const missingCount = qualification.filter((criterion) => !criterion.complete).length;
  const hasOverdueFollowUp = request.followUps.some((followUp) => !followUp.completedAt && followUp.dueAt <= now);

  if (request.archivedAt) return { title: "Dossier archivé", description: "Le statut métier est conservé dans les archives.", kind: "archive" };
  if (["refuse", "annule"].includes(request.status)) return { title: "Archiver le dossier", description: "Le dossier est terminé et peut être rangé sans perdre son statut métier.", kind: "archive" };
  if (request.status === "accepte" || request.quote?.status === "accepte") return request.handledAt ? { title: "Archiver le dossier", description: "La prestation est confirmée et le dossier peut être rangé.", kind: "archive" } : { title: "Confirmer la prestation", description: "Le devis est accepté : confirmez l’organisation de l’événement.", kind: "prepare_service" };
  if (missingCount > 0) return { title: "Contacter le client", description: `${missingCount} information${missingCount > 1 ? "s" : ""} reste${missingCount > 1 ? "nt" : ""} à demander avant le devis.`, kind: "contact" };
  if (["nouveau", "a_qualifier"].includes(request.status)) return { title: "Qualifier la demande", description: "Toutes les informations nécessaires sont présentes.", kind: "qualify" };
  if (request.quote?.status === "pret") return { title: "Envoyer le devis", description: "Le devis est prêt à être partagé avec le client.", kind: "send_quote" };
  if (request.status === "relance" && hasOverdueFollowUp) return { title: "Relancer le client", description: "Une relance est arrivée à échéance.", kind: "follow_up" };
  if (request.status === "devis_envoye" || request.quote?.status === "envoye" || request.status === "relance") return { title: "Attendre ou programmer une relance", description: hasOverdueFollowUp ? "Une relance mérite votre attention." : "Le devis est en attente de réponse client.", kind: "follow_up" };
  if (request.status === "qualifie") return { title: "Préparer le devis", description: "La demande est qualifiée et peut être chiffrée.", kind: "quote" };
  return { title: "Finaliser le devis", description: "Le brouillon peut être revu avant son envoi.", kind: "review_quote" };
}
