import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const load = internalQuery({
  args: { inboxMessageId: v.id("inboxMessages") },
  handler: async (ctx, { inboxMessageId }) => {
    const entry = await ctx.db.get(inboxMessageId);
    if (!entry) return null;
    const analysis = await ctx.db.query("inboxAnalyses").withIndex("by_inboxMessageId", q => q.eq("inboxMessageId", inboxMessageId)).unique();
    const email = entry.senderEmail?.toLowerCase();
    const directRequests = email ? await ctx.db.query("requests").withIndex("by_contactEmail", q => q.eq("contactEmail", email)).take(20) : [];
    const requests = directRequests.filter(request => !request.deletedAt).slice(0, 10);
    const context = [] as Array<{ request: typeof requests[number]; quotes: Array<unknown>; messages: Array<unknown> }>;
    for (const request of requests) {
      const [quotes, messages] = await Promise.all([
        ctx.db.query("quotes").withIndex("by_requestId", q => q.eq("requestId", request._id)).take(5),
        ctx.db.query("emailMessages").withIndex("by_requestId_and_sentAt", q => q.eq("requestId", request._id)).order("desc").take(5),
      ]);
      context.push({ request, quotes, messages });
    }
    return { entry, analysis, context };
  },
});

export const save = internalMutation({
  args: { inboxMessageId: v.id("inboxMessages"), status: v.union(v.literal("pending_analysis"), v.literal("analyzed"), v.literal("analysis_failed")), summary: v.optional(v.string()), messageType: v.optional(v.string()), plan: v.optional(v.string()), model: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("inboxAnalyses").withIndex("by_inboxMessageId", q => q.eq("inboxMessageId", args.inboxMessageId)).unique();
    const value = { ...args, analyzedAt: args.status === "analyzed" ? now : undefined, updatedAt: now };
    if (existing) await ctx.db.patch(existing._id, value);
    else await ctx.db.insert("inboxAnalyses", { ...value, createdAt: now });
    return null;
  },
});

export const markApplied = internalMutation({
  args: { inboxMessageId: v.id("inboxMessages") },
  handler: async (ctx, { inboxMessageId }) => {
    const analysis = await ctx.db.query("inboxAnalyses").withIndex("by_inboxMessageId", q => q.eq("inboxMessageId", inboxMessageId)).unique();
    if (analysis) await ctx.db.patch(analysis._id, { status: "applied", appliedAt: Date.now(), updatedAt: Date.now() });
    return null;
  },
});
