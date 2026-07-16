import { v } from "convex/values";

import { authComponent } from "./auth";
import { mutation, query } from "./_generated/server";

const requestStatus = v.union(
  v.literal("nouveau"),
  v.literal("a_qualifier"),
  v.literal("devis_a_preparer"),
  v.literal("devis_envoye"),
  v.literal("relance"),
  v.literal("accepte"),
  v.literal("refuse"),
  v.literal("annule"),
);

const requestSource = v.union(
  v.literal("directus"),
  v.literal("email"),
  v.literal("telephone"),
  v.literal("1001traiteur"),
  v.literal("manuel"),
);

async function requireAuthenticatedUser(ctx: Parameters<typeof authComponent.safeGetAuthUser>[0]) {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) {
    throw new Error("Vous devez être connecté.");
  }
}

function findMissingInformation(args: {
  contactEmail?: string;
  contactPhone?: string;
  eventAddress?: string;
  eventDate?: number;
  eventType?: string;
  guestCount?: number;
}) {
  const missingInformation: string[] = [];

  if (!args.contactEmail && !args.contactPhone) missingInformation.push("Coordonnées du contact");
  if (!args.eventDate) missingInformation.push("Date de l'événement");
  if (!args.eventAddress) missingInformation.push("Adresse de l'événement");
  if (!args.eventType) missingInformation.push("Format souhaité");
  if (!args.guestCount) missingInformation.push("Nombre de personnes");

  return missingInformation;
}

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);

    const now = Date.now();
    const requests = await ctx.db.query("requests").order("desc").take(250);
    const openRequests = requests.filter((request) =>
      ["nouveau", "a_qualifier", "devis_a_preparer", "devis_envoye", "relance"].includes(
        request.status,
      ),
    );
    const pipelineCents = openRequests.reduce(
      (total, request) => total + (request.quoteAmountCents ?? 0),
      0,
    );
    const decidedRequests = requests.filter((request) =>
      ["accepte", "refuse", "annule"].includes(request.status),
    );
    const acceptedRequests = decidedRequests.filter((request) => request.status === "accepte");
    const followUps = await ctx.db
      .query("followUpTasks")
      .withIndex("by_completedAt_and_dueAt", (index) => index.eq("completedAt", undefined))
      .take(100);

    return {
      metrics: {
        activeRequests: openRequests.length,
        quotesToPrepare: requests.filter((request) => request.status === "devis_a_preparer").length,
        pipelineCents,
        conversionRate:
          decidedRequests.length === 0
            ? null
            : Math.round((acceptedRequests.length / decidedRequests.length) * 100),
      },
      priorities: followUps
        .filter((task) => task.dueAt <= now + 7 * 24 * 60 * 60 * 1000)
        .sort((first, second) => first.dueAt - second.dueAt)
        .slice(0, 6),
      upcomingEvents: requests
        .filter((request) => request.eventDate && request.eventDate >= now)
        .sort((first, second) => (first.eventDate ?? 0) - (second.eventDate ?? 0))
        .slice(0, 5),
      pipeline: ["nouveau", "a_qualifier", "devis_a_preparer", "devis_envoye", "relance"].map(
        (status) => ({
          status,
          count: requests.filter((request) => request.status === status).length,
        }),
      ),
    };
  },
});

export const listRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    return await ctx.db.query("requests").order("desc").take(100);
  },
});

export const listCalendarRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    const requests = await ctx.db.query("requests").order("desc").take(250);
    return requests
      .filter((request) => request.eventDate && request.status !== "annule")
      .sort((first, second) => (first.eventDate ?? 0) - (second.eventDate ?? 0));
  },
});

export const listClients = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    const requests = await ctx.db.query("requests").order("desc").take(250);
    const clients = new Map<string, {
      name: string;
      email?: string;
      phone?: string;
      organization?: string;
      requestCount: number;
      lastRequestAt: number;
    }>();

    for (const request of requests) {
      const key = request.contactEmail?.toLowerCase() ?? request.contactPhone ?? request.contactName.toLowerCase();
      const existing = clients.get(key);
      clients.set(key, {
        name: request.contactName,
        email: request.contactEmail ?? existing?.email,
        phone: request.contactPhone ?? existing?.phone,
        organization: request.organizationName ?? existing?.organization,
        requestCount: (existing?.requestCount ?? 0) + 1,
        lastRequestAt: Math.max(existing?.lastRequestAt ?? 0, request.createdAt),
      });
    }

    return [...clients.values()].sort((first, second) => second.lastRequestAt - first.lastRequestAt);
  },
});

export const createRequest = mutation({
  args: {
    source: requestSource,
    contactName: v.string(),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    organizationName: v.optional(v.string()),
    eventType: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    eventStartTime: v.optional(v.string()),
    eventEndTime: v.optional(v.string()),
    venue: v.optional(v.string()),
    eventAddress: v.optional(v.string()),
    guestCount: v.optional(v.number()),
    budgetCents: v.optional(v.number()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const now = Date.now();
    const contactName = args.contactName.trim() || "Contact à identifier";
    const missingInformation = findMissingInformation(args);

    const requestId = await ctx.db.insert("requests", {
      ...args,
      contactName,
      status: missingInformation.length > 0 ? "a_qualifier" : "nouveau",
      missingInformation,
      createdAt: now,
      updatedAt: now,
    });

    if (args.contactEmail) {
      const existingContact = await ctx.db
        .query("contacts")
        .withIndex("by_email", (index) => index.eq("email", args.contactEmail))
        .unique();

      if (existingContact) {
        await ctx.db.patch(existingContact._id, {
          displayName: contactName,
          phone: args.contactPhone ?? existingContact.phone,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("contacts", {
          displayName: contactName,
          email: args.contactEmail,
          phone: args.contactPhone,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return requestId;
  },
});

export const updateStatus = mutation({
  args: {
    requestId: v.id("requests"),
    status: requestStatus,
    eventStartTime: v.optional(v.string()),
    eventEndTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Demande introuvable.");

    const now = Date.now();
    if (args.status === "accepte") {
      if (!request.eventDate || !args.eventStartTime || !args.eventEndTime) {
        throw new Error("La date et les horaires sont obligatoires avant confirmation.");
      }

      await ctx.db.patch(request._id, {
        status: args.status,
        eventStartTime: args.eventStartTime,
        eventEndTime: args.eventEndTime,
        acceptedAt: now,
        calendarSyncStatus: "pending",
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.patch(request._id, {
      status: args.status,
      updatedAt: now,
    });

    if (args.status === "devis_envoye" && request.status !== "devis_envoye") {
      const day = 24 * 60 * 60 * 1000;
      await ctx.db.insert("followUpTasks", {
        requestId: request._id,
        kind: "relance_j3",
        title: `Relancer ${request.contactName} après le devis`,
        dueAt: now + 3 * day,
        createdAt: now,
      });
      await ctx.db.insert("followUpTasks", {
        requestId: request._id,
        kind: "relance_j7",
        title: `Relancer ${request.contactName} après le devis`,
        dueAt: now + 7 * day,
        createdAt: now,
      });
    }

    return null;
  },
});
