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
  return value?.trim().toLowerCase() === "true";
}

export function inboxUidsAfterCursor(uids: number[], lastSeenUid: number, limit: number) {
  return uids.filter((uid) => uid > lastSeenUid).slice(0, limit);
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
