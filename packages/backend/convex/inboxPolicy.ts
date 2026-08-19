export type ParsedEmailDetails = {
  contactName?: string;
  contactPhone?: string;
  organizationName?: string;
  eventDate?: number;
  eventStartTime?: string;
  eventAddress?: string;
  eventType?: string;
  guestCount?: number;
  budgetCents?: number;
  budgetPerPersonCents?: number;
  specialNeeds?: string;
};

type ExistingRequest = {
  contactName: string;
  contactPhone?: string;
  organizationName?: string;
  eventDate?: number;
  eventStartTime?: string;
  eventAddress?: string;
  eventType?: string;
  guestCount?: number;
  budgetCents?: number;
  budgetPerPersonCents?: number;
  specialNeeds?: string;
};

const commercialFields = [
  "contactName",
  "contactPhone",
  "organizationName",
  "eventDate",
  "eventStartTime",
  "eventAddress",
  "eventType",
  "guestCount",
  "budgetCents",
  "budgetPerPersonCents",
  "specialNeeds",
] as const;

export function inboxExternalId(messageId: string | undefined, uid: number) {
  const normalizedMessageId = messageId?.trim();
  return normalizedMessageId ? `message-id:${normalizedMessageId}` : `imap:INBOX:${uid}`;
}

export function emailImportEnabled(value?: string) {
  return value === "true";
}

export function inboxUidsAfterCursor(uids: number[], lastSeenUid: number, limit: number) {
  return uids.filter((uid) => uid > lastSeenUid).slice(0, limit);
}

export function shouldReviewIncomingEmail({ is1001Traiteur, triage, hasMatchingContact }: {
  is1001Traiteur: boolean;
  triage: "request" | "review" | "ignore";
  hasMatchingContact: boolean;
}) {
  if (triage === "ignore") return { decision: "ignore" as const };
  if (is1001Traiteur) return { decision: "review" as const, reason: "1001traiteur_requires_validation" };
  if (hasMatchingContact) return { decision: "review" as const, reason: "email_match_requires_validation" };
  if (triage === "review") return { decision: "review" as const, reason: "message_requires_validation" };
  return { decision: "create" as const };
}

function value(value: string | number | undefined) {
  return value === undefined ? "" : String(value).trim();
}

export function commercialChangeSuggestions(existing: ExistingRequest, parsed: ParsedEmailDetails) {
  return commercialFields.flatMap((field) => {
    const proposedValue = value(parsed[field]);
    if (!proposedValue) return [];
    const currentValue = value(existing[field]);
    return currentValue === proposedValue ? [] : [{ field, currentValue, proposedValue }];
  });
}
