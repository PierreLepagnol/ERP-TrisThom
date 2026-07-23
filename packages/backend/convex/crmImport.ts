import { v } from "convex/values";
import { env, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const status = v.union(v.literal("nouveau"), v.literal("a_qualifier"), v.literal("qualifie"), v.literal("devis_a_preparer"), v.literal("devis_envoye"), v.literal("relance"), v.literal("accepte"), v.literal("refuse"), v.literal("annule"));
const source = v.union(v.literal("directus"), v.literal("email"), v.literal("telephone"), v.literal("1001traiteur"), v.literal("manuel"));
const record = v.object({ legacyId: v.string(), externalSourceId: v.string(), source, status, archived: v.boolean(), contactName: v.string(), contactEmail: v.optional(v.string()), contactPhone: v.optional(v.string()), organizationName: v.optional(v.string()), eventType: v.optional(v.string()), eventDate: v.optional(v.string()), eventStartTime: v.optional(v.string()), eventEndTime: v.optional(v.string()), venue: v.optional(v.string()), eventAddress: v.optional(v.string()), guestCount: v.optional(v.number()), budgetCents: v.optional(v.number()), quoteNumber: v.optional(v.string()), quoteAmountCents: v.optional(v.number()), nextActionAt: v.optional(v.number()), nextActionTitle: v.optional(v.string()), notes: v.optional(v.string()) });
const normalize = (value: string) => value === "a_qualifier" ? "nouveau" : value === "qualifie" ? "devis_a_preparer" : value === "relance" ? "devis_envoye" : value;
const noonUtc = (date?: string) => date ? Date.parse(`${date}T12:00:00.000Z`) : undefined;

export const importBatch = action({ args: { secret: v.string(), records: v.array(record), dryRun: v.boolean() }, handler: async (ctx, args): Promise<unknown> => {
  if (!env.CRM_IMPORT_SECRET || args.secret !== env.CRM_IMPORT_SECRET) throw new Error("Import non autorisé.");
  return await ctx.runMutation(internal.crmImport.writeBatch, { records: args.records, dryRun: args.dryRun });
} });

export const writeBatch = internalMutation({ args: { records: v.array(record), dryRun: v.boolean() }, handler: async (ctx, args) => {
  const result = { created: 0, updated: 0, unchanged: 0, errors: [] as string[] };
  for (const item of args.records) try {
    const existing = await ctx.db.query("requests").withIndex("by_source_and_externalSourceId", q => q.eq("source", item.source).eq("externalSourceId", item.externalSourceId)).unique();
    if (existing) { result.unchanged++; continue; }
    if (args.dryRun) { result.created++; continue; }
    const now = Date.now();
    const requestId = await ctx.db.insert("requests", { source: item.source, externalSourceId: item.externalSourceId, status: normalize(item.status) as any, contactName: item.contactName || "Contact à identifier", contactEmail: item.contactEmail, contactPhone: item.contactPhone, organizationName: item.organizationName, eventType: item.eventType, eventDate: noonUtc(item.eventDate), eventStartTime: item.eventStartTime, eventEndTime: item.eventEndTime, venue: item.venue, eventAddress: item.eventAddress, guestCount: item.guestCount, budgetCents: item.budgetCents, quoteNumber: item.quoteNumber, quoteAmountCents: item.quoteAmountCents, nextActionAt: item.nextActionAt, missingInformation: [], archivedAt: item.archived ? now : undefined, createdAt: now, updatedAt: now });
    await ctx.db.insert("requestHistory", { requestId, label: `Import historique (${item.legacyId})`, createdAt: now, importKey: `${item.legacyId}:history` });
    if (item.notes) await ctx.db.insert("requestNotes", { requestId, content: item.notes, createdAt: now, importKey: `${item.legacyId}:notes` });
    if (item.nextActionAt && item.nextActionTitle) await ctx.db.insert("followUpTasks", { requestId, kind: "manuel", title: item.nextActionTitle, dueAt: item.nextActionAt, createdAt: now });
    result.created++;
  } catch { result.errors.push(item.legacyId); }
  return result;
} });
