import { v } from "convex/values";
import { authComponent } from "./auth";
import { mutation, query } from "./_generated/server";

const offer = { format: v.string(), level: v.string(), variant: v.optional(v.string()), selectedModules: v.array(v.string()), moduleSelections: v.array(v.object({ moduleId: v.string(), catalogItemIds: v.array(v.string()), customItems: v.array(v.string()), note: v.optional(v.string()) })) };
async function authenticated(ctx: Parameters<typeof authComponent.safeGetAuthUser>[0]) { if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Authentification requise."); }
export const getForRequest = query({ args: { requestId: v.id("requests") }, handler: async (ctx, args) => { await authenticated(ctx); return await ctx.db.query("requestOffers").withIndex("by_requestId", q => q.eq("requestId", args.requestId)).unique(); } });
export const save = mutation({ args: { requestId: v.id("requests"), ...offer }, handler: async (ctx, args) => { await authenticated(ctx); const now = Date.now(); const existing = await ctx.db.query("requestOffers").withIndex("by_requestId", q => q.eq("requestId", args.requestId)).unique(); const data = { ...args, createdAt: existing?.createdAt ?? now, updatedAt: now }; if (existing) await ctx.db.replace(existing._id, data); else await ctx.db.insert("requestOffers", data); return null; } });
