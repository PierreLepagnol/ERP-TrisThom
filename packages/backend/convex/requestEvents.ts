import { v } from "convex/values";
import { authComponent } from "./auth";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

const eventFields = v.object({
  label: v.string(), date: v.optional(v.number()),
  startTime: v.optional(v.string()), endTime: v.optional(v.string()),
  address: v.optional(v.string()), guestCount: v.optional(v.number()),
  serviceType: v.optional(v.string()), format: v.optional(v.string()), notes: v.optional(v.string()),
  status: v.union(v.literal("prevue"), v.literal("terminee"), v.literal("demandee"), v.literal("potentielle"), v.literal("confirmee"), v.literal("annulee")),
});

async function requireRequest(ctx: QueryCtx | MutationCtx, requestId: Id<"requests">) {
  if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Vous devez être connecté.");
  const request = await ctx.db.get(requestId);
  if (!request || request.deletedAt != null) throw new Error("Dossier introuvable.");
  return request;
}


// Compatibility endpoints fail explicitly for old browser tabs. Historical rows are read-only.
export const list = query({ args: { requestId: v.id("requests") }, handler: async (ctx, { requestId }) => {
  await requireRequest(ctx, requestId);
  return await ctx.db.query("requestEvents").withIndex("by_requestId_and_date", q => q.eq("requestId", requestId)).take(101);
} });
export const create = mutation({ args: { requestId: v.id("requests"), fields: eventFields }, handler: async (ctx, args) => { await requireRequest(ctx, args.requestId); throw new Error("Un dossier correspond à une prestation. Dupliquez le dossier pour une autre date."); } });
export const update = mutation({ args: { requestId: v.id("requests"), eventId: v.optional(v.id("requestEvents")), fields: eventFields }, handler: async (ctx, args) => { await requireRequest(ctx, args.requestId); throw new Error("Reprenez les anciennes prestations dans la fiche dossier."); } });
export const remove = mutation({ args: { requestId: v.id("requests"), eventId: v.id("requestEvents") }, handler: async (ctx, args) => { await requireRequest(ctx, args.requestId); throw new Error("Les anciennes prestations sont conservées pour la reprise du dossier."); } });
