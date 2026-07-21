import { v } from "convex/values";

import { authComponent } from "./auth";
import { mutation, query } from "./_generated/server";

async function requireUser(ctx: Parameters<typeof authComponent.safeGetAuthUser>[0]) {
  if (!await authComponent.safeGetAuthUser(ctx)) {
    throw new Error("Vous devez être connecté.");
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db.query("emailTemplates").withIndex("by_updatedAt").order("desc").collect();
  },
});

export const save = mutation({
  args: {
    id: v.optional(v.id("emailTemplates")),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const name = args.name.trim();
    const subject = args.subject.trim();
    const body = args.body.trim();
    if (!name || !subject || !body) throw new Error("Nom, objet et message sont obligatoires.");
    const now = Date.now();
    if (args.id) {
      await ctx.db.patch(args.id, { name, subject, body, updatedAt: now });
      return args.id;
    }
    return await ctx.db.insert("emailTemplates", { name, subject, body, createdAt: now, updatedAt: now });
  },
});

export const remove = mutation({
  args: { id: v.id("emailTemplates") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    await ctx.db.delete(args.id);
  },
});
