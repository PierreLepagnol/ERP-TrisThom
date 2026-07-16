import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

export default defineSchema({
  contacts: defineTable({
    displayName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    organizationId: v.optional(v.id("organizations")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_organizationId", ["organizationId"]),

  organizations: defineTable({
    name: v.string(),
    siret: v.optional(v.string()),
    billingAddress: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  requests: defineTable({
    status: requestStatus,
    source: requestSource,
    externalSourceId: v.optional(v.string()),
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
    missingInformation: v.array(v.string()),
    quoteNumber: v.optional(v.string()),
    quoteAmountCents: v.optional(v.number()),
    nextActionAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    calendarSyncStatus: v.optional(
      v.union(v.literal("pending"), v.literal("synced"), v.literal("failed")),
    ),
    googleCalendarEventId: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_and_eventDate", ["status", "eventDate"])
    .index("by_eventDate", ["eventDate"])
    .index("by_nextActionAt", ["nextActionAt"])
    .index("by_contactEmail", ["contactEmail"])
    .index("by_source_and_externalSourceId", ["source", "externalSourceId"]),

  followUpTasks: defineTable({
    requestId: v.id("requests"),
    kind: v.union(v.literal("relance_j3"), v.literal("relance_j7"), v.literal("manuel")),
    title: v.string(),
    dueAt: v.number(),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_requestId", ["requestId"])
    .index("by_completedAt_and_dueAt", ["completedAt", "dueAt"]),
});
