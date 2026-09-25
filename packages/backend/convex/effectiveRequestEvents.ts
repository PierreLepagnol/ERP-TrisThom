import type { Doc, Id } from "./_generated/dataModel";

export type EventFields = Pick<Doc<"requestEvents">, "label" | "date" | "startTime" | "endTime" | "address" | "guestCount" | "serviceType" | "format" | "notes" | "status">;
export type EffectiveRequestEvent = EventFields & { _id: Id<"requestEvents"> | null; historical: boolean };
type LegacyRequest = Pick<Doc<"requests">, "status" | "eventType" | "eventDate" | "eventStartTime" | "eventEndTime" | "eventAddress" | "venue" | "guestCount" | "specialNeeds">;

export function legacyRequestEvent(request: LegacyRequest): EventFields {
  return {
    label: request.eventType || "Prestation actuelle",
    date: request.eventDate, startTime: request.eventStartTime, endTime: request.eventEndTime,
    address: request.eventAddress || request.venue, guestCount: request.guestCount,
    serviceType: request.eventType, notes: request.specialNeeds,
    status: request.status === "annule" ? "annulee" : ["accepte", "termine"].includes(request.status) ? "confirmee" : "demandee",
  };
}

// The presence of real prestations suppresses the legacy fallback, including when all are cancelled.
export function effectiveRequestEvents(request: LegacyRequest, rows: readonly (EventFields & { _id: Id<"requestEvents"> })[]): EffectiveRequestEvent[] {
  return rows.length ? rows.map(row => ({ ...row, historical: false }))
    : [{ ...legacyRequestEvent(request), _id: null, historical: true }];
}
