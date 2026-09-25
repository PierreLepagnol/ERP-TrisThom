import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { findMissingInformation } from "./requestQualification";

import { effectiveRequestEvents, type EventFields } from "./effectiveRequestEvents";

export async function loadEffectiveRequestEvents(ctx: QueryCtx | MutationCtx, request: Doc<"requests">) {
  return effectiveRequestEvents(request, await requestEventRows(ctx, request._id));
}

export function validateEvent(fields: EventFields): EventFields {
  if (!fields.label.trim()) throw new Error("Renseignez le libellé de la prestation.");
  if (fields.date !== undefined && (!Number.isFinite(fields.date) || Number.isNaN(new Date(fields.date).getTime()))) throw new Error("Date invalide.");
  if (fields.guestCount !== undefined && (!Number.isSafeInteger(fields.guestCount) || fields.guestCount < 0)) throw new Error("Nombre de personnes invalide.");
  for (const time of [fields.startTime, fields.endTime]) {
    if (time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Horaire invalide.");
  }
  return {
    label: fields.label.trim(), date: fields.date,
    startTime: fields.startTime, endTime: fields.endTime,
    address: fields.address?.trim() || undefined, guestCount: fields.guestCount,
    serviceType: fields.serviceType?.trim() || undefined,
    format: fields.format?.trim() || undefined, notes: fields.notes?.trim() || undefined, status: fields.status,
  };
}

export async function requestEventRows(ctx: QueryCtx | MutationCtx, requestId: Id<"requests">) {
  // Read all prestations of this dossier, never a truncated subset used as its summary.
  const rows = await ctx.db.query("requestEvents").withIndex("by_requestId_and_date", q => q.eq("requestId", requestId)).collect();
  return rows.sort((a, b) =>
    (a.date ?? Infinity) - (b.date ?? Infinity)
    || (a.startTime ?? "24:00").localeCompare(b.startTime ?? "24:00")
    || a._creationTime - b._creationTime
    || a._id.localeCompare(b._id));
}

export async function syncRequestEventSummary(ctx: MutationCtx, requestId: Id<"requests">) {
  const request = await ctx.db.get(requestId);
  if (!request) throw new Error("Dossier introuvable.");
  const events = await requestEventRows(ctx, requestId);
  if (!events.length) return; // Reading or editing a legacy dossier never migrates it.
  const first = events.find(event => event.status !== "annulee");
  // No active prestation means no legacy date/location, rather than a cancelled one.
  const summary = {
    eventDate: first?.date, eventStartTime: first?.startTime, eventEndTime: first?.endTime,
    eventAddress: first?.address, venue: first?.address,
    guestCount: first?.guestCount, eventType: first?.serviceType,
  };
  await ctx.db.patch(requestId, {
    ...summary, missingInformation: findMissingInformation({ ...request, ...summary }), updatedAt: Date.now(),
  });
}

const legacyFieldMap = {
  eventDate: "date", eventStartTime: "startTime", eventEndTime: "endTime",
  eventAddress: "address", guestCount: "guestCount", eventType: "serviceType",
} as const;

// Keep the existing dossier editor compatible once prestations are materialized.
export async function applyLegacyEventChanges(ctx: MutationCtx, request: Doc<"requests">, changes: Partial<Doc<"requests">>) {
  const events = await requestEventRows(ctx, request._id);
  if (!events.length) return false;
  const patch: Partial<EventFields> = {};
  for (const key of Object.keys(legacyFieldMap) as Array<keyof typeof legacyFieldMap>) {
    if (Object.prototype.hasOwnProperty.call(changes, key) && changes[key] !== request[key]) {
      Object.assign(patch, { [legacyFieldMap[key]]: changes[key] });
    }
  }
  if (Object.keys(patch).length) {
    const first = events.find(event => event.status !== "annulee");
    if (!first) throw new Error("Toutes les prestations sont annulées. Modifiez une prestation pour la réactiver.");
    const fields = validateEvent({ ...first, ...patch });
    await ctx.db.patch(first._id, { ...fields, updatedAt: Date.now() });
  }
  return true;
}
