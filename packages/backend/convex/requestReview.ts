import { v } from "convex/values";

import { authComponent } from "./auth";
import { mutation, query } from "./_generated/server";

const allowedFields = ["contactName", "contactPhone", "organizationName", "eventDate", "eventStartTime", "eventAddress", "eventType", "guestCount", "budgetCents", "budgetPerPersonCents", "specialNeeds"] as const;

async function requireUser(ctx: Parameters<typeof authComponent.safeGetAuthUser>[0]) {
  if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Vous devez être connecté.");
}

export const listPending = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.query("requestChangeSuggestions")
      .withIndex("by_requestId_and_status", (index) => index.eq("requestId", args.requestId).eq("status", "pending"))
      .take(50);
  },
});

export const decide = mutation({
  args: { suggestionId: v.id("requestChangeSuggestions"), decision: v.union(v.literal("apply"), v.literal("ignore")) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const suggestion = await ctx.db.get(args.suggestionId);
    if (!suggestion || suggestion.status !== "pending") throw new Error("Modification introuvable ou déjà traitée.");
    const request = await ctx.db.get(suggestion.requestId);
    if (!request) throw new Error("Dossier introuvable.");
    const now = Date.now();
    if (args.decision === "apply") {
      if (!allowedFields.includes(suggestion.field as (typeof allowedFields)[number])) throw new Error("Champ de modification invalide.");
      const field = suggestion.field as (typeof allowedFields)[number];
      const value = ["eventDate", "guestCount", "budgetCents", "budgetPerPersonCents"].includes(field)
        ? Number(suggestion.proposedValue)
        : suggestion.proposedValue;
      if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Valeur proposée invalide.");
      await ctx.db.patch(request._id, { [field]: value, updatedAt: now });
      await ctx.db.patch(suggestion._id, { status: "applied" });
      await ctx.db.insert("requestHistory", { requestId: request._id, label: `Modification appliquée : ${suggestion.field}`, createdAt: now });
    } else {
      await ctx.db.patch(suggestion._id, { status: "ignored" });
    }
    return null;
  },
});
