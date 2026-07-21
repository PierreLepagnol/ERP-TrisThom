import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

function missingInformation(args: {
  contactEmail?: string;
  contactPhone?: string;
  eventAddress?: string;
  eventDate?: number;
  eventType?: string;
  guestCount?: number;
}) {
  const missing: string[] = [];
  if (!args.contactEmail && !args.contactPhone) missing.push("Coordonnées du contact");
  if (!args.eventDate) missing.push("Date de l'événement");
  if (!args.eventAddress) missing.push("Adresse de l'événement");
  if (!args.eventType) missing.push("Format souhaité");
  if (!args.guestCount) missing.push("Nombre de personnes");
  return missing;
}

export const ingestRequest = internalMutation({
  args: {
    externalSourceId: v.string(),
    contactName: v.string(),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    eventType: v.optional(v.string()),
    eventDate: v.optional(v.number()),
    eventAddress: v.optional(v.string()),
    guestCount: v.optional(v.number()),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingRequest = await ctx.db
      .query("requests")
      .withIndex("by_source_and_externalSourceId", (index) =>
        index.eq("source", "directus").eq("externalSourceId", args.externalSourceId),
      )
      .unique();

    if (existingRequest) return existingRequest._id;

    const now = Date.now();
    const requestMissingInformation = missingInformation(args);
    return await ctx.db.insert("requests", {
      ...args,
      source: "directus",
      status: "nouveau",
      missingInformation: requestMissingInformation,
      createdAt: now,
      updatedAt: now,
    });
  },
});
