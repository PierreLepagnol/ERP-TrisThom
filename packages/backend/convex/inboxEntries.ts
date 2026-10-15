import { calendarDb } from "./googleCalendarTracking";
import { paginationOptsValidator } from "convex/server";
import { matchesInboxCandidate } from "./inboxCandidatePolicy";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

async function requireUser(ctx: Parameters<typeof authComponent.safeGetAuthUser>[0]) { if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Vous devez être connecté."); }

async function attachEntry(ctx: MutationCtx, entry: Doc<"inboxMessages">, requestId: Id<"requests">, label: string, position?: number) {
  const linked = await ctx.db.query("inboxRequestLinks").withIndex("by_inboxMessageId_and_requestId", q => q.eq("inboxMessageId", entry._id).eq("requestId", requestId)).unique();
  if (linked) return;
  const now = Date.now();
  let emailMessageId: Id<"emailMessages"> | undefined;
  if (entry.source !== "directus") {
    const messageId = entry.messageId ?? entry.externalId;
    const existing = await ctx.db.query("emailMessages").withIndex("by_messageId", q => q.eq("messageId", messageId)).unique();
    emailMessageId = existing?._id ?? await ctx.db.insert("emailMessages", { requestId, direction: "inbound", messageId, subject: entry.subject, body: entry.body ?? "", senderEmail: entry.senderEmail, attachmentNames: entry.attachmentNames, sentAt: entry.receivedAt ?? now });
  }
  await ctx.db.insert("inboxRequestLinks", { inboxMessageId: entry._id, requestId, emailMessageId, position, createdAt: now });
  await ctx.db.insert("requestHistory", { requestId, label, createdAt: now });
}
export const list = query({ args: { processed: v.boolean() }, handler: async (ctx, args) => { await requireUser(ctx); const rows = (await ctx.db.query("inboxMessages").take(500)).filter(row => args.processed ? row.reviewStatus !== "pending" : row.reviewStatus === "pending").sort((a, b) => (b.receivedAt ?? b.createdAt) - (a.receivedAt ?? a.createdAt)); return await Promise.all(rows.map(async entry => ({ ...entry, requestIds: [...new Set([entry.requestId, ...(await ctx.db.query("inboxRequestLinks").withIndex("by_inboxMessageId_and_requestId", q => q.eq("inboxMessageId", entry._id)).take(100)).map(link => link.requestId)].filter((id): id is Id<"requests"> => id !== undefined))], analysis: await ctx.db.query("inboxAnalyses").withIndex("by_inboxMessageId", q => q.eq("inboxMessageId", entry._id)).unique() }))); } });
export const candidates = query({
  args: { search: v.string(), history: v.boolean(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    // Scan bounded pages: no search index exists, and older matches must remain reachable.
    const result = await ctx.db.query("requests").order("desc").paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.filter(request => matchesInboxCandidate(request, args.search, args.history)).map(request => ({
        _id: request._id, contactName: request.contactName, contactEmail: request.contactEmail,
        contactPhone: request.contactPhone, organizationName: request.organizationName,
        eventType: request.eventType, eventDate: request.eventDate,
        eventStartTime: request.eventStartTime, eventEndTime: request.eventEndTime,
        eventAddress: request.eventAddress, guestCount: request.guestCount,
        budgetCents: request.budgetCents, budgetPerPersonCents: request.budgetPerPersonCents,
        specialNeeds: request.specialNeeds, status: request.status, archivedAt: request.archivedAt,
      })),
    };
  },
});
export const pendingCount = query({ args: {}, handler: async ctx => { await requireUser(ctx); return (await ctx.db.query("inboxMessages").take(10_000)).filter(row => row.reviewStatus === "pending").length; } });
export const ignore = mutation({ args: { inboxMessageId: v.id("inboxMessages") }, handler: async (ctx, { inboxMessageId }) => { await requireUser(ctx); const entry = await ctx.db.get(inboxMessageId); if (!entry || entry.reviewStatus !== "pending") throw new Error("Entrée déjà traitée ou introuvable."); await ctx.db.patch(entry._id, { outcome: "ignored", reviewStatus: "ignored" }); return null; } });
export const attach = mutation({ args: { inboxMessageId: v.id("inboxMessages"), requestId: v.id("requests") }, handler: async (ctx, args) => { await requireUser(ctx); const entry = await ctx.db.get(args.inboxMessageId); const request = await ctx.db.get(args.requestId); if (!entry || entry.reviewStatus !== "pending" || !request || request.deletedAt) throw new Error("Entrée ou dossier introuvable."); await attachEntry(ctx, entry, args.requestId, "E-mail rattaché manuellement"); await ctx.db.patch(entry._id, { outcome: "created", reviewStatus: "attached", requestId: args.requestId }); return null; } });

const createArgs = { inboxMessageId: v.id("inboxMessages"), contactName: v.string(), contactEmail: v.optional(v.string()), contactPhone: v.optional(v.string()), organizationName: v.optional(v.string()), eventType: v.optional(v.string()), eventDate: v.optional(v.number()), eventStartTime: v.optional(v.string()), eventEndTime: v.optional(v.string()), eventAddress: v.optional(v.string()), guestCount: v.optional(v.number()), budgetCents: v.optional(v.number()), budgetPerPersonCents: v.optional(v.number()), specialNeeds: v.optional(v.string()), adminNotes: v.optional(v.string()) };
export const createRequest = mutation({ args: createArgs, handler: async (ctx, args) => { await requireUser(ctx); const entry = await ctx.db.get(args.inboxMessageId); if (!entry || entry.reviewStatus !== "pending") throw new Error("Entrée déjà traitée ou introuvable."); const now = Date.now(); const requestId = await calendarDb(ctx).insert("requests", { source: entry.source === "directus" ? "directus" : "email", externalSourceId: entry.source === "directus" ? entry.externalId.replace(/^directus:/, "") : undefined, status: "a_qualifier", contactName: args.contactName, contactEmail: args.contactEmail, contactPhone: args.contactPhone, organizationName: args.organizationName, eventType: args.eventType, eventDate: args.eventDate, eventStartTime: args.eventStartTime, eventEndTime: args.eventEndTime, eventAddress: args.eventAddress, guestCount: args.guestCount, budgetCents: args.budgetCents, budgetPerPersonCents: args.budgetPerPersonCents, specialNeeds: args.specialNeeds, message: entry.source === "directus" ? (entry.sourceData?.message ?? entry.body ?? "") : [entry.subject ? `Objet : ${entry.subject}` : undefined, entry.body].filter(Boolean).join("\n\n"), missingInformation: [], createdAt: now, updatedAt: now }); if (entry.source === "directus" && args.adminNotes?.trim()) await ctx.db.insert("requestNotes", { requestId, content: args.adminNotes, createdAt: now }); await attachEntry(ctx, entry, requestId, "Dossier créé depuis une entrée"); await ctx.db.patch(entry._id, { outcome: "created", reviewStatus: "created", requestId }); return requestId; } });

export const applyPlan = mutation({ args: { inboxMessageId: v.id("inboxMessages"), actions: v.array(v.object({ type: v.string(), label: v.string(), data: v.any(), selected: v.boolean() })) }, handler: async (ctx, args) => { await requireUser(ctx); const entry = await ctx.db.get(args.inboxMessageId); if (!entry || entry.reviewStatus !== "pending") throw new Error("Entrée déjà traitée ou introuvable."); const selected = args.actions.filter(action => action.selected); const now = Date.now(); let requestId: Id<"requests"> | undefined;
  for (const action of selected) { const data = (action.data || {}) as Record<string, unknown>;
    if (action.type === "CREATE_REQUEST") requestId = await calendarDb(ctx).insert("requests", { source: entry.source === "directus" ? "directus" : "email", externalSourceId: entry.source === "directus" ? entry.externalId.replace(/^directus:/, "") : undefined, status: "a_qualifier", contactName: String(data.contactName || entry.senderName || entry.senderEmail || "Client à identifier"), contactEmail: typeof data.contactEmail === "string" ? data.contactEmail : entry.senderEmail, organizationName: typeof data.organizationName === "string" ? data.organizationName : undefined, eventType: typeof data.eventType === "string" ? data.eventType : undefined, eventDate: typeof data.eventDate === "number" ? data.eventDate : undefined, eventAddress: typeof data.eventAddress === "string" ? data.eventAddress : undefined, guestCount: typeof data.guestCount === "number" ? data.guestCount : undefined, specialNeeds: typeof data.notes === "string" ? data.notes : undefined, message: entry.body, missingInformation: [], createdAt: now, updatedAt: now });
    else if (action.type === "ATTACH_TO_REQUEST" && typeof data.requestId === "string") requestId = data.requestId as Id<"requests">;
    else if (action.type === "UPDATE_REQUEST") { const parent = (typeof data.requestId === "string" ? data.requestId : requestId) as Id<"requests"> | undefined; if (!parent) throw new Error("La modification doit cibler un dossier."); const patch: Record<string, string | number | undefined> = {}; for (const key of ["eventType", "eventAddress", "eventStartTime", "eventEndTime", "specialNeeds", "organizationName", "guestCount", "eventDate"]) { const value = data[key]; if (typeof value === "string" || typeof value === "number") patch[key] = value; } await calendarDb(ctx).patch(parent, { ...patch, updatedAt: now }); }
    else if (action.type === "CREATE_EVENT") { const parent = (typeof data.requestId === "string" ? data.requestId : requestId) as Id<"requests"> | undefined; if (!parent) throw new Error("Une prestation doit appartenir à un dossier."); await ctx.db.insert("requestEvents", { requestId: parent, label: String(data.label || action.label), date: typeof data.date === "number" ? data.date : undefined, startTime: typeof data.startTime === "string" ? data.startTime : undefined, endTime: typeof data.endTime === "string" ? data.endTime : undefined, address: typeof data.address === "string" ? data.address : undefined, guestCount: typeof data.guestCount === "number" ? data.guestCount : undefined, serviceType: typeof data.serviceType === "string" ? data.serviceType : undefined, format: typeof data.format === "string" ? data.format : undefined, notes: typeof data.notes === "string" ? data.notes : undefined, status: data.status === "potentielle" ? "potentielle" : "demandee", createdAt: now, updatedAt: now }); }
    else if (action.type === "ADD_NOTE") { const parent = (typeof data.requestId === "string" ? data.requestId : requestId) as Id<"requests"> | undefined; if (!parent) throw new Error("Une note doit appartenir à un dossier."); await ctx.db.insert("requestNotes", { requestId: parent, content: String(data.content || action.label), createdAt: now }); }
    else if (action.type === "UPDATE_EVENT") { const eventId = typeof data.eventId === "string" ? data.eventId as Id<"requestEvents"> : undefined; if (!eventId) throw new Error("La modification doit cibler une prestation."); const event = await ctx.db.get(eventId); if (!event) throw new Error("Prestation introuvable."); const patch: Record<string, string | number | undefined> = {}; for (const key of ["label", "date", "startTime", "endTime", "address", "guestCount", "serviceType", "format", "notes"]) { const value = data[key]; if (typeof value === "string" || typeof value === "number") patch[key] = value; } await ctx.db.patch(eventId, { ...patch, updatedAt: now }); requestId = event.requestId; }
    else if (action.type === "FLAG_QUOTE_REVISION") { const parent = (typeof data.requestId === "string" ? data.requestId : requestId) as Id<"requests"> | undefined; if (!parent) throw new Error("Le signalement doit cibler un dossier."); await ctx.db.insert("requestHistory", { requestId: parent, label: `Révision de devis à examiner : ${action.label}`, createdAt: now }); }
  }
  if (requestId) { await attachEntry(ctx, entry, requestId, "Plan de l’Agent Entrées appliqué"); await ctx.db.patch(entry._id, { outcome: "created", reviewStatus: "attached", requestId }); }
  if (selected.some(action => action.type === "IGNORE")) await ctx.db.patch(entry._id, { outcome: "ignored", reviewStatus: "ignored" });
  const analysis = await ctx.db.query("inboxAnalyses").withIndex("by_inboxMessageId", q => q.eq("inboxMessageId", entry._id)).unique(); if (analysis) await ctx.db.patch(analysis._id, { status: "applied", acceptedPlan: JSON.stringify(args.actions), appliedAt: now, updatedAt: now }); return { requestId: requestId ?? null };
} });

const prestationFields = {
  eventDate: v.optional(v.number()), eventStartTime: v.optional(v.string()), eventEndTime: v.optional(v.string()),
  eventAddress: v.optional(v.string()), guestCount: v.optional(v.number()), eventType: v.optional(v.string()),
};
const batchRow = v.object({
  key: v.string(), ...prestationFields, existingRequestId: v.optional(v.id("requests")),
  confirmDistinct: v.optional(v.boolean()),
});
const commonFields = {
  contactName: v.string(), contactEmail: v.optional(v.string()), contactPhone: v.optional(v.string()),
  organizationName: v.optional(v.string()), specialNeeds: v.optional(v.string()),
  budgetPerPersonCents: v.optional(v.number()), adminNotes: v.optional(v.string()),
};
function parisDay(timestamp: number) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp);
}
function sameClient(request: Doc<"requests">, name: string, email?: string) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase("fr").replace(/\s+/g, " ");
  return (email && request.contactEmail && normalize(email) === normalize(request.contactEmail)) ||
    (Boolean(name.trim()) && normalize(name) === normalize(request.contactName));
}
async function possibleDuplicates(ctx: QueryCtx, date: number | undefined, name: string, email?: string) {
  if (date === undefined) return [];
  if (!Number.isFinite(date)) throw new Error("Date invalide.");
  // Paris is UTC+1 or UTC+2: this indexed window contains the entire local day.
  const utcDay = Math.floor(date / 86_400_000) * 86_400_000;
  const rows = await ctx.db.query("requests").withIndex("by_eventDate", q => q.gte("eventDate", utcDay - 86_400_000).lt("eventDate", utcDay + 2 * 86_400_000)).take(501);
  if (rows.length > 500) throw new Error("Trop de dossiers sur cette période pour vérifier les doublons. Réduisez la sélection.");
  return rows.filter(request => !request.deletedAt && request.eventDate !== undefined && parisDay(request.eventDate) === parisDay(date) && sameClient(request, name, email))
    .map(request => ({ _id: request._id, contactName: request.contactName, eventDate: request.eventDate!, eventType: request.eventType, eventAddress: request.eventAddress, eventStartTime: request.eventStartTime, eventEndTime: request.eventEndTime, guestCount: request.guestCount, status: request.status }));
}
export const duplicateCandidates = query({
  args: { contactName: v.string(), contactEmail: v.optional(v.string()), dates: v.array(v.union(v.number(), v.null())) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (args.dates.length > 50) throw new Error("Maximum 50 prestations par validation.");
    return await Promise.all(args.dates.map(date => possibleDuplicates(ctx, date ?? undefined, args.contactName, args.contactEmail)));
  },
});

export const createRequests = mutation({
  args: { inboxMessageId: v.id("inboxMessages"), token: v.string(), ...commonFields, rows: v.array(batchRow) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (!args.token.trim() || args.token.length > 100 || !args.contactName.trim() || args.rows.length < 1 || args.rows.length > 50) throw new Error("Indiquez un client et entre 1 et 50 prestations.");
    if (new Set(args.rows.map(row => row.key)).size !== args.rows.length || args.rows.some(row => !/^[a-zA-Z0-9-]{1,100}$/.test(row.key))) throw new Error("Les lignes de prestations doivent être distinctes.");
    const entry = await ctx.db.get(args.inboxMessageId);
    if (!entry) throw new Error("Entrée introuvable.");
    const fingerprint = JSON.stringify({ ...args, token: undefined }, (_key, value: unknown) => {
      if (value && typeof value === "object" && !Array.isArray(value)) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
      return value;
    });
    if (entry.creationToken === args.token) {
      if (entry.creationFingerprint !== fingerprint) throw new Error("Cette validation a déjà été enregistrée avec d’autres valeurs. Rouvrez l’Entrée pour consulter le résultat.");
      const links = await ctx.db.query("inboxRequestLinks").withIndex("by_inboxMessageId_and_requestId", q => q.eq("inboxMessageId", entry._id)).take(100);
      return links.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map(link => link.requestId);
    }
    if (entry.reviewStatus !== "pending") throw new Error("Entrée déjà traitée. Aucun nouveau dossier n’a été créé.");
    const seenTargets = new Set<string>();
    // Validate the entire selection before writing; mutation rollback is an additional safeguard.
    for (const [position, row] of args.rows.entries()) {
      if (args.rows.length > 1 && row.eventDate === undefined) throw new Error("Chaque prestation doit avoir une date lorsque plusieurs dossiers sont demandés.");
      if (row.eventDate !== undefined && !Number.isFinite(row.eventDate)) throw new Error("Date invalide.");
      for (const time of [row.eventStartTime, row.eventEndTime]) if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Horaire invalide.");
      if (row.eventStartTime && row.eventEndTime && row.eventEndTime <= row.eventStartTime) throw new Error("L’heure de fin doit être après l’heure de début.");
      if (row.guestCount !== undefined && (!Number.isSafeInteger(row.guestCount) || row.guestCount < 0)) throw new Error("Nombre de personnes invalide.");
      if (row.existingRequestId) {
        const target = await ctx.db.get(row.existingRequestId);
        if (!target || target.deletedAt) throw new Error("Dossier à rattacher introuvable.");
        if (seenTargets.has(target._id)) throw new Error("Un même dossier ne peut pas représenter deux lignes.");
        seenTargets.add(target._id);
        if (row.eventDate === undefined || target.eventDate === undefined || parisDay(row.eventDate) !== parisDay(target.eventDate)) throw new Error("La date doit correspondre au dossier existant. Le rattachement ne modifie pas ce dossier.");
      } else {
        const duplicates = await possibleDuplicates(ctx, row.eventDate, args.contactName, args.contactEmail);
        const repeatedDate = row.eventDate !== undefined && args.rows.slice(0, position).some(previous => previous.eventDate !== undefined && parisDay(previous.eventDate) === parisDay(row.eventDate!));
        if ((duplicates.length || repeatedDate) && !row.confirmDistinct) throw new Error("Un dossier du même client existe à cette date, ou une autre ligne utilise cette date. Rattachez-le ou confirmez une prestation distincte.");
      }
    }
    if (args.budgetPerPersonCents !== undefined && (!Number.isSafeInteger(args.budgetPerPersonCents) || args.budgetPerPersonCents < 0)) throw new Error("Budget invalide.");
    const now = Date.now();
    const requestIds: Id<"requests">[] = [];
    let created = 0;
    for (const [position, row] of args.rows.entries()) {
      let requestId = row.existingRequestId;
      if (!requestId) {
        const externalSourceId = entry.source === "directus"
          ? entry.externalId.replace(/^directus:/, "") + (created === 0 ? "" : "#prestation:" + row.key)
          : undefined;
        requestId = await calendarDb(ctx).insert("requests", {
          source: entry.source ?? "email", externalSourceId, status: "a_qualifier",
          contactName: args.contactName.trim(), contactEmail: args.contactEmail, contactPhone: args.contactPhone,
          organizationName: args.organizationName, specialNeeds: args.specialNeeds, budgetPerPersonCents: args.budgetPerPersonCents,
          eventDate: row.eventDate, eventStartTime: row.eventStartTime, eventEndTime: row.eventEndTime,
          eventAddress: row.eventAddress, guestCount: row.guestCount, eventType: row.eventType,
          message: entry.source === "directus" ? entry.sourceData?.message ?? entry.body ?? "" : [entry.subject ? `Objet : ${entry.subject}` : undefined, entry.body].filter(Boolean).join("\n\n"),
          missingInformation: [], createdAt: now, updatedAt: now,
        });
        created++;
      } else if (entry.source === "directus" && (entry.sourceData?.message ?? entry.body)) {
        await ctx.db.insert("requestNotes", { requestId, content: "Message original du formulaire du site :\n" + (entry.sourceData?.message ?? entry.body), createdAt: now });
      }
      if (args.adminNotes?.trim()) await ctx.db.insert("requestNotes", { requestId, content: args.adminNotes, createdAt: now });
      await attachEntry(ctx, entry, requestId, row.existingRequestId ? "Entrée rattachée à cette prestation" : "Dossier créé depuis une entrée", position);
      requestIds.push(requestId);
    }
    await ctx.db.patch(entry._id, { outcome: "created", reviewStatus: created ? "created" : "attached", requestId: requestIds[0], creationToken: args.token, creationFingerprint: fingerprint });
    return requestIds;
  },
});
