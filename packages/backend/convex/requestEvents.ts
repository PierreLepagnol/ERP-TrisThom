import { v } from "convex/values";
import { authComponent } from "./auth";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { legacyRequestEvent, requestEventRows, syncRequestEventSummary, validateEvent } from "./requestEventModel";

const eventFields = v.object({
  label: v.string(), date: v.optional(v.number()),
  startTime: v.optional(v.string()), endTime: v.optional(v.string()),
  address: v.optional(v.string()), guestCount: v.optional(v.number()),
  serviceType: v.optional(v.string()), format: v.optional(v.string()), notes: v.optional(v.string()),
  status: v.union(v.literal("demandee"), v.literal("potentielle"), v.literal("confirmee"), v.literal("annulee")),
});

async function requireRequest(ctx: QueryCtx | MutationCtx, requestId: Id<"requests">) {
  if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Vous devez être connecté.");
  const request = await ctx.db.get(requestId);
  if (!request || request.deletedAt != null) throw new Error("Dossier introuvable.");
  return request;
}

async function recordChange(ctx: MutationCtx, requestId: Id<"requests">, label: string) {
  await syncRequestEventSummary(ctx, requestId);
  await ctx.db.insert("requestHistory", { requestId, label, createdAt: Date.now() });
}

export const list = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const request = await requireRequest(ctx, requestId);
    const rows = await requestEventRows(ctx, requestId);
    return rows.length
      ? rows.map(row => ({ ...row, historical: false }))
      : [{ ...legacyRequestEvent(request), _id: null, historical: true }];
  },
});

export const create = mutation({
  args: { requestId: v.id("requests"), fields: eventFields },
  handler: async (ctx, { requestId, fields }) => {
    const request = await requireRequest(ctx, requestId);
    const values = validateEvent(fields);
    const rows = await requestEventRows(ctx, requestId);
    const now = Date.now();
    if (!rows.length) {
      await ctx.db.insert("requestEvents", { ...legacyRequestEvent(request), requestId, createdAt: now, updatedAt: now });
    }
    const eventId = await ctx.db.insert("requestEvents", { ...values, requestId, createdAt: now, updatedAt: now });
    await recordChange(ctx, requestId, "Prestation ajoutée : " + values.label);
    return eventId;
  },
});

export const update = mutation({
  args: { requestId: v.id("requests"), eventId: v.optional(v.id("requestEvents")), fields: eventFields },
  handler: async (ctx, { requestId, eventId, fields }) => {
    await requireRequest(ctx, requestId);
    const values = validateEvent(fields);
    const now = Date.now();
    if (eventId) {
      const event = await ctx.db.get(eventId);
      if (!event || event.requestId !== requestId) throw new Error("Prestation introuvable dans ce dossier.");
      await ctx.db.patch(eventId, { ...values, updatedAt: now });
    } else {
      if ((await requestEventRows(ctx, requestId)).length) throw new Error("Les prestations ont changé. Rechargez le dossier.");
      // Editing the virtual legacy prestation materializes just that one prestation.
      await ctx.db.insert("requestEvents", { ...values, requestId, createdAt: now, updatedAt: now });
    }
    await recordChange(ctx, requestId, "Prestation modifiée : " + values.label);
    return null;
  },
});

export const remove = mutation({
  args: { requestId: v.id("requests"), eventId: v.id("requestEvents") },
  handler: async (ctx, { requestId, eventId }) => {
    await requireRequest(ctx, requestId);
    const event = await ctx.db.get(eventId);
    if (!event || event.requestId !== requestId) throw new Error("Prestation introuvable dans ce dossier.");
    if ((await requestEventRows(ctx, requestId)).length <= 1) throw new Error("Conservez au moins une prestation dans le dossier.");
    await ctx.db.delete(eventId);
    await recordChange(ctx, requestId, "Prestation supprimée : " + event.label);
    return null;
  },
});
