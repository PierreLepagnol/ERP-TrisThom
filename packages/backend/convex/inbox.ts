import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { parseEmailRequest, triageInboxMessage } from "./requestParsing";

function normalise(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function looksLikeCateringRequest(text: string) {
  const normalized = normalise(text);
  const keywords = [
    "demande de devis",
    "demande de prix",
    "devis traiteur",
    "prestation traiteur",
    "cocktail",
    "buffet",
    "repas d'entreprise",
    "repas d entreprise",
    "mariage",
    "brunch",
    "plateau repas",
    "nombre de convives",
  ];
  return keywords.some((keyword) => normalized.includes(keyword));
}

function looksLike1001Traiteur(text: string) {
  return normalise(text).includes("1001traiteur");
}

function missingInformation(args: {
  contactEmail?: string;
}) {
  const missing = [
    "Date de l'événement",
    "Lieu ou adresse",
    "Nombre de personnes",
    "Type de prestation",
    "Budget",
    "Horaires",
    "Besoins particuliers",
  ];
  if (!args.contactEmail) missing.push("Coordonnées du client");
  return missing;
}

function missingInformationForRequest(args: {
  contactEmail?: string;
  eventAddress?: string;
  eventDate?: number;
  eventType?: string;
  guestCount?: number;
  specialNeeds?: string;
}) {
  const missing: string[] = [];
  if (!args.eventDate) missing.push("Date de l'événement");
  if (!args.eventAddress) missing.push("Lieu ou adresse");
  if (!args.guestCount) missing.push("Nombre de personnes");
  if (!args.eventType) missing.push("Type de prestation");
  missing.push("Budget", "Horaires");
  if (!args.specialNeeds) missing.push("Besoins particuliers");
  if (!args.contactEmail) missing.push("Coordonnées du client");
  return missing;
}

export const listKnownExternalIds = internalQuery({
  args: { externalIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (args.externalIds.length > 100) throw new Error("Trop d'e-mails à vérifier.");
    const known = await Promise.all(args.externalIds.map(async (externalId) => {
      const message = await ctx.db
        .query("inboxMessages")
        .withIndex("by_externalId", (index) => index.eq("externalId", externalId))
        .unique();
      return message ? externalId : null;
    }));
    return known.filter((externalId): externalId is string => externalId !== null);
  },
});

export const recordMessage = internalMutation({
  args: {
    externalId: v.string(),
    messageId: v.optional(v.string()),
    senderName: v.optional(v.string()),
    senderEmail: v.optional(v.string()),
    subject: v.optional(v.string()),
    receivedAt: v.optional(v.number()),
    text: v.optional(v.string()),
    pdfText: v.optional(v.string()),
    attachmentNames: v.array(v.string()),
    hasPdfAttachment: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("inboxMessages")
      .withIndex("by_externalId", (index) => index.eq("externalId", args.externalId))
      .unique();
    const text = [args.senderName, args.senderEmail, args.subject, args.text, args.pdfText].filter(Boolean).join("\n");
    const parsed = parseEmailRequest(
      [args.text, args.pdfText].filter(Boolean).join("\n"),
      new Date(args.receivedAt ?? Date.now()),
    );
    const is1001 = looksLike1001Traiteur(text);
    const triage = is1001 ? "request" as const : triageInboxMessage(text);
    const shouldCreateRequest = triage !== "ignore";
    const needsManualReview = triage === "review";
    if (existing) {
      if (!existing.requestId && shouldCreateRequest) {
        await ctx.db.delete(existing._id);
      } else if (existing.requestId) {
        const request = await ctx.db.get(existing.requestId);
        if (request) {
          const contactName = parsed.contactName && request.contactName === (args.senderName?.trim() || args.senderEmail)
            ? parsed.contactName
            : request.contactName;
          const merged = {
            contactEmail: request.contactEmail ?? parsed.contactEmail ?? args.senderEmail,
            contactPhone: request.contactPhone ?? parsed.contactPhone,
            organizationName: request.organizationName ?? parsed.organizationName,
            eventDate: request.eventDate ?? parsed.eventDate,
            eventAddress: request.eventAddress ?? parsed.eventAddress,
            eventType: request.eventType ?? parsed.eventType,
            guestCount: request.guestCount ?? parsed.guestCount,
            specialNeeds: request.specialNeeds ?? parsed.specialNeeds,
          };
          await ctx.db.patch(request._id, {
            contactName,
            ...merged,
            missingInformation: missingInformationForRequest(merged),
            updatedAt: Date.now(),
          });
        }
        return { outcome: "ignored" as const, requestId: existing.requestId };
      } else {
        return { outcome: "ignored" as const, requestId: existing.requestId };
      }
    }

    const now = Date.now();
    let requestId: Id<"requests"> | undefined;

    if (shouldCreateRequest) {
      requestId = await ctx.db.insert("requests", {
        source: is1001 ? "1001traiteur" : "email",
        externalSourceId: args.externalId,
        status: "a_qualifier",
        contactName: args.senderName?.trim() || args.senderEmail || "Contact à identifier",
        contactEmail: parsed.contactEmail || args.senderEmail,
        contactPhone: parsed.contactPhone,
        organizationName: parsed.organizationName,
        eventDate: parsed.eventDate,
        eventAddress: parsed.eventAddress,
        eventType: parsed.eventType,
        guestCount: parsed.guestCount,
        specialNeeds: parsed.specialNeeds,
        message: [
          needsManualReview ? "⚠️ À vérifier : cet e-mail a été importé car il pourrait contenir une demande client." : undefined,
          args.subject ? `Objet : ${args.subject}` : undefined,
          args.text,
          args.pdfText ? `Informations lues dans le PDF :\n${args.pdfText}` : undefined,
          args.hasPdfAttachment ? `Pièce(s) jointe(s) PDF : ${args.attachmentNames.join(", ")}` : undefined,
        ].filter(Boolean).join("\n\n").slice(0, 20_000),
        missingInformation: missingInformationForRequest({ contactEmail: parsed.contactEmail || args.senderEmail, ...parsed }),
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("requestHistory", {
        requestId,
        label: is1001
          ? "Demande reçue depuis 1001traiteur"
          : needsManualReview
            ? "E-mail importé à vérifier : demande possible"
            : "Demande reçue par e-mail",
        createdAt: now,
      });
    }

    const outcome = shouldCreateRequest ? "created" as const : "ignored" as const;
    await ctx.db.insert("inboxMessages", {
      externalId: args.externalId,
      messageId: args.messageId,
      senderName: args.senderName,
      senderEmail: args.senderEmail,
      subject: args.subject,
      receivedAt: args.receivedAt,
      textPreview: args.text?.slice(0, 1_000),
      attachmentNames: args.attachmentNames.slice(0, 20),
      hasPdfAttachment: args.hasPdfAttachment,
      outcome,
      requestId,
      createdAt: now,
    });
    return { outcome, requestId };
  },
});
