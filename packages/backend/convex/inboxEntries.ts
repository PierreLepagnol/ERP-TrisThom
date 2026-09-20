import { paginationOptsValidator } from "convex/server";
import { matchesInboxCandidate } from "./inboxCandidatePolicy";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

async function requireUser(ctx: Parameters<typeof authComponent.safeGetAuthUser>[0]) { if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Vous devez être connecté."); }

async function attachEntry(ctx: any, entry: any, requestId: Id<"requests">, label: string) {
  const now = Date.now(); const messageId = entry.messageId ?? entry.externalId;
  const existing = await ctx.db.query("emailMessages").withIndex("by_messageId", (q: any) => q.eq("messageId", messageId)).unique();
  if (!existing) await ctx.db.insert("emailMessages", { requestId, direction: "inbound", messageId, subject: entry.subject, body: entry.body ?? "", senderEmail: entry.senderEmail, attachmentNames: entry.attachmentNames, sentAt: entry.receivedAt ?? now });
  await ctx.db.insert("requestHistory", { requestId, label, createdAt: now });
}

export const list = query({ args: { processed: v.boolean() }, handler: async (ctx, args) => { await requireUser(ctx); const rows = (await ctx.db.query("inboxMessages").take(500)).filter(row => args.processed ? row.reviewStatus !== "pending" : row.reviewStatus === "pending").sort((a, b) => (b.receivedAt ?? b.createdAt) - (a.receivedAt ?? a.createdAt)); return await Promise.all(rows.map(async entry => ({ ...entry, analysis: await ctx.db.query("inboxAnalyses").withIndex("by_inboxMessageId", q => q.eq("inboxMessageId", entry._id)).unique() }))); } });
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

const createArgs = { inboxMessageId: v.id("inboxMessages"), contactName: v.string(), contactEmail: v.optional(v.string()), contactPhone: v.optional(v.string()), organizationName: v.optional(v.string()), eventType: v.optional(v.string()), eventDate: v.optional(v.number()), eventStartTime: v.optional(v.string()), eventEndTime: v.optional(v.string()), eventAddress: v.optional(v.string()), guestCount: v.optional(v.number()), budgetCents: v.optional(v.number()), budgetPerPersonCents: v.optional(v.number()), specialNeeds: v.optional(v.string()) };
export const createRequest = mutation({ args: createArgs, handler: async (ctx, args) => { await requireUser(ctx); const entry = await ctx.db.get(args.inboxMessageId); if (!entry || entry.reviewStatus !== "pending") throw new Error("Entrée déjà traitée ou introuvable."); const now = Date.now(); const requestId = await ctx.db.insert("requests", { source: "email", status: "a_qualifier", contactName: args.contactName, contactEmail: args.contactEmail, contactPhone: args.contactPhone, organizationName: args.organizationName, eventType: args.eventType, eventDate: args.eventDate, eventStartTime: args.eventStartTime, eventEndTime: args.eventEndTime, eventAddress: args.eventAddress, guestCount: args.guestCount, budgetCents: args.budgetCents, budgetPerPersonCents: args.budgetPerPersonCents, specialNeeds: args.specialNeeds, message: [entry.subject ? `Objet : ${entry.subject}` : undefined, entry.body].filter(Boolean).join("\n\n"), missingInformation: [], createdAt: now, updatedAt: now }); await attachEntry(ctx, entry, requestId, "Dossier créé depuis une entrée"); await ctx.db.patch(entry._id, { outcome: "created", reviewStatus: "created", requestId }); return requestId; } });

export const applyPlan = mutation({ args: { inboxMessageId: v.id("inboxMessages"), actions: v.array(v.object({ type: v.string(), label: v.string(), data: v.any(), selected: v.boolean() })) }, handler: async (ctx, args) => { await requireUser(ctx); const entry = await ctx.db.get(args.inboxMessageId); if (!entry || entry.reviewStatus !== "pending") throw new Error("Entrée déjà traitée ou introuvable."); const selected = args.actions.filter(action => action.selected); const now = Date.now(); let requestId: Id<"requests"> | undefined;
  for (const action of selected) { const data = (action.data || {}) as Record<string, unknown>;
    if (action.type === "CREATE_REQUEST") requestId = await ctx.db.insert("requests", { source: "email", status: "a_qualifier", contactName: String(data.contactName || entry.senderName || entry.senderEmail || "Client à identifier"), contactEmail: typeof data.contactEmail === "string" ? data.contactEmail : entry.senderEmail, organizationName: typeof data.organizationName === "string" ? data.organizationName : undefined, eventType: typeof data.eventType === "string" ? data.eventType : undefined, eventDate: typeof data.eventDate === "number" ? data.eventDate : undefined, eventAddress: typeof data.eventAddress === "string" ? data.eventAddress : undefined, guestCount: typeof data.guestCount === "number" ? data.guestCount : undefined, specialNeeds: typeof data.notes === "string" ? data.notes : undefined, message: entry.body, missingInformation: [], createdAt: now, updatedAt: now });
    else if (action.type === "ATTACH_TO_REQUEST" && typeof data.requestId === "string") requestId = data.requestId as Id<"requests">;
    else if (action.type === "UPDATE_REQUEST") { const parent = (typeof data.requestId === "string" ? data.requestId : requestId) as Id<"requests"> | undefined; if (!parent) throw new Error("La modification doit cibler un dossier."); const patch: Record<string, string | number | undefined> = {}; for (const key of ["eventType", "eventAddress", "eventStartTime", "eventEndTime", "specialNeeds", "organizationName", "guestCount", "eventDate"]) { const value = data[key]; if (typeof value === "string" || typeof value === "number") patch[key] = value; } await ctx.db.patch(parent, { ...patch, updatedAt: now }); }
    else if (action.type === "CREATE_EVENT") { const parent = (typeof data.requestId === "string" ? data.requestId : requestId) as Id<"requests"> | undefined; if (!parent) throw new Error("Une prestation doit appartenir à un dossier."); await ctx.db.insert("requestEvents", { requestId: parent, label: String(data.label || action.label), date: typeof data.date === "number" ? data.date : undefined, startTime: typeof data.startTime === "string" ? data.startTime : undefined, endTime: typeof data.endTime === "string" ? data.endTime : undefined, address: typeof data.address === "string" ? data.address : undefined, guestCount: typeof data.guestCount === "number" ? data.guestCount : undefined, serviceType: typeof data.serviceType === "string" ? data.serviceType : undefined, format: typeof data.format === "string" ? data.format : undefined, notes: typeof data.notes === "string" ? data.notes : undefined, status: data.status === "potentielle" ? "potentielle" : "demandee", createdAt: now, updatedAt: now }); }
    else if (action.type === "ADD_NOTE") { const parent = (typeof data.requestId === "string" ? data.requestId : requestId) as Id<"requests"> | undefined; if (!parent) throw new Error("Une note doit appartenir à un dossier."); await ctx.db.insert("requestNotes", { requestId: parent, content: String(data.content || action.label), createdAt: now }); }
    else if (action.type === "UPDATE_EVENT") { const eventId = typeof data.eventId === "string" ? data.eventId as Id<"requestEvents"> : undefined; if (!eventId) throw new Error("La modification doit cibler une prestation."); const event = await ctx.db.get(eventId); if (!event) throw new Error("Prestation introuvable."); const patch: Record<string, string | number | undefined> = {}; for (const key of ["label", "date", "startTime", "endTime", "address", "guestCount", "serviceType", "format", "notes"]) { const value = data[key]; if (typeof value === "string" || typeof value === "number") patch[key] = value; } await ctx.db.patch(eventId, { ...patch, updatedAt: now }); requestId = event.requestId; }
    else if (action.type === "FLAG_QUOTE_REVISION") { const parent = (typeof data.requestId === "string" ? data.requestId : requestId) as Id<"requests"> | undefined; if (!parent) throw new Error("Le signalement doit cibler un dossier."); await ctx.db.insert("requestHistory", { requestId: parent, label: `Révision de devis à examiner : ${action.label}`, createdAt: now }); }
  }
  if (requestId) { await attachEntry(ctx, entry, requestId, "Plan de l’Agent Entrées appliqué"); await ctx.db.patch(entry._id, { outcome: "created", reviewStatus: "attached", requestId }); }
  if (selected.some(action => action.type === "IGNORE")) await ctx.db.patch(entry._id, { outcome: "ignored", reviewStatus: "ignored" });
  const analysis = await ctx.db.query("inboxAnalyses").withIndex("by_inboxMessageId", q => q.eq("inboxMessageId", entry._id)).unique(); if (analysis) await ctx.db.patch(analysis._id, { status: "applied", acceptedPlan: JSON.stringify(args.actions), appliedAt: now, updatedAt: now }); return { requestId: requestId ?? null };
} });
