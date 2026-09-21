export function findMissingInformation(args: {
  contactEmail?: string;
  contactPhone?: string;
  eventAddress?: string;
  venue?: string;
  eventDate?: number;
  eventType?: string;
  guestCount?: number;
  eventStartTime?: string;
  eventEndTime?: string;
  budgetCents?: number;
  budgetPerPersonCents?: number;
  dietaryRequirements?: string;
  specialNeeds?: string;
  staffingNeeds?: string;
}) {
  const missing: string[] = [];
  if (!args.eventDate) missing.push("Date de l’événement");
  if (!args.eventAddress && !args.venue) missing.push("Lieu ou adresse");
  if (!args.guestCount) missing.push("Nombre de personnes");
  if (!args.eventType) missing.push("Type de prestation");
  if (!args.budgetCents && !args.budgetPerPersonCents) missing.push("Budget");
  if (!args.eventStartTime || !args.eventEndTime) missing.push("Horaires");
  if (!args.contactEmail && !args.contactPhone) missing.push("Coordonnées du client");
  if (!args.dietaryRequirements && !args.specialNeeds && !args.staffingNeeds) {
    missing.push("Besoins particuliers");
  }
  return missing;
}
