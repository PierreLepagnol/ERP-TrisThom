import { v } from "convex/values";
import { legacyEventId, legacySourceId, octoberStart, octoberEnd, projectRequest, requestSnapshot, reviewDetails, type SyncCandidate } from "./googleCalendarPlanning";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";

export const testSourceId = "reprise-oct-2026:2026-10-09:points-communs";
// Stable, valid Google base32hex ID: never generate another ID on a retry.
export const testEventId = "bc20261009pointscommuns";

async function target(ctx: QueryCtx | MutationCtx): Promise<Doc<"requests">> {
  const rows = await ctx.db.query("requests")
    .withIndex("by_source_and_externalSourceId", q => q.eq("source", "manuel").eq("externalSourceId", testSourceId))
    .take(2);
  if (rows.length !== 1) throw new Error("Le dossier de test doit exister en un seul exemplaire.");
  const request = rows[0]!;
  if (request.status !== "accepte" || request.deletedAt !== undefined || request.archivedAt !== undefined) {
    throw new Error("Le dossier de test doit être confirmé, non supprimé et non archivé.");
  }
  const date = request.eventDate;
  const day = date === undefined || !Number.isFinite(date) ? "" : new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(date));
  if (day !== "2026-10-09" || request.eventStartTime !== "15:00" || request.eventEndTime !== "17:00") {
    throw new Error("Le dossier de test doit être daté du 09/10/2026, de 15:00 à 17:00 (Europe/Paris).");
  }
  if (request.organizationName !== "Points communs" || request.guestCount !== 31
    || !["Théâtre des Louvrais, Pontoise", "Théâtre des Louvrais, place de la Paix, Pontoise"].includes(request.eventAddress ?? "")) {
    throw new Error("Le client, les 31 repas ou le lieu du dossier ne correspondent pas au test autorisé.");
  }
  if (request.googleCalendarEventId && request.googleCalendarEventId !== testEventId) {
    throw new Error("Le dossier possède déjà un autre événement Google : création bloquée pour éviter un doublon.");
  }
  return request;
}

export const getTestDossier = internalQuery({
  args: {},
  handler: async ctx => {
    const request = await target(ctx);
    const attempt = await ctx.db.query("googleCalendarTestAttempts")
      .withIndex("by_externalSourceId", q => q.eq("externalSourceId", testSourceId)).unique();
    return { requestId: request._id, location: request.eventAddress!,
      alreadyLinked: Boolean(request.googleCalendarEventId),
      calendarFingerprint: attempt?.calendarFingerprint ?? null };
  },
});

// Convex transactions serialize concurrent claims. A claim never expires: after
// an uncertain Google response, retry GET only, never another events.insert.
export const claimTestCreation = internalMutation({
  args: { requestId: v.id("requests"), calendarFingerprint: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const request = await target(ctx);
    if (request._id !== args.requestId) throw new Error("Le dossier de test a changé.");
    const attempt = await ctx.db.query("googleCalendarTestAttempts")
      .withIndex("by_externalSourceId", q => q.eq("externalSourceId", testSourceId)).unique();
    if (attempt) {
      if (attempt.calendarFingerprint !== args.calendarFingerprint) throw new Error("L'agenda configuré a changé : création bloquée.");
      return false;
    }
    if (request.googleCalendarEventId || request.calendarSyncStatus === "synced") return false;
    await ctx.db.insert("googleCalendarTestAttempts", {
      externalSourceId: testSourceId, requestId: request._id,
      calendarFingerprint: args.calendarFingerprint, attemptedAt: Date.now(),
    });
    return true;
  },
});

export const recordTestSuccess = internalMutation({
  args: { requestId: v.id("requests"), calendarFingerprint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await target(ctx);
    const attempt = await ctx.db.query("googleCalendarTestAttempts")
      .withIndex("by_externalSourceId", q => q.eq("externalSourceId", testSourceId)).unique();
    if (request._id !== args.requestId || !attempt || attempt.requestId !== request._id
      || attempt.calendarFingerprint !== args.calendarFingerprint) {
      throw new Error("La réservation de synchronisation ne correspond pas au dossier ou à l'agenda.");
    }
    await ctx.db.patch(request._id, { googleCalendarEventId: testEventId, calendarSyncStatus: "synced" });
    return null;
  },
});

// General Planning sync. Only requests are prestations; no requestEvents are read.



export async function loadCandidate(ctx: QueryCtx | MutationCtx, requestId: Id<"requests">): Promise<SyncCandidate> {
  const request = await ctx.db.get(requestId);
  if (!request) throw new Error("Dossier introuvable.");
  const quotes = await ctx.db.query("quotes").withIndex("by_requestId", q => q.eq("requestId", requestId)).take(2);
  if (quotes.length > 1) throw new Error("Plusieurs devis courants : vérification du dossier nécessaire.");
  const quote = quotes[0];
  const version = quote?.currentVersionId ? await ctx.db.get(quote.currentVersionId) : null;
  const logistics = version?.quoteId === quote?._id ? version?.logistics ?? "" : "";
  const state = await ctx.db.query("googleCalendarSyncStates").withIndex("by_requestId", q => q.eq("requestId", requestId)).unique();
  const legacy = request.source === "manuel" && request.externalSourceId === legacySourceId
    ? await ctx.db.query("googleCalendarTestAttempts").withIndex("by_externalSourceId", q => q.eq("externalSourceId", legacySourceId)).unique()
    : null;
  if (legacy && legacy.requestId !== requestId) throw new Error("La réservation du test appartient à un autre dossier.");
  if (state && legacy && state.calendarFingerprint !== legacy.calendarFingerprint) throw new Error("Les réservations Google ne correspondent pas au même agenda.");
  if (state && request.googleCalendarEventId && state.eventId !== request.googleCalendarEventId) throw new Error("Identifiants de synchronisation incohérents.");
  return {
    requestId, snapshot: requestSnapshot(request, logistics), projection: projectRequest(request, logistics), review: reviewDetails(request),
    savedEventId: request.googleCalendarEventId ?? null,
    reservedEventId: state?.eventId ?? (legacy ? legacyEventId : null),
    calendarFingerprint: state?.calendarFingerprint ?? legacy?.calendarFingerprint ?? null,
    creationAttempted: state?.creationAttempted ?? Boolean(legacy),
    removedByErp: state?.removedByErp ?? false,
  };
}

export const getSyncCandidate = internalQuery({
  args: { requestId: v.id("requests") },
  handler: (ctx, args): Promise<SyncCandidate> => loadCandidate(ctx, args.requestId),
});

export const octoberCandidates = internalQuery({
  args: {},
  handler: async (ctx): Promise<SyncCandidate[]> => {
    const requests = await ctx.db.query("requests")
      .withIndex("by_eventDate", q => q.gte("eventDate", octoberStart).lt("eventDate", octoberEnd)).take(501);
    if (requests.length > 500) throw new Error("Plus de 500 dossiers en octobre : preview bloqué pour éviter une sélection tronquée.");
    return await Promise.all(requests.map(request => loadCandidate(ctx, request._id)));
  },
});

const syncArgs = { requestId: v.id("requests"), snapshot: v.string(), eventId: v.string(), calendarFingerprint: v.string() };

async function verifyCandidate(ctx: QueryCtx | MutationCtx, args: { requestId: Id<"requests">; snapshot: string; eventId: string; calendarFingerprint: string; leaseUntil?: number }) {
  const candidate = await loadCandidate(ctx, args.requestId);
  if (args.leaseUntil !== undefined) {
    const job = await ctx.db.query("googleCalendarJobs").withIndex("by_requestId", q => q.eq("requestId", args.requestId)).unique();
    const enabled = (await ctx.db.query("googleCalendarAutomation").unique())?.enabled;
    if (!enabled || job?.status !== "running" || job.leaseUntil !== args.leaseUntil || args.leaseUntil <= Date.now()) throw new Error("Tentative automatique expirée ou désactivée.");
  }
  if (candidate.snapshot !== args.snapshot || (!candidate.projection.body && !(args.leaseUntil && ["annule", "refuse"].includes(candidate.review.status)))) throw new Error("Dossier modifié ou devenu inéligible : refaire le preview.");
  if (candidate.calendarFingerprint && candidate.calendarFingerprint !== args.calendarFingerprint) throw new Error("L'agenda configuré a changé : synchronisation bloquée.");
  if ((candidate.savedEventId && candidate.savedEventId !== args.eventId)
    || (candidate.reservedEventId && candidate.reservedEventId !== args.eventId)) throw new Error("Événement Google incohérent : synchronisation bloquée.");
  if (!/^[a-v0-9]{5,1024}$/.test(args.eventId)) throw new Error("Identifiant Google invalide.");
  return candidate;
}

// One durable event ID per request. Manual retries only reconcile by GET/PATCH.
// A leased automatic worker may retry insertion after GET 404, always with
// the reserved ID. It never generates a replacement event ID.
export const prepareSync = internalMutation({
  args: { ...syncArgs, reserveCreation: v.boolean(), leaseUntil: v.optional(v.number()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const candidate = await verifyCandidate(ctx, args);
    const state = await ctx.db.query("googleCalendarSyncStates").withIndex("by_requestId", q => q.eq("requestId", args.requestId)).unique();
    const canCreate = args.reserveCreation && !candidate.savedEventId && (!candidate.creationAttempted || args.leaseUntil !== undefined);
    if (!state) {
      await ctx.db.insert("googleCalendarSyncStates", {
        requestId: args.requestId, eventId: args.eventId, calendarFingerprint: args.calendarFingerprint,
        creationAttempted: candidate.creationAttempted || canCreate || !args.reserveCreation,
      });

    } else if (canCreate || !args.reserveCreation) {
      await ctx.db.patch(state._id, { creationAttempted: true });
    }
    return canCreate;
  },
});

export const recordSyncSuccess = internalMutation({
  args: { ...syncArgs, leaseUntil: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await verifyCandidate(ctx, args);
    const state = await ctx.db.query("googleCalendarSyncStates").withIndex("by_requestId", q => q.eq("requestId", args.requestId)).unique();
    if (!state || state.eventId !== args.eventId || state.calendarFingerprint !== args.calendarFingerprint) throw new Error("Réservation de synchronisation absente ou incohérente.");
    await ctx.db.patch(state._id, { removedByErp: false });
    await ctx.db.patch(args.requestId, { googleCalendarEventId: args.eventId, calendarSyncStatus: "synced" });
    return null;
  },
});

export const recordRemoval = internalMutation({
  args: { ...syncArgs, leaseUntil: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    await verifyCandidate(ctx, args);
    const state = await ctx.db.query("googleCalendarSyncStates").withIndex("by_requestId", q => q.eq("requestId", args.requestId)).unique();
    if (state) await ctx.db.patch(state._id, { removedByErp: true });
    // Preserve the ID/reservation forever: never generate a replacement ID.
    await ctx.db.patch(args.requestId, { calendarSyncStatus: "synced" });
    return null;
  },
});


