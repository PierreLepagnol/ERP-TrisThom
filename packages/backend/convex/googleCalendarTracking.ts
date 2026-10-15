import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

export async function enqueueCalendar(ctx: MutationCtx, requestId: Id<"requests">) {
  const job = await ctx.db.query("googleCalendarJobs").withIndex("by_requestId", q => q.eq("requestId", requestId)).unique();
  const now = Date.now();
  if (job) await ctx.db.patch(job._id, { revision: job.revision + 1, attempt: 0,
    dueAt: job.status === "running" ? job.dueAt : now, status: job.status === "running" ? "running" : "pending" });
  else await ctx.db.insert("googleCalendarJobs", { requestId, revision: 1, attempt: 0, dueAt: now, status: "pending" });
  const config = await ctx.db.query("googleCalendarAutomation").unique();
  if (config?.enabled && job?.status !== "running") {
    // Scheduling is internal, transactional, and never contacts Google. The cron
    // also drains durable jobs if scheduling cannot complete.
    await ctx.scheduler.runAfter(0, internal.googleCalendar.automatic, { requestId });
  }
}

// Instrument only the existing request writers. Queries and other tables retain
// the native database API; sync bookkeeping uses the unwrapped database.
export function calendarDb<T extends QueryCtx | MutationCtx>(ctx: T): T["db"] {
  if (!("scheduler" in ctx)) return ctx.db;
  const mutationCtx = ctx as MutationCtx;
  return new Proxy(ctx.db, {
    get(target, property) {
      const method = Reflect.get(target, property);
      if (typeof method !== "function") return method;
      if (!["insert", "patch", "replace", "delete"].includes(String(property))) return method.bind(target);
      return async (...args: unknown[]) => {
        const id = typeof args[0] === "string" ? args[0] : "";
        let requestId = property !== "insert" ? mutationCtx.db.normalizeId("requests", id) : null;
        const quoteId = property !== "insert" ? mutationCtx.db.normalizeId("quotes", id) : null;
        const versionId = property !== "insert" ? mutationCtx.db.normalizeId("quoteVersions", id) : null;
        if (quoteId) requestId = (await mutationCtx.db.get(quoteId))?.requestId ?? null;
        if (versionId) {
          const version = await mutationCtx.db.get(versionId);
          if (version) requestId = (await mutationCtx.db.get(version.quoteId))?.requestId ?? null;
        }
        const result: unknown = await Reflect.apply(method, target, args);
        if (property === "insert" && args[0] === "requests") requestId = result as Id<"requests">;
        if (property === "insert" && args[0] === "quotes") requestId = (args[1] as { requestId: Id<"requests"> }).requestId;
        if (requestId) await enqueueCalendar(mutationCtx, requestId);
        return result;
      };
    },
  });
}
