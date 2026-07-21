import { v } from "convex/values";

import { authComponent } from "./auth";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

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

const quoteStatus = v.union(
  v.literal("brouillon"),
  v.literal("pret"),
  v.literal("envoye"),
  v.literal("accepte"),
  v.literal("refuse"),
);

const quoteTemplate = v.union(
  v.literal("libre"),
  v.literal("cocktail"),
  v.literal("buffet_froid"),
  v.literal("buffet_chaud"),
  v.literal("mariage"),
  v.literal("plateau_repas"),
  v.literal("brunch"),
);

const quoteLine = v.object({
  id: v.string(),
  label: v.string(),
  quantity: v.number(),
  unitPriceCents: v.number(),
  vatRate: v.number(),
  details: v.optional(v.array(v.string())),
});

const localQuote = v.object({
  number: v.optional(v.string()),
  version: v.number(),
  status: quoteStatus,
  template: quoteTemplate,
  issueDate: v.number(),
  validUntil: v.number(),
  depositPercent: v.number(),
  included: v.string(),
  excluded: v.string(),
  logistics: v.string(),
  introduction: v.optional(v.string()),
  conditions: v.optional(v.string()),
  remarks: v.optional(v.string()),
  discountCents: v.number(),
  lines: v.array(quoteLine),
  updatedAt: v.number(),
  versions: v.array(v.object({
    version: v.number(),
    savedAt: v.number(),
    quote: v.any(),
  })),
});

const catalogItem = v.object({
  id: v.string(),
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
});

const seedRequest = v.object({
  _id: v.string(),
  status: requestStatus,
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
  budgetPerPersonCents: v.optional(v.number()),
  message: v.optional(v.string()),
  specialNeeds: v.optional(v.string()),
  dietaryRequirements: v.optional(v.string()),
  staffingNeeds: v.optional(v.string()),
  quote: v.optional(localQuote),
  missingInformation: v.array(v.string()),
  quoteAmountCents: v.optional(v.number()),
  nextActionAt: v.optional(v.number()),
  acceptedAt: v.optional(v.number()),
  handledAt: v.optional(v.number()),
  archivedAt: v.optional(v.number()),
  followUps: v.array(v.object({
    id: v.string(),
    title: v.string(),
    dueAt: v.number(),
    completedAt: v.optional(v.number()),
  })),
  notes: v.array(v.object({
    id: v.string(),
    content: v.string(),
    createdAt: v.number(),
  })),
  history: v.array(v.object({
    id: v.string(),
    label: v.string(),
    createdAt: v.number(),
  })),
  createdAt: v.number(),
  updatedAt: v.number(),
});

type RequestStatus = Doc<"requests">["status"];
type LocalQuoteInput = {
  number?: string;
  version: number;
  status: Doc<"quotes">["status"];
  template: Doc<"quoteVersions">["template"];
  issueDate: number;
  validUntil: number;
  depositPercent: number;
  included: string;
  excluded: string;
  logistics: string;
  introduction?: string;
  conditions?: string;
  remarks?: string;
  discountCents: number;
  lines: Array<{
    id: string;
    label: string;
    quantity: number;
    unitPriceCents: number;
    vatRate: number;
    details?: string[];
  }>;
  updatedAt: number;
  versions: unknown[];
};

const allowedTransitions: Record<RequestStatus, readonly RequestStatus[]> = {
  nouveau: ["nouveau", "a_qualifier", "qualifie", "refuse", "annule"],
  a_qualifier: ["a_qualifier", "qualifie", "refuse", "annule"],
  qualifie: ["qualifie", "devis_a_preparer", "refuse", "annule"],
  devis_a_preparer: ["devis_a_preparer", "devis_envoye", "refuse", "annule"],
  devis_envoye: ["devis_envoye", "relance", "accepte", "refuse", "annule"],
  relance: ["relance", "devis_envoye", "accepte", "refuse", "annule"],
  accepte: ["accepte", "annule"],
  refuse: ["refuse"],
  annule: ["annule"],
};

async function requireAuthenticatedUser(
  ctx: Parameters<typeof authComponent.safeGetAuthUser>[0],
) {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) throw new Error("Vous devez être connecté.");
}

function findMissingInformation(args: {
  contactEmail?: string;
  contactPhone?: string;
  eventAddress?: string;
  venue?: string;
  eventDate?: number;
  eventType?: string;
  guestCount?: number;
  eventStartTime?: string;
  eventEndTime?: string;
  budgetCents?: number;
  budgetPerPersonCents?: number;
  dietaryRequirements?: string;
  specialNeeds?: string;
  staffingNeeds?: string;
}) {
  const missing: string[] = [];
  if (!args.eventDate) missing.push("Date de l’événement");
  if (!args.eventAddress && !args.venue) missing.push("Lieu ou adresse");
  if (!args.guestCount) missing.push("Nombre de personnes");
  if (!args.eventType) missing.push("Type de prestation");
  if (!args.budgetCents && !args.budgetPerPersonCents) missing.push("Budget");
  if (!args.eventStartTime || !args.eventEndTime) missing.push("Horaires");
  if (!args.contactEmail && !args.contactPhone) missing.push("Coordonnées du client");
  if (!args.dietaryRequirements && !args.specialNeeds && !args.staffingNeeds) {
    missing.push("Besoins particuliers");
  }
  return missing;
}

function quoteTotals(lines: LocalQuoteInput["lines"], discountCents: number) {
  const groups = new Map<number, number>();
  for (const line of lines) {
    if (!Number.isFinite(line.quantity) || !Number.isFinite(line.unitPriceCents) || !Number.isFinite(line.vatRate)) {
      throw new Error("Une ligne de devis contient un nombre invalide.");
    }
    const amount = Math.max(0, Math.round(line.quantity * line.unitPriceCents));
    groups.set(line.vatRate, (groups.get(line.vatRate) ?? 0) + amount);
  }
  const gross = [...groups.values()].reduce((total, amount) => total + amount, 0);
  const discount = Math.min(gross, Math.max(0, Math.round(discountCents)));
  const entries = [...groups.entries()].sort(([first], [second]) => first - second);
  const allocations = entries.map(([rate, amount]) => {
    const exact = gross === 0 ? 0 : (discount * amount) / gross;
    return { rate, amount, allocated: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remainder = discount - allocations.reduce((total, item) => total + item.allocated, 0);
  for (const item of [...allocations].sort((first, second) => second.remainder - first.remainder || first.rate - second.rate)) {
    if (remainder <= 0) break;
    item.allocated += 1;
    remainder -= 1;
  }
  const totalHtCents = allocations.reduce((total, item) => total + item.amount - item.allocated, 0);
  const totalVatCents = allocations.reduce(
    (total, item) => total + Math.round((item.amount - item.allocated) * (item.rate / 100)),
    0,
  );
  return { totalHtCents, totalVatCents, totalTtcCents: totalHtCents + totalVatCents };
}

async function getRequestOrThrow(ctx: QueryCtx | MutationCtx, requestId: Id<"requests">) {
  const request = await ctx.db.get(requestId);
  if (!request) throw new Error("Demande introuvable.");
  return request;
}

async function addHistory(
  ctx: MutationCtx,
  requestId: Id<"requests">,
  label: string,
  createdAt = Date.now(),
) {
  await ctx.db.insert("requestHistory", { requestId, label, createdAt });
}

async function createFollowUps(ctx: MutationCtx, request: Doc<"requests">, now: number) {
  const open = await ctx.db
    .query("followUpTasks")
    .withIndex("by_requestId", (index) => index.eq("requestId", request._id))
    .take(20);
  if (open.some((task) => !task.completedAt)) return;
  const day = 86_400_000;
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

async function insertQuoteVersion(
  ctx: MutationCtx,
  quoteId: Id<"quotes">,
  input: LocalQuoteInput,
  versionNumber: number,
  createdAt: number,
) {
  if (input.lines.length > 200) throw new Error("Un devis ne peut pas dépasser 200 lignes.");
  const totals = quoteTotals(input.lines, input.discountCents);
  const versionId = await ctx.db.insert("quoteVersions", {
    quoteId,
    versionNumber,
    status: input.status,
    createdAt,
    updatedAt: input.updatedAt,
    sentAt: input.status === "envoye" ? input.updatedAt : undefined,
    discountCents: input.discountCents,
    issueDate: input.issueDate,
    validUntil: input.validUntil,
    depositPercent: input.depositPercent,
    included: input.included,
    excluded: input.excluded,
    logistics: input.logistics,
    introduction: input.introduction,
    conditions: input.conditions,
    remarks: input.remarks,
    template: input.template,
    ...totals,
  });
  await Promise.all(input.lines.map((line, position) => ctx.db.insert("quoteLines", {
    quoteVersionId: versionId,
    position,
    label: line.label,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    vatRate: line.vatRate,
    details: line.details,
  })));
  return { versionId, totals };
}

async function loadQuotes(ctx: QueryCtx, quoteDocs: Doc<"quotes">[]) {
  const versions = await ctx.db.query("quoteVersions").take(1_000);
  const lines = await ctx.db.query("quoteLines").take(4_000);
  const linesByVersion = new Map<Id<"quoteVersions">, typeof lines>();
  for (const line of lines) {
    const current = linesByVersion.get(line.quoteVersionId) ?? [];
    current.push(line);
    linesByVersion.set(line.quoteVersionId, current);
  }
  return quoteDocs.map((quote) => ({
    id: quote._id,
    requestId: quote.requestId,
    quoteNumber: quote.quoteNumber,
    currentVersionId: quote.currentVersionId ?? "",
    status: quote.status,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    sentAt: quote.sentAt,
    acceptedAt: quote.acceptedAt,
    totalHtCents: quote.totalHtCents,
    totalVatCents: quote.totalVatCents,
    totalTtcCents: quote.totalTtcCents,
    versions: versions
      .filter((version) => version.quoteId === quote._id)
      .sort((first, second) => first.versionNumber - second.versionNumber)
      .map((version) => ({
        id: version._id,
        versionNumber: version.versionNumber,
        status: version.status,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        sentAt: version.sentAt,
        revisionReason: version.revisionReason,
        lines: (linesByVersion.get(version._id) ?? [])
          .sort((first, second) => first.position - second.position)
          .map((line) => ({
            id: line._id,
            label: line.label,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
            vatRate: line.vatRate,
            details: line.details,
          })),
        discountCents: version.discountCents,
        issueDate: version.issueDate,
        validUntil: version.validUntil,
        depositPercent: version.depositPercent,
        included: version.included,
        excluded: version.excluded,
        logistics: version.logistics,
        introduction: version.introduction,
        conditions: version.conditions,
        remarks: version.remarks,
        template: version.template,
        totalHtCents: version.totalHtCents,
        totalVatCents: version.totalVatCents,
        totalTtcCents: version.totalTtcCents,
      })),
  }));
}

function legacyQuoteFromRecord(quote: Awaited<ReturnType<typeof loadQuotes>>[number]) {
  const current =
    quote.versions.find((version) => version.id === quote.currentVersionId) ??
    quote.versions[quote.versions.length - 1];
  if (!current) return undefined;
  return {
    number: quote.quoteNumber,
    version: current.versionNumber,
    status: current.status,
    template: current.template,
    issueDate: current.issueDate,
    validUntil: current.validUntil,
    depositPercent: current.depositPercent,
    included: current.included,
    excluded: current.excluded,
    logistics: current.logistics,
    introduction: current.introduction,
    conditions: current.conditions,
    remarks: current.remarks,
    discountCents: current.discountCents,
    lines: current.lines,
    updatedAt: current.updatedAt,
    versions: quote.versions
      .filter((version) => version.id !== current.id)
      .map((version) => ({
        version: version.versionNumber,
        savedAt: version.updatedAt,
        quote: {
          number: quote.quoteNumber,
          version: version.versionNumber,
          status: version.status,
          template: version.template,
          issueDate: version.issueDate,
          validUntil: version.validUntil,
          depositPercent: version.depositPercent,
          included: version.included,
          excluded: version.excluded,
          logistics: version.logistics,
          introduction: version.introduction,
          conditions: version.conditions,
          remarks: version.remarks,
          discountCents: version.discountCents,
          lines: version.lines,
          updatedAt: version.updatedAt,
          versions: [],
        },
      })),
  };
}

export const workspace = query({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    const [requests, notes, history, followUps, quoteDocs, catalog] = await Promise.all([
      ctx.db.query("requests").order("desc").take(500),
      ctx.db.query("requestNotes").take(2_000),
      ctx.db.query("requestHistory").take(4_000),
      ctx.db.query("followUpTasks").take(2_000),
      ctx.db.query("quotes").take(500),
      ctx.db.query("catalogItems").take(1_000),
    ]);
    const quotes = await loadQuotes(ctx, quoteDocs);
    const quoteByRequest = new Map(quotes.map((quote) => [quote.requestId, quote]));
    const notesByRequest = new Map<Id<"requests">, typeof notes>();
    const historyByRequest = new Map<Id<"requests">, typeof history>();
    const followUpsByRequest = new Map<Id<"requests">, typeof followUps>();
    for (const note of notes) {
      const entries = notesByRequest.get(note.requestId) ?? [];
      entries.push(note);
      notesByRequest.set(note.requestId, entries);
    }
    for (const entry of history) {
      const entries = historyByRequest.get(entry.requestId) ?? [];
      entries.push(entry);
      historyByRequest.set(entry.requestId, entries);
    }
    for (const task of followUps) {
      const entries = followUpsByRequest.get(task.requestId) ?? [];
      entries.push(task);
      followUpsByRequest.set(task.requestId, entries);
    }
    return {
      requests: requests.map((request) => {
        const quote = quoteByRequest.get(request._id);
        return {
          ...request,
          notes: (notesByRequest.get(request._id) ?? []).map((note) => ({
            id: note._id,
            content: note.content,
            createdAt: note.createdAt,
          })),
          history: (historyByRequest.get(request._id) ?? []).map((entry) => ({
            id: entry._id,
            label: entry.label,
            createdAt: entry.createdAt,
          })),
          followUps: (followUpsByRequest.get(request._id) ?? []).map((task) => ({
            id: task._id,
            title: task.title,
            dueAt: task.dueAt,
            completedAt: task.completedAt,
          })),
          quote: quote ? legacyQuoteFromRecord(quote) : undefined,
        };
      }),
      quotes,
      catalog: catalog
        .sort((first, second) => first.name.localeCompare(second.name, "fr"))
        .map(({ _id, _creationTime, externalId, createdAt, updatedAt, ...item }) => ({
          ...item,
          id: externalId,
        })),
    };
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
    budgetPerPersonCents: v.optional(v.number()),
    message: v.optional(v.string()),
    specialNeeds: v.optional(v.string()),
    dietaryRequirements: v.optional(v.string()),
    staffingNeeds: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const now = Date.now();
    const contactName = args.contactName.trim() || "Contact à identifier";
    const requestId = await ctx.db.insert("requests", {
      ...args,
      contactName,
      status: findMissingInformation(args).length ? "a_qualifier" : "nouveau",
      missingInformation: findMissingInformation(args),
      createdAt: now,
      updatedAt: now,
    });
    await addHistory(ctx, requestId, "Demande reçue", now);
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
    const request = await getRequestOrThrow(ctx, args.requestId);
    if (!allowedTransitions[request.status].includes(args.status)) {
      throw new Error("Cette transition de statut n’est pas autorisée.");
    }
    const now = Date.now();
    if (args.status === "accepte" && (!request.eventDate || !args.eventStartTime || !args.eventEndTime)) {
      throw new Error("La date et les horaires sont obligatoires avant confirmation.");
    }
    await ctx.db.patch(request._id, {
      status: args.status,
      eventStartTime: args.eventStartTime ?? request.eventStartTime,
      eventEndTime: args.eventEndTime ?? request.eventEndTime,
      acceptedAt: args.status === "accepte" ? now : request.acceptedAt,
      nextActionAt: args.status === "devis_envoye" ? now + 3 * 86_400_000 : request.nextActionAt,
      calendarSyncStatus: args.status === "accepte" ? "pending" : request.calendarSyncStatus,
      updatedAt: now,
    });
    if (args.status === "devis_envoye" && request.status !== "devis_envoye") {
      await createFollowUps(ctx, request, now);
    }
    await addHistory(ctx, request._id, `Statut modifié : ${args.status.replaceAll("_", " ")}`, now);
    return null;
  },
});

export const reopenCancelledRequest = mutation({
  args: {
    requestId: v.id("requests"),
    status: v.union(
      v.literal("nouveau"),
      v.literal("a_qualifier"),
      v.literal("qualifie"),
      v.literal("devis_a_preparer"),
      v.literal("devis_envoye"),
      v.literal("relance"),
      v.literal("accepte"),
      v.literal("refuse"),
    ),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    if (request.status !== "annule") {
      throw new Error("Seul un dossier annulé peut être réouvert.");
    }
    const quote = await ctx.db
      .query("quotes")
      .withIndex("by_requestId", (index) => index.eq("requestId", request._id))
      .unique();
    const versions = quote
      ? await ctx.db
        .query("quoteVersions")
        .withIndex("by_quoteId_and_versionNumber", (index) => index.eq("quoteId", quote._id))
        .take(100)
      : [];
    const sent = versions.some((version) => version.status === "envoye" || Boolean(version.sentAt));
    const missingInformation = findMissingInformation(request);
    if (["qualifie", "devis_a_preparer"].includes(args.status) && missingInformation.length) {
      throw new Error(`À compléter : ${missingInformation.join(", ")}`);
    }
    if (["devis_envoye", "relance"].includes(args.status) && !sent) {
      throw new Error("Un devis envoyé est nécessaire pour ce statut.");
    }
    if (args.status === "accepte" && (!sent || !request.eventDate || !request.eventStartTime || !request.eventEndTime)) {
      throw new Error("Un devis envoyé, la date et les horaires sont obligatoires avant confirmation.");
    }
    const now = Date.now();
    await ctx.db.patch(request._id, {
      status: args.status,
      archivedAt: undefined,
      missingInformation,
      acceptedAt: args.status === "accepte" ? now : request.acceptedAt,
      updatedAt: now,
    });
    await addHistory(ctx, request._id, `Dossier réouvert : passage de Annulé à ${args.status.replaceAll("_", " ")}`, now);
    return null;
  },
});

export const updateRequest = mutation({
  args: {
    requestId: v.id("requests"),
    changes: v.object({
      organizationName: v.optional(v.union(v.string(), v.null())),
      contactName: v.optional(v.string()),
      contactEmail: v.optional(v.union(v.string(), v.null())),
      contactPhone: v.optional(v.union(v.string(), v.null())),
      eventType: v.optional(v.union(v.string(), v.null())),
      eventDate: v.optional(v.union(v.number(), v.null())),
      eventStartTime: v.optional(v.union(v.string(), v.null())),
      eventEndTime: v.optional(v.union(v.string(), v.null())),
      eventAddress: v.optional(v.union(v.string(), v.null())),
      guestCount: v.optional(v.union(v.number(), v.null())),
      budgetCents: v.optional(v.union(v.number(), v.null())),
      budgetPerPersonCents: v.optional(v.union(v.number(), v.null())),
      specialNeeds: v.optional(v.union(v.string(), v.null())),
      dietaryRequirements: v.optional(v.union(v.string(), v.null())),
      staffingNeeds: v.optional(v.union(v.string(), v.null())),
    }),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const changes = Object.fromEntries(
      Object.entries(args.changes).map(([key, value]) => [key, value ?? undefined]),
    );
    const next = { ...request, ...changes };
    const now = Date.now();
    await ctx.db.patch(request._id, {
      ...changes,
      missingInformation: findMissingInformation(next),
      updatedAt: now,
    });
    await addHistory(ctx, request._id, "Informations du dossier modifiées", now);
    return null;
  },
});

export const qualifyRequest = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const missing = findMissingInformation(request);
    if (missing.length) throw new Error(`À compléter : ${missing.join(", ")}`);
    if (!allowedTransitions[request.status].includes("qualifie")) {
      throw new Error("La demande ne peut pas être qualifiée depuis son statut actuel.");
    }
    const now = Date.now();
    await ctx.db.patch(request._id, { status: "qualifie", missingInformation: [], updatedAt: now });
    await addHistory(ctx, request._id, "Demande qualifiée", now);
    return null;
  },
});

export const addNote = mutation({
  args: { requestId: v.id("requests"), content: v.string() },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const content = args.content.trim();
    if (!content) throw new Error("La note ne peut pas être vide.");
    const now = Date.now();
    await ctx.db.insert("requestNotes", { requestId: request._id, content, createdAt: now });
    await ctx.db.patch(request._id, { updatedAt: now });
    await addHistory(ctx, request._id, "Note interne ajoutée", now);
    return null;
  },
});

export const markHandled = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const now = Date.now();
    await ctx.db.patch(request._id, { handledAt: now, updatedAt: now });
    await addHistory(ctx, request._id, "Demande marquée comme traitée", now);
    return null;
  },
});

export const startQuotePreparation = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const missing = findMissingInformation(request);
    if (missing.length) throw new Error(`À compléter : ${missing.join(", ")}`);
    if (!allowedTransitions[request.status].includes("devis_a_preparer")) {
      throw new Error("La demande doit être qualifiée avant la préparation du devis.");
    }
    const now = Date.now();
    await ctx.db.patch(request._id, { status: "devis_a_preparer", missingInformation: [], updatedAt: now });
    if (request.status !== "devis_a_preparer") {
      await addHistory(ctx, request._id, "Préparation du devis commencée", now);
    }
    return null;
  },
});

export const scheduleFollowUp = mutation({
  args: { requestId: v.id("requests"), dueAt: v.number() },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    if (!allowedTransitions[request.status].includes("relance")) {
      throw new Error("Une relance ne peut être programmée qu’après l’envoi du devis.");
    }
    const now = Date.now();
    await ctx.db.insert("followUpTasks", {
      requestId: request._id,
      kind: "manuel",
      title: `Relancer ${request.contactName}`,
      dueAt: args.dueAt,
      createdAt: now,
    });
    await ctx.db.patch(request._id, { status: "relance", nextActionAt: args.dueAt, updatedAt: now });
    await addHistory(ctx, request._id, "Relance programmée", now);
    return null;
  },
});

export const closeRequest = mutation({
  args: { requestId: v.id("requests"), status: v.union(v.literal("refuse"), v.literal("annule")), reason: v.string() },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    if (!allowedTransitions[request.status].includes(args.status)) {
      throw new Error("Cette clôture n’est pas autorisée depuis le statut actuel.");
    }
    const reason = args.reason.trim();
    if (!reason) throw new Error("Un motif est obligatoire.");
    const now = Date.now();
    await ctx.db.patch(request._id, { status: args.status, updatedAt: now });
    await ctx.db.insert("requestNotes", {
      requestId: request._id,
      content: `${args.status === "refuse" ? "Refus" : "Annulation"} : ${reason}`,
      createdAt: now,
    });
    await addHistory(ctx, request._id, `${args.status === "refuse" ? "Demande refusée" : "Demande annulée"} : ${reason}`, now);
    return null;
  },
});

export const archiveRequest = mutation({
  args: { requestId: v.id("requests"), archived: v.boolean() },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const now = Date.now();
    await ctx.db.patch(request._id, { archivedAt: args.archived ? now : undefined, updatedAt: now });
    await addHistory(ctx, request._id, args.archived ? "Dossier archivé" : "Dossier désarchivé", now);
    return null;
  },
});

export const completeFollowUp = mutation({
  args: { requestId: v.id("requests"), followUpId: v.id("followUpTasks") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    await getRequestOrThrow(ctx, args.requestId);
    const task = await ctx.db.get(args.followUpId);
    if (!task || task.requestId !== args.requestId) throw new Error("Relance introuvable.");
    const now = Date.now();
    await ctx.db.patch(task._id, { completedAt: now });
    await ctx.db.patch(args.requestId, { updatedAt: now });
    await addHistory(ctx, args.requestId, "Relance marquée comme effectuée", now);
    return null;
  },
});

async function saveQuoteRecord(ctx: MutationCtx, request: Doc<"requests">, input: LocalQuoteInput) {
  if (input.lines.length > 200) throw new Error("Un devis ne peut pas dépasser 200 lignes.");
  const existing = await ctx.db
    .query("quotes")
    .withIndex("by_requestId", (index) => index.eq("requestId", request._id))
    .unique();
  const now = Date.now();
  if (!existing) {
    const number = input.number ?? `D-${new Date(now).getFullYear()}-${request._id.slice(-6).toUpperCase()}`;
    const quoteId = await ctx.db.insert("quotes", {
      requestId: request._id,
      quoteNumber: number,
      status: input.status,
      createdAt: now,
      updatedAt: now,
      sentAt: input.status === "envoye" ? now : undefined,
      totalHtCents: 0,
      totalVatCents: 0,
      totalTtcCents: 0,
    });
    const { versionId, totals } = await insertQuoteVersion(ctx, quoteId, { ...input, updatedAt: now }, 1, now);
    await ctx.db.patch(quoteId, { currentVersionId: versionId, ...totals });
    return { quoteId, versionId, number, totals };
  }
  const currentVersion = existing.currentVersionId ? await ctx.db.get(existing.currentVersionId) : null;
  if (!currentVersion) throw new Error("La version courante du devis est introuvable.");
  const oldLines = await ctx.db
    .query("quoteLines")
    .withIndex("by_quoteVersionId_and_position", (index) => index.eq("quoteVersionId", currentVersion._id))
    .take(200);
  await Promise.all(oldLines.map((line) => ctx.db.delete(line._id)));
  const totals = quoteTotals(input.lines, input.discountCents);
  await ctx.db.patch(currentVersion._id, {
    status: input.status,
    updatedAt: now,
    sentAt: input.status === "envoye" ? currentVersion.sentAt ?? now : currentVersion.sentAt,
    discountCents: input.discountCents,
    issueDate: input.issueDate,
    validUntil: input.validUntil,
    depositPercent: input.depositPercent,
    included: input.included,
    excluded: input.excluded,
    logistics: input.logistics,
    introduction: input.introduction,
    conditions: input.conditions,
    remarks: input.remarks,
    template: input.template,
    ...totals,
  });
  await Promise.all(input.lines.map((line, position) => ctx.db.insert("quoteLines", {
    quoteVersionId: currentVersion._id,
    position,
    label: line.label,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    vatRate: line.vatRate,
    details: line.details,
  })));
  await ctx.db.patch(existing._id, {
    status: input.status,
    updatedAt: now,
    sentAt: input.status === "envoye" ? existing.sentAt ?? now : existing.sentAt,
    ...totals,
  });
  return { quoteId: existing._id, versionId: currentVersion._id, number: existing.quoteNumber, totals };
}

export const saveQuote = mutation({
  args: { requestId: v.id("requests"), quote: localQuote },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const now = Date.now();
    const stored = await saveQuoteRecord(ctx, request, args.quote as LocalQuoteInput);
    const sent = args.quote.status === "envoye";
    await ctx.db.patch(request._id, {
      status: sent ? "devis_envoye" : request.status,
      quoteNumber: stored.number,
      quoteAmountCents: stored.totals.totalTtcCents,
      nextActionAt: sent ? now + 3 * 86_400_000 : request.nextActionAt,
      updatedAt: now,
    });
    if (sent && request.status !== "devis_envoye") await createFollowUps(ctx, request, now);
    await addHistory(ctx, request._id, sent ? "Devis marqué comme envoyé" : "Brouillon de devis enregistré", now);
    return null;
  },
});

export const createQuoteVersion = mutation({
  args: { requestId: v.id("requests"), quote: localQuote },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const existing = await ctx.db
      .query("quotes")
      .withIndex("by_requestId", (index) => index.eq("requestId", request._id))
      .unique();
    if (!existing) {
      const now = Date.now();
      const stored = await saveQuoteRecord(ctx, request, {
        ...(args.quote as LocalQuoteInput),
        status: "brouillon",
        updatedAt: now,
      });
      await ctx.db.patch(request._id, {
        quoteNumber: stored.number,
        quoteAmountCents: stored.totals.totalTtcCents,
        updatedAt: now,
      });
      await addHistory(ctx, request._id, `Nouvelle version du devis ${stored.number} créée`, now);
    } else {
      const versions = await ctx.db
        .query("quoteVersions")
        .withIndex("by_quoteId_and_versionNumber", (index) => index.eq("quoteId", existing._id))
        .take(100);
      const now = Date.now();
      const versionNumber = Math.max(0, ...versions.map((version) => version.versionNumber)) + 1;
      const input = { ...(args.quote as LocalQuoteInput), status: "brouillon" as const, updatedAt: now };
      const { versionId, totals } = await insertQuoteVersion(ctx, existing._id, input, versionNumber, now);
      await ctx.db.patch(existing._id, {
        currentVersionId: versionId,
        status: "brouillon",
        sentAt: undefined,
        acceptedAt: undefined,
        updatedAt: now,
        ...totals,
      });
      await ctx.db.patch(request._id, { quoteAmountCents: totals.totalTtcCents, updatedAt: now });
      await addHistory(ctx, request._id, `Nouvelle version du devis ${existing.quoteNumber} créée`, now);
    }
    return await loadLocalQuote(ctx, request._id);
  },
});

async function loadLocalQuote(ctx: QueryCtx | MutationCtx, requestId: Id<"requests">) {
  const quote = await ctx.db
    .query("quotes")
    .withIndex("by_requestId", (index) => index.eq("requestId", requestId))
    .unique();
  if (!quote || !quote.currentVersionId) throw new Error("Devis introuvable.");
  const version = await ctx.db.get(quote.currentVersionId);
  if (!version) throw new Error("Version de devis introuvable.");
  const lines = await ctx.db
    .query("quoteLines")
    .withIndex("by_quoteVersionId_and_position", (index) => index.eq("quoteVersionId", version._id))
    .take(200);
  return {
    number: quote.quoteNumber,
    version: version.versionNumber,
    status: version.status,
    template: version.template,
    issueDate: version.issueDate,
    validUntil: version.validUntil,
    depositPercent: version.depositPercent,
    included: version.included,
    excluded: version.excluded,
    logistics: version.logistics,
    introduction: version.introduction,
    conditions: version.conditions,
    remarks: version.remarks,
    discountCents: version.discountCents,
    lines: lines.map((line) => ({
      id: line._id,
      label: line.label,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      vatRate: line.vatRate,
      details: line.details,
    })),
    updatedAt: version.updatedAt,
    versions: [],
  };
}

export const restoreQuoteVersion = mutation({
  args: { requestId: v.id("requests"), versionId: v.id("quoteVersions") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const quote = await ctx.db
      .query("quotes")
      .withIndex("by_requestId", (index) => index.eq("requestId", request._id))
      .unique();
    const source = await ctx.db.get(args.versionId);
    if (!quote || !source || source.quoteId !== quote._id) throw new Error("Version de devis introuvable.");
    const sourceLines = await ctx.db
      .query("quoteLines")
      .withIndex("by_quoteVersionId_and_position", (index) => index.eq("quoteVersionId", source._id))
      .take(200);
    const versions = await ctx.db
      .query("quoteVersions")
      .withIndex("by_quoteId_and_versionNumber", (index) => index.eq("quoteId", quote._id))
      .take(100);
    const now = Date.now();
    const input: LocalQuoteInput = {
      number: quote.quoteNumber,
      version: source.versionNumber,
      status: "brouillon",
      template: source.template,
      issueDate: source.issueDate,
      validUntil: source.validUntil,
      depositPercent: source.depositPercent,
      included: source.included,
      excluded: source.excluded,
      logistics: source.logistics,
      introduction: source.introduction,
      conditions: source.conditions,
      remarks: source.remarks,
      discountCents: source.discountCents,
      lines: sourceLines.map((line) => ({ id: line._id, ...line })),
      updatedAt: now,
      versions: [],
    };
    const versionNumber = Math.max(...versions.map((version) => version.versionNumber)) + 1;
    const { versionId, totals } = await insertQuoteVersion(ctx, quote._id, input, versionNumber, now);
    await ctx.db.patch(quote._id, { currentVersionId: versionId, status: "brouillon", updatedAt: now, ...totals });
    await ctx.db.patch(request._id, { quoteAmountCents: totals.totalTtcCents, updatedAt: now });
    await addHistory(ctx, request._id, `Nouvelle version du devis ${quote.quoteNumber} créée`, now);
    return await loadLocalQuote(ctx, request._id);
  },
});

export const deleteQuoteVersion = mutation({
  args: { requestId: v.id("requests"), versionId: v.id("quoteVersions") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const quote = await ctx.db
      .query("quotes")
      .withIndex("by_requestId", (index) => index.eq("requestId", request._id))
      .unique();
    const version = await ctx.db.get(args.versionId);
    if (!quote || !version || version.quoteId !== quote._id) {
      throw new Error("Version de devis introuvable.");
    }
    if (version.sentAt || !["brouillon", "pret"].includes(version.status)) {
      throw new Error("Cette version a une valeur historique et ne peut pas être supprimée.");
    }

    const versions = await ctx.db
      .query("quoteVersions")
      .withIndex("by_quoteId_and_versionNumber", (index) => index.eq("quoteId", quote._id))
      .take(100);
    const lines = await ctx.db
      .query("quoteLines")
      .withIndex("by_quoteVersionId_and_position", (index) => index.eq("quoteVersionId", version._id))
      .take(200);
    await Promise.all(lines.map((line) => ctx.db.delete(line._id)));
    await ctx.db.delete(version._id);

    const remaining = versions.filter((item) => item._id !== version._id);
    const now = Date.now();
    if (remaining.length === 0) {
      await ctx.db.delete(quote._id);
      await ctx.db.patch(request._id, {
        status: request.missingInformation.length ? "a_qualifier" : "devis_a_preparer",
        quoteNumber: undefined,
        quoteAmountCents: undefined,
        updatedAt: now,
      });
      await addHistory(ctx, request._id, `Devis brouillon ${quote.quoteNumber} supprimé`, now);
      return null;
    }

    const current = version._id === quote.currentVersionId
      ? [...remaining].sort((left, right) => right.versionNumber - left.versionNumber)[0]!
      : remaining.find((item) => item._id === quote.currentVersionId) ?? remaining[remaining.length - 1]!;
    await ctx.db.patch(quote._id, {
      currentVersionId: current._id,
      status: current.status,
      sentAt: current.sentAt,
      acceptedAt: current.status === "accepte" ? quote.acceptedAt : undefined,
      totalHtCents: current.totalHtCents,
      totalVatCents: current.totalVatCents,
      totalTtcCents: current.totalTtcCents,
      updatedAt: now,
    });
    await ctx.db.patch(request._id, {
      status: current.status === "envoye" ? "devis_envoye" : current.status === "accepte" ? "accepte" : request.status,
      acceptedAt: current.status === "accepte" ? quote.acceptedAt : undefined,
      quoteAmountCents: current.totalTtcCents,
      updatedAt: now,
    });
    await addHistory(ctx, request._id, `Version brouillon ${version.versionNumber} du devis ${quote.quoteNumber} supprimée`, now);
    return null;
  },
});

export const markQuoteSent = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const quote = await ctx.db.query("quotes").withIndex("by_requestId", (index) => index.eq("requestId", request._id)).unique();
    if (!quote?.currentVersionId) throw new Error("Aucun devis ne peut être envoyé pour ce dossier.");
    if (!allowedTransitions[request.status].includes("devis_envoye")) throw new Error("Le devis ne peut pas être envoyé depuis ce statut.");
    const version = await ctx.db.get(quote.currentVersionId);
    if (!version) throw new Error("Version de devis introuvable.");
    const now = Date.now();
    await ctx.db.patch(version._id, { status: "envoye", sentAt: now, updatedAt: now });
    await ctx.db.patch(quote._id, { status: "envoye", sentAt: now, updatedAt: now });
    await ctx.db.patch(request._id, { status: "devis_envoye", quoteAmountCents: quote.totalTtcCents, nextActionAt: now + 3 * 86_400_000, updatedAt: now });
    await createFollowUps(ctx, request, now);
    await addHistory(ctx, request._id, `Devis ${quote.quoteNumber} marqué comme envoyé`, now);
    return null;
  },
});

export const confirmService = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    if (!request.eventDate || !request.eventStartTime || !request.eventEndTime) {
      throw new Error("La date et les horaires sont obligatoires avant confirmation.");
    }
    if (!allowedTransitions[request.status].includes("accepte")) throw new Error("La prestation ne peut pas être confirmée depuis ce statut.");
    const quote = await ctx.db.query("quotes").withIndex("by_requestId", (index) => index.eq("requestId", request._id)).unique();
    if (!quote?.currentVersionId) throw new Error("Un devis est nécessaire avant de confirmer la prestation.");
    const version = await ctx.db.get(quote.currentVersionId);
    if (!version) throw new Error("Version de devis introuvable.");
    const now = Date.now();
    await ctx.db.patch(version._id, { status: "accepte", updatedAt: now });
    await ctx.db.patch(quote._id, { status: "accepte", acceptedAt: now, updatedAt: now });
    await ctx.db.patch(request._id, { status: "accepte", acceptedAt: now, handledAt: now, quoteAmountCents: quote.totalTtcCents, calendarSyncStatus: "pending", updatedAt: now });
    await addHistory(ctx, request._id, "Prestation confirmée après acceptation du devis", now);
    return null;
  },
});

export const saveCatalogItem = mutation({
  args: { item: catalogItem },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const existing = await ctx.db.query("catalogItems").withIndex("by_externalId", (index) => index.eq("externalId", args.item.id)).unique();
    const now = Date.now();
    const { id, ...item } = args.item;
    if (existing) await ctx.db.patch(existing._id, { ...item, updatedAt: now });
    else await ctx.db.insert("catalogItems", { ...item, externalId: id, createdAt: now, updatedAt: now });
    return null;
  },
});

export const deleteCatalogItem = mutation({
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const item = await ctx.db.query("catalogItems").withIndex("by_externalId", (index) => index.eq("externalId", args.itemId)).unique();
    if (!item) throw new Error("Article de catalogue introuvable.");
    await ctx.db.delete(item._id);
    return null;
  },
});

const demoContactNames = new Set([
  "Camille Robert", "Lina Benali", "Nicolas Perrin", "Élodie Marchal",
  "Hélène Martin", "Sophie Leroy", "Justine et Marc Delorme", "Claire Dumas",
  "Thomas Giraud", "Romain Faure", "Mathieu Girard", "Anaïs Roussel",
]);

export const removeDemoRequests = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    const requests = await ctx.db.query("requests").take(100);
    const demoRequests = requests.filter((request) =>
      demoContactNames.has(request.contactName) && !request.externalSourceId,
    );
    for (const request of demoRequests) {
      const [notes, history, followUps, quote] = await Promise.all([
        ctx.db.query("requestNotes").withIndex("by_requestId", (index) => index.eq("requestId", request._id)).take(100),
        ctx.db.query("requestHistory").withIndex("by_requestId", (index) => index.eq("requestId", request._id)).take(100),
        ctx.db.query("followUpTasks").withIndex("by_requestId", (index) => index.eq("requestId", request._id)).take(100),
        ctx.db.query("quotes").withIndex("by_requestId", (index) => index.eq("requestId", request._id)).unique(),
      ]);
      for (const row of [...notes, ...history, ...followUps]) await ctx.db.delete(row._id);
      if (quote) {
        const versions = await ctx.db.query("quoteVersions").withIndex("by_quoteId_and_versionNumber", (index) => index.eq("quoteId", quote._id)).take(100);
        for (const version of versions) {
          const lines = await ctx.db.query("quoteLines").withIndex("by_quoteVersionId_and_position", (index) => index.eq("quoteVersionId", version._id)).take(200);
          for (const line of lines) await ctx.db.delete(line._id);
          await ctx.db.delete(version._id);
        }
        await ctx.db.delete(quote._id);
      }
      await ctx.db.delete(request._id);
    }
    return { removedRequestCount: demoRequests.length };
  },
});

/** Removes every dossier while preserving the catalogue and the inbox import ledger. */
export const clearAllRequests = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAuthenticatedUser(ctx);
    const requests = await ctx.db.query("requests").take(500);
    for (const request of requests) {
      const [notes, history, followUps, messages, quote] = await Promise.all([
        ctx.db.query("requestNotes").withIndex("by_requestId", (index) => index.eq("requestId", request._id)).take(500),
        ctx.db.query("requestHistory").withIndex("by_requestId", (index) => index.eq("requestId", request._id)).take(500),
        ctx.db.query("followUpTasks").withIndex("by_requestId", (index) => index.eq("requestId", request._id)).take(500),
        ctx.db.query("emailMessages").withIndex("by_requestId_and_sentAt", (index) => index.eq("requestId", request._id)).take(500),
        ctx.db.query("quotes").withIndex("by_requestId", (index) => index.eq("requestId", request._id)).unique(),
      ]);
      for (const row of [...notes, ...history, ...followUps, ...messages]) await ctx.db.delete(row._id);
      if (quote) {
        const versions = await ctx.db.query("quoteVersions").withIndex("by_quoteId_and_versionNumber", (index) => index.eq("quoteId", quote._id)).take(500);
        for (const version of versions) {
          const lines = await ctx.db.query("quoteLines").withIndex("by_quoteVersionId_and_position", (index) => index.eq("quoteVersionId", version._id)).take(500);
          for (const line of lines) await ctx.db.delete(line._id);
          await ctx.db.delete(version._id);
        }
        await ctx.db.delete(quote._id);
      }
      await ctx.db.delete(request._id);
    }
    // Keep message ids so the mailbox poller does not import old test e-mails again.
    const inboxMessages = await ctx.db.query("inboxMessages").take(1_000);
    for (const message of inboxMessages) await ctx.db.patch(message._id, { requestId: undefined });
    return { removedRequestCount: requests.length };
  },
});

async function clearTable(ctx: MutationCtx, table: "requestNotes" | "requestHistory" | "followUpTasks" | "quoteLines" | "quoteVersions" | "quotes" | "requests" | "catalogItems") {
  const rows = await ctx.db.query(table).take(5_000);
  await Promise.all(rows.map((row) => ctx.db.delete(row._id)));
}

export const resetDemoData = mutation({
  args: {
    requests: v.array(seedRequest),
    catalog: v.array(catalogItem),
    onlyIfEmpty: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    if (args.requests.length > 100 || args.catalog.length > 1_000) throw new Error("Le jeu de démonstration est trop volumineux.");
    if (args.onlyIfEmpty) {
      const [request, catalogItem] = await Promise.all([
        ctx.db.query("requests").take(1),
        ctx.db.query("catalogItems").take(1),
      ]);
      if (request.length > 0 || catalogItem.length > 0) {
        return { requestCount: 0, catalogItemCount: 0 };
      }
    }
    for (const table of ["requestNotes", "requestHistory", "followUpTasks", "quoteLines", "quoteVersions", "quotes", "requests", "catalogItems"] as const) {
      await clearTable(ctx, table);
    }
    const requestIds = new Map<string, Id<"requests">>();
    for (const input of args.requests) {
      const { _id, followUps, notes, history, quote, ...request } = input;
      const requestId = await ctx.db.insert("requests", request);
      requestIds.set(_id, requestId);
      await Promise.all(notes.map((note) => ctx.db.insert("requestNotes", { requestId, content: note.content, createdAt: note.createdAt })));
      await Promise.all(history.map((entry) => ctx.db.insert("requestHistory", { requestId, label: entry.label, createdAt: entry.createdAt })));
      await Promise.all(followUps.map((task) => ctx.db.insert("followUpTasks", {
        requestId,
        kind: "manuel",
        title: task.title,
        dueAt: task.dueAt,
        completedAt: task.completedAt,
        createdAt: request.createdAt,
      })));
      if (quote) {
        const quoteId = await ctx.db.insert("quotes", {
          requestId,
          quoteNumber: quote.number ?? `D-${new Date(request.createdAt).getFullYear()}-${requestId.slice(-6).toUpperCase()}`,
          status: quote.status,
          createdAt: request.createdAt,
          updatedAt: quote.updatedAt,
          sentAt: quote.status === "envoye" ? quote.updatedAt : undefined,
          acceptedAt: quote.status === "accepte" ? quote.updatedAt : undefined,
          totalHtCents: 0,
          totalVatCents: 0,
          totalTtcCents: 0,
        });
        const { versionId, totals } = await insertQuoteVersion(ctx, quoteId, quote as LocalQuoteInput, quote.version, request.createdAt);
        await ctx.db.patch(quoteId, { currentVersionId: versionId, ...totals });
        await ctx.db.patch(requestId, { quoteNumber: quote.number, quoteAmountCents: totals.totalTtcCents });
      }
    }
    const now = Date.now();
    await Promise.all(args.catalog.map(({ id, ...item }) => ctx.db.insert("catalogItems", {
      ...item,
      externalId: id,
      createdAt: now,
      updatedAt: now,
    })));
    return { requestCount: requestIds.size, catalogItemCount: args.catalog.length };
  },
});
