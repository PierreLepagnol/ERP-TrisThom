import { v } from "convex/values";
import { findMissingInformation } from "./requestQualification";
import { normalizeDossierStatus, assertDossierTransition, validateDossierFields } from "./dossierStatus";

import { authComponent } from "./auth";
import { requireDestructiveCrmResetEnabled } from "./destructiveOperations";
import { isVisibleRequest } from "./requestDeletion";
import type { Doc, Id } from "./_generated/dataModel";
import { env, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

const requestStatus = v.union(
  v.literal("nouveau"),
  v.literal("a_qualifier"),
  v.literal("qualifie"),
  v.literal("devis_a_preparer"),
  v.literal("devis_envoye"),
  v.literal("relance"),
  v.literal("accepte"),
  v.literal("termine"),
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
    kind: v.union(v.literal("relance_j3"), v.literal("relance_j7"), v.literal("manuel")),
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

const statusLabel: Record<RequestStatus, string> = {
  nouveau: "Nouveau", a_qualifier: "Nouveau", qualifie: "Devis à préparer",
  devis_a_preparer: "Devis à préparer", devis_envoye: "Devis envoyé", relance: "Devis envoyé",
  accepte: "Confirmé", termine: "Terminé", refuse: "Perdu", annule: "Annulé",
};

async function requireAuthenticatedUser(
  ctx: Parameters<typeof authComponent.safeGetAuthUser>[0],
) {
  const authUser = await authComponent.safeGetAuthUser(ctx);
  if (!authUser) throw new Error("Vous devez être connecté.");
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
  if (!request || request.deletedAt != null) throw new Error("Demande introuvable.");
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

async function changeDossierStatus(ctx: MutationCtx, request: Doc<"requests">, input: RequestStatus) {
  await assertSingleService(ctx, request);
  const status = normalizeDossierStatus(input);
  const quote = await ctx.db.query("quotes").withIndex("by_requestId", q => q.eq("requestId", request._id)).unique();
  const version = quote?.currentVersionId ? await ctx.db.get(quote.currentVersionId) : null;
  assertDossierTransition(request, status, { exists: Boolean(version), sent: Boolean(version && (version.sentAt || ["envoye", "accepte"].includes(version.status))) });
  const now = Date.now();
  if (status === "devis_envoye" && quote && version) {
    await ctx.db.patch(version._id, { status: "envoye", sentAt: version.sentAt ?? now, updatedAt: now });
    await ctx.db.patch(quote._id, { status: "envoye", sentAt: quote.sentAt ?? now, updatedAt: now });
    await createFollowUps(ctx, request, now);
  }
  if (status === "accepte" && quote && version) {
    await ctx.db.patch(version._id, { status: "accepte", updatedAt: now });
    await ctx.db.patch(quote._id, { status: "accepte", acceptedAt: quote.acceptedAt ?? now, updatedAt: now });
  }
  await ctx.db.patch(request._id, { status, acceptedAt: status === "accepte" ? request.acceptedAt ?? now : request.acceptedAt, updatedAt: now });
  if (status !== normalizeDossierStatus(request.status)) await addHistory(ctx, request._id, "Statut : " + statusLabel[request.status] + " → " + statusLabel[status], now);
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
      requests: await Promise.all(requests.filter(isVisibleRequest).map(async (request) => {
        const quote = quoteByRequest.get(request._id);
        return {
          ...request,
          status: normalizeDossierStatus(request.status),
          legacyEvents: request.singleServiceAt == null ? await ctx.db.query("requestEvents").withIndex("by_requestId_and_date", q => q.eq("requestId", request._id)).take(101) : [],
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
            kind: task.kind,
            title: task.title,
            dueAt: task.dueAt,
            completedAt: task.completedAt,
          })),
          quote: quote ? legacyQuoteFromRecord(quote) : undefined,
        };
      })),
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
    externalSourceId: v.optional(v.string()),
    historyLabel: v.optional(v.string()),
    contactId: v.optional(v.id("contacts")),
    title: v.optional(v.string()),
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
    const { historyLabel, ...requestInput } = args;
    validateDossierFields(requestInput);
    const customer = await resolveContact(ctx, requestInput);
    const contactName = customer.contactName;
    const requestId = await ctx.db.insert("requests", {
      ...requestInput,
      ...customer,
      singleServiceAt: now,
      contactName,
      status: "nouveau",
      missingInformation: findMissingInformation({ ...requestInput, ...customer }),
      createdAt: now,
      updatedAt: now,
    });
    await addHistory(ctx, requestId, historyLabel ?? "Demande reçue", now);
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
    await changeDossierStatus(ctx, request, args.status);
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
      v.literal("termine"),
      v.literal("refuse"),
    ),
  },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    if (request.status !== "annule") throw new Error("Seul un dossier annulé peut être réouvert.");
    await changeDossierStatus(ctx, request, args.status);
    await ctx.db.patch(request._id, { archivedAt: undefined });
    return null;

  },
});

export const updateRequest = mutation({
  args: {
    requestId: v.id("requests"),
    changes: v.object({
      title: v.optional(v.union(v.string(), v.null())),
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
    if ("title" in changes) changes.title = typeof changes.title === "string" ? changes.title.trim() || undefined : undefined;
    await assertSingleService(ctx, request);
    const next = { ...request, ...changes };
    validateDossierFields(next);
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
    if (missing.length) throw new Error("À compléter : " + missing.join(", "));
    await ctx.db.patch(request._id, { missingInformation: [], updatedAt: Date.now() });
    await addHistory(ctx, request._id, "Informations vérifiées");
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
    if (!["accepte", "termine"].includes(request.status)) await changeDossierStatus(ctx, request, "devis_a_preparer");
    return null;

  },
});

export const scheduleFollowUp = mutation({
  args: { requestId: v.id("requests"), title: v.string(), dueAt: v.number() },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    const title = args.title.trim();
    if (!title) throw new Error("Le libellé du rappel est obligatoire.");
    if (title.length > 200) throw new Error("Le libellé du rappel ne peut pas dépasser 200 caractères.");
    if (!Number.isFinite(args.dueAt)) throw new Error("La date du rappel est invalide.");
    const now = Date.now();
    await ctx.db.insert("followUpTasks", {
      requestId: request._id,
      kind: "manuel",
      title,
      dueAt: args.dueAt,
      createdAt: now,
    });
    await ctx.db.patch(request._id, { updatedAt: now });
    await addHistory(ctx, request._id, "Relance programmée", now);
    return null;
  },
});

export const closeRequest = mutation({
  args: { requestId: v.id("requests"), status: v.union(v.literal("refuse"), v.literal("annule")), reason: v.string() },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);

    const reason = args.reason.trim();
    if (!reason) throw new Error("Un motif est obligatoire.");
    const now = Date.now();
    await changeDossierStatus(ctx, request, args.status);
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
    if (!task || task.requestId !== args.requestId) throw new Error("Rappel introuvable.");
    const now = Date.now();
    await ctx.db.patch(task._id, { completedAt: now });
    await ctx.db.patch(args.requestId, { updatedAt: now });
    await addHistory(ctx, args.requestId, "Relance marquée comme effectuée", now);
    return null;
  },
});

export const deleteFollowUp = mutation({
  args: { requestId: v.id("requests"), followUpId: v.id("followUpTasks") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    await getRequestOrThrow(ctx, args.requestId);
    const task = await ctx.db.get(args.followUpId);
    if (!task || task.requestId !== args.requestId) throw new Error("Rappel introuvable.");
    const now = Date.now();
    await ctx.db.delete(task._id);
    await ctx.db.patch(args.requestId, { updatedAt: now });
    await addHistory(ctx, args.requestId, "Rappel supprimé", now);
    return null;
  },
});

async function saveQuoteRecord(ctx: MutationCtx, request: Doc<"requests">, input: LocalQuoteInput) {
  await assertSingleService(ctx, request);
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
      status: normalizeDossierStatus(request.status),
      quoteNumber: stored.number,
      quoteAmountCents: stored.totals.totalTtcCents,
      nextActionAt: sent ? now + 3 * 86_400_000 : request.nextActionAt,
      updatedAt: now,
    });
    if (sent && ["nouveau", "devis_a_preparer", "devis_envoye"].includes(normalizeDossierStatus(request.status))) await changeDossierStatus(ctx, request, "devis_envoye");
    await addHistory(ctx, request._id, sent ? "Devis marqué comme envoyé" : "Brouillon de devis enregistré", now);
    return null;
  },
});

export const createQuoteVersion = mutation({
  args: { requestId: v.id("requests"), quote: localQuote },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    await assertSingleService(ctx, request);
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
    await assertSingleService(ctx, request);
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
    await assertSingleService(ctx, request);
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
        status: "devis_a_preparer",
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
      status: normalizeDossierStatus(request.status),
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
    await changeDossierStatus(ctx, request, "devis_envoye");
    return null;

  },
});

export const confirmService = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    await changeDossierStatus(ctx, request, "accepte");
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

export const deleteRequest = mutation({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    if (request.deletedAt) return null;
    const now = Date.now();
    await ctx.db.patch(request._id, { deletedAt: now, updatedAt: now });
    await addHistory(ctx, request._id, "Demande supprimée", now);
    return null;
  },
});

export const listServicePurchases = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    await getRequestOrThrow(ctx, args.requestId);
    return await ctx.db.query("servicePurchases")
      .withIndex("by_requestId", (index) => index.eq("requestId", args.requestId))
      .order("asc")
      .collect();
  },
});

export const createServicePurchase = mutation({
  args: { requestId: v.id("requests"), product: v.string(), quantity: v.number(), unit: v.string(), supplier: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    const request = await getRequestOrThrow(ctx, args.requestId);
    await assertSingleService(ctx, request);
    if (request.status !== "accepte") throw new Error("Les achats sont réservés aux prestations confirmées.");
    if (!args.product.trim() || !args.unit.trim() || args.quantity <= 0) throw new Error("Produit, quantité et unité sont obligatoires.");
    const now = Date.now();
    return await ctx.db.insert("servicePurchases", { ...args, product: args.product.trim(), unit: args.unit.trim(), supplier: args.supplier?.trim() || undefined, purchased: false, createdAt: now, updatedAt: now });
  },
});

export const updateServicePurchase = mutation({
  args: { requestId: v.id("requests"), purchaseId: v.id("servicePurchases"), product: v.string(), quantity: v.number(), unit: v.string(), supplier: v.optional(v.string()), purchased: v.boolean() },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    await getRequestOrThrow(ctx, args.requestId);
    const purchase = await ctx.db.get(args.purchaseId);
    if (!purchase || purchase.requestId !== args.requestId) throw new Error("Achat introuvable.");
    if (!args.product.trim() || !args.unit.trim() || args.quantity <= 0) throw new Error("Produit, quantité et unité sont obligatoires.");
    await ctx.db.patch(args.purchaseId, { product: args.product.trim(), quantity: args.quantity, unit: args.unit.trim(), supplier: args.supplier?.trim() || undefined, purchased: args.purchased, updatedAt: Date.now() });
  },
});

export const deleteServicePurchase = mutation({
  args: { requestId: v.id("requests"), purchaseId: v.id("servicePurchases") },
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx);
    await getRequestOrThrow(ctx, args.requestId);
    const purchase = await ctx.db.get(args.purchaseId);
    if (!purchase || purchase.requestId !== args.requestId) throw new Error("Achat introuvable.");
    await ctx.db.delete(args.purchaseId);
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
    requireDestructiveCrmResetEnabled(env.ALLOW_DESTRUCTIVE_CRM_RESET);
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
    requireDestructiveCrmResetEnabled(env.ALLOW_DESTRUCTIVE_CRM_RESET);
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
    requireDestructiveCrmResetEnabled(env.ALLOW_DESTRUCTIVE_CRM_RESET);
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

export async function assertSingleService(ctx: QueryCtx | MutationCtx, request: Doc<"requests">) {
  if (request.singleServiceAt != null) return;
  const rows = await ctx.db.query("requestEvents").withIndex("by_requestId_and_date", q => q.eq("requestId", request._id)).take(1);
  if (rows.length) throw new Error("Reprenez les anciennes prestations de ce dossier avant de modifier ses données ou son statut.");
}

async function resolveContact(ctx: MutationCtx, input: { contactId?: Id<"contacts">; contactName: string; contactEmail?: string; contactPhone?: string; organizationName?: string }) {
  let contact = input.contactId ? await ctx.db.get(input.contactId) : null;
  if (input.contactId && !contact) throw new Error("Client introuvable.");
  if (!contact) {
    const now = Date.now();
    const organizationId = input.organizationName?.trim() ? await ctx.db.insert("organizations", { name: input.organizationName.trim(), createdAt: now, updatedAt: now }) : undefined;
    const contactId = await ctx.db.insert("contacts", { displayName: input.contactName.trim() || "Contact à identifier", email: input.contactEmail?.trim() || undefined, phone: input.contactPhone?.trim() || undefined, organizationId, createdAt: now, updatedAt: now });
    contact = await ctx.db.get(contactId);
  }
  if (!contact) throw new Error("Client introuvable.");
  const organization = contact.organizationId ? await ctx.db.get(contact.organizationId) : null;
  return { contactId: contact._id, contactName: contact.displayName, contactEmail: contact.email, contactPhone: contact.phone, organizationName: organization?.name };
}

export const listClients = query({ args: {}, handler: async ctx => {
  await requireAuthenticatedUser(ctx);
  const contacts = await ctx.db.query("contacts").take(500);
  return await Promise.all(contacts.map(async contact => ({ ...contact, organization: contact.organizationId ? await ctx.db.get(contact.organizationId) : null })));
} });

export const saveClient = mutation({ args: { contactId: v.optional(v.id("contacts")), name: v.string(), email: v.optional(v.string()), phone: v.optional(v.string()), organization: v.optional(v.string()), billingAddress: v.optional(v.string()) }, handler: async (ctx, args) => {
  await requireAuthenticatedUser(ctx);
  if (!args.name.trim()) throw new Error("Le nom du client est obligatoire.");
  const now = Date.now();
  const previous = args.contactId ? await ctx.db.get(args.contactId) : null;
  if (args.contactId && !previous) throw new Error("Client introuvable.");
  let organizationId = previous?.organizationId;
  if (args.organization?.trim() || args.billingAddress?.trim()) {
    const values = { name: args.organization?.trim() || args.name.trim(), billingAddress: args.billingAddress?.trim() || undefined, updatedAt: now };
    if (organizationId) await ctx.db.patch(organizationId, values);
    else organizationId = await ctx.db.insert("organizations", { ...values, createdAt: now });
  }
  const values = { displayName: args.name.trim(), email: args.email?.trim() || undefined, phone: args.phone?.trim() || undefined, organizationId, updatedAt: now };
  if (previous) { await ctx.db.patch(previous._id, values); return previous._id; }
  return await ctx.db.insert("contacts", { ...values, createdAt: now });
} });

export const assignClient = mutation({ args: { requestId: v.id("requests"), contactId: v.optional(v.id("contacts")) }, handler: async (ctx, args) => {
  await requireAuthenticatedUser(ctx);
  const request = await getRequestOrThrow(ctx, args.requestId);
  const customer = await resolveContact(ctx, { ...request, contactId: args.contactId });
  await ctx.db.patch(request._id, { ...customer, updatedAt: Date.now() });
  await addHistory(ctx, request._id, "Client du dossier choisi : " + customer.contactName);
  return customer.contactId;
} });

export const duplicateRequest = mutation({ args: { requestId: v.id("requests"), eventDate: v.number() }, handler: async (ctx, args) => {
  await requireAuthenticatedUser(ctx);
  const request = await getRequestOrThrow(ctx, args.requestId);
  await assertSingleService(ctx, request);
  validateDossierFields({ eventDate: args.eventDate });
  const customer = await resolveContact(ctx, request);
  if (!request.contactId) await ctx.db.patch(request._id, { contactId: customer.contactId });
  const now = Date.now();
  const fields = { ...customer, eventDate: args.eventDate, eventType: request.eventType, eventStartTime: request.eventStartTime, eventEndTime: request.eventEndTime, eventAddress: request.eventAddress || request.venue, guestCount: request.guestCount, specialNeeds: request.specialNeeds, dietaryRequirements: request.dietaryRequirements, staffingNeeds: request.staffingNeeds };
  const requestId = await ctx.db.insert("requests", { ...fields, source: "manuel", status: "nouveau", singleServiceAt: now, createdAt: now, updatedAt: now, missingInformation: findMissingInformation(fields) });
  await addHistory(ctx, requestId, "Créé pour une autre date depuis le dossier " + request._id + ". Devis et achats à préparer séparément.");
  return requestId;
} });

export const reviewLegacyServices = mutation({ args: { requestId: v.id("requests"), retainedEventId: v.id("requestEvents"), expectedUpdatedAt: v.number(), financialDecision: v.string() }, handler: async (ctx, args) => {
  await requireAuthenticatedUser(ctx);
  const request = await getRequestOrThrow(ctx, args.requestId);
  if (request.singleServiceAt != null || request.updatedAt !== args.expectedUpdatedAt) throw new Error("Le dossier a changé. Rechargez la reprise.");
  if (args.financialDecision.trim().length < 10) throw new Error("Précisez la décision concernant le devis et les achats existants.");
  const events = await ctx.db.query("requestEvents").withIndex("by_requestId_and_date", q => q.eq("requestId", request._id)).take(101);
  if (events.length > 100) throw new Error("Ce dossier nécessite une reprise accompagnée : plus de 100 prestations.");
  const retained = events.find(event => event._id === args.retainedEventId);
  if (!retained) throw new Error("Choisissez la prestation qui conserve les documents et achats existants.");
  const customer = await resolveContact(ctx, request);
  const now = Date.now();
  const fields = (event: Doc<"requestEvents">) => ({ eventDate: event.date, eventStartTime: event.startTime, eventEndTime: event.endTime, eventAddress: event.address, venue: undefined, guestCount: event.guestCount, eventType: event.serviceType || event.label });
  const created: Id<"requests">[] = [];
  for (const event of events) {
    const values = fields(event);
    if (event._id === retained._id) continue;
    const requestId = await ctx.db.insert("requests", { ...customer, ...values, source: "manuel", status: event.status === "annulee" ? "annule" : "nouveau", singleServiceAt: now, splitFromRequestId: request._id, specialNeeds: [request.specialNeeds, event.format, event.notes].filter(Boolean).join("\n"), dietaryRequirements: request.dietaryRequirements, staffingNeeds: request.staffingNeeds, missingInformation: findMissingInformation({ ...customer, ...values }), createdAt: now, updatedAt: now });
    await addHistory(ctx, requestId, "Reprise du dossier " + request._id + ". Conversation et documents originaux conservés dans ce dossier source. Aucun montant commercial dupliqué. Ancien état : " + event.status);
    created.push(requestId);
  }
  const values = fields(retained);
  await ctx.db.patch(request._id, { ...customer, ...values, specialNeeds: [request.specialNeeds, retained.format, retained.notes].filter(Boolean).join("\n"), singleServiceAt: now, status: retained.status === "annulee" ? "annule" : normalizeDossierStatus(request.status), missingInformation: findMissingInformation({ ...request, ...values }), updatedAt: now });
  await addHistory(ctx, request._id, "Reprise validée : devis, achats et conversation conservés pour " + retained.label + ". Décision : " + args.financialDecision.trim() + ". Nouveaux dossiers : " + created.join(", "));
  return created;
} });
