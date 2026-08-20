import { v } from "convex/values";

import { authComponent } from "./auth";
import { mutation, query } from "./_generated/server";

const maxPdfBytes = 5 * 1024 * 1024;

async function requireUser(ctx: Parameters<typeof authComponent.safeGetAuthUser>[0]) {
  if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Vous devez être connecté.");
}

export const list = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const documents = await ctx.db.query("requestDocuments")
      .withIndex("by_requestId_and_createdAt", (index) => index.eq("requestId", args.requestId))
      .order("desc")
      .take(100);
    return await Promise.all(documents.map(async (document) => ({ ...document, url: await ctx.storage.getUrl(document.storageId) })));
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: { requestId: v.id("requests"), storageId: v.id("_storage"), filename: v.string(), sizeBytes: v.number() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (!args.filename.toLowerCase().endsWith(".pdf")) throw new Error("Seuls les fichiers PDF sont acceptés.");
    if (args.sizeBytes <= 0 || args.sizeBytes > maxPdfBytes) throw new Error("Le PDF doit faire moins de 5 Mo.");
    if (!await ctx.db.get(args.requestId)) throw new Error("Dossier introuvable.");
    await ctx.db.insert("requestDocuments", { ...args, filename: args.filename.slice(0, 255), createdAt: Date.now() });
    return null;
  },
});

export const remove = mutation({
  args: { documentId: v.id("requestDocuments") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const document = await ctx.db.get(args.documentId);
    if (!document) return null;
    await ctx.storage.delete(document.storageId);
    await ctx.db.delete(document._id);
    return null;
  },
});
