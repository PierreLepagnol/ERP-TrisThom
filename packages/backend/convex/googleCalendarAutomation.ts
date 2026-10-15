import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { loadCandidate } from "./googleCalendarData";
import { automaticDecision, retryDelay } from "./googleCalendarPlanning";
import { enqueueCalendar } from "./googleCalendarTracking";

export const setEnabled = internalMutation({
  args: { enabled: v.boolean(), confirmation: v.literal("AUTOMATIC_GOOGLE_CALENDAR") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await ctx.db.query("googleCalendarAutomation").unique();
    if (config) await ctx.db.patch(config._id, { enabled: args.enabled, cursor: undefined });
    else await ctx.db.insert("googleCalendarAutomation", { enabled: args.enabled });
    if (args.enabled) await ctx.scheduler.runAfter(0, internal.googleCalendarAutomation.catchUp, {});
    return null;
  },
});

export const claim = internalMutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    if (!(await ctx.db.query("googleCalendarAutomation").unique())?.enabled) return null;
    const job = await ctx.db.query("googleCalendarJobs").withIndex("by_requestId", q => q.eq("requestId", args.requestId)).unique();
    const now = Date.now();
    if (!job || job.dueAt > now || (job.status === "running" && (job.leaseUntil ?? 0) > now)) return null;
    if (!await ctx.db.get(args.requestId)) {
      await ctx.db.patch(job._id, { status: "ignored", dueAt: Number.MAX_SAFE_INTEGER, leaseUntil: undefined, message: "Dossier supprimé physiquement : aucun événement Google modifié." });
      return null;
    }
    const leaseUntil = now + 15 * 60_000;
    await ctx.db.patch(job._id, { status: "running", leaseUntil, dueAt: leaseUntil, attempt: job.attempt + 1 });
    return { revision: job.revision, leaseUntil, lastSnapshot: job.lastSnapshot ?? null };
  },
});

export const finish = internalMutation({
  args: { requestId: v.id("requests"), revision: v.number(), leaseUntil: v.number(),
    status: v.union(v.literal("ok"), v.literal("erreur"), v.literal("ignore")), message: v.string(), snapshot: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.query("googleCalendarJobs").withIndex("by_requestId", q => q.eq("requestId", args.requestId)).unique();
    if (!job || job.leaseUntil !== args.leaseUntil || job.status !== "running") return null;
    const changed = job.revision !== args.revision;
    const failed = args.status === "erreur";
    await ctx.db.patch(job._id, {
      status: changed ? "pending" : failed ? "failed" : args.status === "ignore" ? "ignored" : "synced",
      dueAt: changed ? Date.now() : failed ? Date.now() + retryDelay(job.attempt) : Number.MAX_SAFE_INTEGER,
      leaseUntil: undefined, message: args.message,
      ...(!failed && !changed && args.snapshot ? { lastSnapshot: args.snapshot } : {}),
    });
    if (changed && (await ctx.db.query("googleCalendarAutomation").unique())?.enabled) await ctx.scheduler.runAfter(0, internal.googleCalendar.automatic, { requestId: args.requestId });
    return null;
  },
});

// Bounded persistent cursor: every dossier is eventually examined, with no
// truncation at 500 and no action depending on a desktop process.
export const catchUp = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const config = await ctx.db.query("googleCalendarAutomation").unique();
    if (!config?.enabled) return null;
    const now = Date.now();
    const due = await ctx.db.query("googleCalendarJobs").withIndex("by_dueAt", q => q.lte("dueAt", now)).take(25);
    for (const job of due) await ctx.scheduler.runAfter(0, internal.googleCalendar.automatic, { requestId: job.requestId });
    const page = await ctx.db.query("requests").paginate({ numItems: 25, cursor: config.cursor ?? null });
    for (const request of page.page) {
      const job = await ctx.db.query("googleCalendarJobs").withIndex("by_requestId", q => q.eq("requestId", request._id)).unique();
      try {
        const candidate = await loadCandidate(ctx, request._id);
        const reason = automaticDecision(candidate, now);
        if (!reason && (!job || (job.lastSnapshot !== candidate.snapshot && ["synced", "ignored"].includes(job.status)))) await enqueueCalendar(ctx, request._id);
      } catch {
        if (!job) await enqueueCalendar(ctx, request._id);
      }
    }
    await ctx.db.patch(config._id, { cursor: page.isDone ? undefined : page.continueCursor });
    if (!page.isDone) await ctx.scheduler.runAfter(1_000, internal.googleCalendarAutomation.catchUp, {});
    return null;
  },
});

export const status = internalQuery({
  args: {},
  handler: async ctx => {
    const config = await ctx.db.query("googleCalendarAutomation").unique();
    const jobs = await ctx.db.query("googleCalendarJobs").withIndex("by_dueAt").take(100);
    return { enabled: config?.enabled ?? false, rattrapageEnCours: Boolean(config?.cursor),
      note: "100 travaux les plus proches au maximum ; aucun identifiant Google exposé.",
      dossiers: jobs.map(job => ({ requestId: job.requestId, status: job.status, attempt: job.attempt,
        message: job.message ?? null, prochaineTentative: job.dueAt === Number.MAX_SAFE_INTEGER ? null : job.dueAt })) };
  },
});

export const previewAutomatic = internalQuery({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("requests").paginate({ cursor: args.cursor ?? null, numItems: 25 });
    const dossiers = [];
    for (const request of page.page) {
      try {
        const candidate = await loadCandidate(ctx, request._id);
        dossiers.push({ requestId: request._id, client: candidate.review.client, date: candidate.projection.day,
          motif: automaticDecision(candidate, Date.now()), operation: ["annule", "refuse"].includes(request.status) ? "retirer_si_propriete_ERP_prouvee" : candidate.savedEventId || candidate.reservedEventId ? "mettre_a_jour" : "creer" });
      } catch { dossiers.push({ requestId: request._id, motif: "Dossier à vérifier avant synchronisation." }); }
    }
    return { dossiers, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});
