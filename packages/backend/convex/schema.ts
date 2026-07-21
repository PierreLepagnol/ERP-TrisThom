import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const requestStatus = v.union(
  v.literal("nouveau"),
  v.literal("a_qualifier"),
  v.literal("qualifie"),
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
    budgetPerPersonCents: v.optional(v.number()),
    message: v.optional(v.string()),
    specialNeeds: v.optional(v.string()),
    dietaryRequirements: v.optional(v.string()),
    staffingNeeds: v.optional(v.string()),
    missingInformation: v.array(v.string()),
    quoteNumber: v.optional(v.string()),
    quoteAmountCents: v.optional(v.number()),
    nextActionAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    handledAt: v.optional(v.number()),
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

  inboxMessages: defineTable({
    externalId: v.string(),
    messageId: v.optional(v.string()),
    senderName: v.optional(v.string()),
    senderEmail: v.optional(v.string()),
    subject: v.optional(v.string()),
    receivedAt: v.optional(v.number()),
    textPreview: v.optional(v.string()),
    attachmentNames: v.array(v.string()),
    hasPdfAttachment: v.boolean(),
    outcome: v.union(v.literal("created"), v.literal("ignored")),
    requestId: v.optional(v.id("requests")),
    createdAt: v.number(),
  })
    .index("by_externalId", ["externalId"])
    .index("by_requestId", ["requestId"]),

  emailMessages: defineTable({
    requestId: v.id("requests"),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    messageId: v.string(),
    inReplyTo: v.optional(v.string()),
    subject: v.optional(v.string()),
    body: v.string(),
    senderEmail: v.optional(v.string()),
    recipientEmail: v.optional(v.string()),
    attachmentNames: v.optional(v.array(v.string())),
    sentAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_requestId_and_sentAt", ["requestId", "sentAt"]),

  emailTemplates: defineTable({
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_updatedAt", ["updatedAt"]),

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

  requestNotes: defineTable({
    requestId: v.id("requests"),
    content: v.string(),
    createdAt: v.number(),
    importKey: v.optional(v.string()),
  }).index("by_requestId", ["requestId"]).index("by_importKey", ["importKey"]),

  requestHistory: defineTable({
    requestId: v.id("requests"),
    label: v.string(),
    createdAt: v.number(),
    importKey: v.optional(v.string()),
  }).index("by_requestId", ["requestId"]).index("by_importKey", ["importKey"]),

  quotes: defineTable({
    requestId: v.id("requests"),
    quoteNumber: v.string(),
    currentVersionId: v.optional(v.id("quoteVersions")),
    status: v.union(
      v.literal("brouillon"),
      v.literal("pret"),
      v.literal("envoye"),
      v.literal("accepte"),
      v.literal("refuse"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
    acceptedAt: v.optional(v.number()),
    totalHtCents: v.number(),
    totalVatCents: v.number(),
    totalTtcCents: v.number(),
  }).index("by_requestId", ["requestId"]),

  quoteVersions: defineTable({
    quoteId: v.id("quotes"),
    versionNumber: v.number(),
    status: v.union(
      v.literal("brouillon"),
      v.literal("pret"),
      v.literal("envoye"),
      v.literal("accepte"),
      v.literal("refuse"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    sentAt: v.optional(v.number()),
    revisionReason: v.optional(v.string()),
    discountCents: v.number(),
    issueDate: v.number(),
    validUntil: v.number(),
    depositPercent: v.number(),
    included: v.string(),
    excluded: v.string(),
    logistics: v.string(),
    introduction: v.optional(v.string()),
    conditions: v.optional(v.string()),
    remarks: v.optional(v.string()),
    template: v.union(
      v.literal("libre"),
      v.literal("cocktail"),
      v.literal("buffet_froid"),
      v.literal("buffet_chaud"),
      v.literal("mariage"),
      v.literal("plateau_repas"),
      v.literal("brunch"),
    ),
    totalHtCents: v.number(),
    totalVatCents: v.number(),
    totalTtcCents: v.number(),
  }).index("by_quoteId_and_versionNumber", ["quoteId", "versionNumber"]),

  quoteLines: defineTable({
    quoteVersionId: v.id("quoteVersions"),
    position: v.number(),
    label: v.string(),
    quantity: v.number(),
    unitPriceCents: v.number(),
    vatRate: v.number(),
    details: v.optional(v.array(v.string())),
  }).index("by_quoteVersionId_and_position", ["quoteVersionId", "position"]),

  catalogItems: defineTable({
    externalId: v.string(),
    name: v.string(),
    description: v.string(),
    details: v.optional(v.array(v.string())),
    unit: v.string(),
    unitPriceCents: v.number(),
    foodCostCents: v.optional(v.number()),
    vatRate: v.number(),
    category: v.string(),
    active: v.boolean(),
    seasonality: v.array(v.string()),
    dietary: v.array(v.string()),
    allergens: v.array(v.string()),
    minimumQuantity: v.number(),
    productionMinutes: v.number(),
    capacityPerDay: v.number(),
    recommendedFor: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_externalId", ["externalId"]),
});
