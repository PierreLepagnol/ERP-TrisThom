import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { commercialChangeSuggestions } from "./inboxPolicy";
import { parseEmailRequest } from "./requestParsing";

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

export const getOrStartImport = internalMutation({
  args: { enabledAt: v.number(), lastSeenUid: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("inboxImportState")
      .withIndex("by_key", (index) => index.eq("key", "email_import"))
      .unique();
    if (existing) return existing;
    const state = { key: "email_import" as const, enabledAt: args.enabledAt, lastSeenUid: args.lastSeenUid };
    await ctx.db.insert("inboxImportState", state);
    return state;
  },
});

export const advanceImportCursor = internalMutation({
  args: { lastSeenUid: v.number() },
  handler: async (ctx, args) => {
    const state = await ctx.db.query("inboxImportState")
      .withIndex("by_key", (index) => index.eq("key", "email_import"))
      .unique();
    if (!state || args.lastSeenUid <= state.lastSeenUid) return;
    await ctx.db.patch(state._id, { lastSeenUid: args.lastSeenUid });
  },
});

export const recordMessage = internalMutation({
  args: {
    externalId: v.string(), messageId: v.optional(v.string()), inReplyTo: v.optional(v.string()),
    senderName: v.optional(v.string()), senderEmail: v.optional(v.string()), subject: v.optional(v.string()),
    receivedAt: v.optional(v.number()), text: v.optional(v.string()), pdfText: v.optional(v.string()),
    attachmentNames: v.array(v.string()), hasPdfAttachment: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("inboxMessages")
      .withIndex("by_externalId", (index) => index.eq("externalId", args.externalId)).unique();
    if (existing) return { outcome: "ignored" as const, requestId: existing.requestId, reason: "already_processed" };

    const now = Date.now();
    const parsed = parseEmailRequest([args.text, args.pdfText].filter(Boolean).join("\n"), new Date(args.receivedAt ?? now));
    const threaded = args.inReplyTo
      ? await ctx.db.query("emailMessages").withIndex("by_messageId", (index) => index.eq("messageId", args.inReplyTo!)).unique()
      : null;

    if (threaded) {
      const inboxMessageId = await ctx.db.insert("inboxMessages", {
        externalId: args.externalId, messageId: args.messageId, senderName: args.senderName, senderEmail: args.senderEmail,
        subject: args.subject, receivedAt: args.receivedAt, textPreview: args.text?.slice(0, 1_000), body: args.text?.slice(0, 20_000),
        attachmentNames: args.attachmentNames.slice(0, 20), hasPdfAttachment: args.hasPdfAttachment,
        outcome: "created", reviewStatus: "attached", requestId: threaded.requestId, createdAt: now,
      });
      const request = await ctx.db.get(threaded.requestId);
      const suggestions = request ? commercialChangeSuggestions(request, parsed) : [];
      for (const suggestion of suggestions) {
        await ctx.db.insert("requestChangeSuggestions", {
          requestId: threaded.requestId, inboxMessageId, ...suggestion, status: "pending", createdAt: now,
        });
      }
      if (request) {
        await ctx.db.insert("requestHistory", {
          requestId: request._id,
          label: suggestions.length ? "E-mail reçu : modifications à valider" : "E-mail reçu dans la conversation",
          createdAt: now,
        });
      }
      await ctx.db.insert("emailMessages", {
        requestId: threaded.requestId, direction: "inbound", messageId: args.messageId ?? args.externalId,
        inReplyTo: args.inReplyTo, subject: args.subject, body: args.text ?? "", senderEmail: args.senderEmail,
        attachmentNames: args.attachmentNames.slice(0, 20),
        sentAt: args.receivedAt ?? now,
      });
      return { outcome: "created" as const, requestId: threaded.requestId, reason: "thread_match" };
    }

    if (!args.subject?.trim() && !args.text?.trim() && !args.pdfText?.trim() && args.attachmentNames.length === 0) {
      await ctx.db.insert("inboxMessages", {
        externalId: args.externalId, messageId: args.messageId, senderName: args.senderName, senderEmail: args.senderEmail,
        subject: args.subject, receivedAt: args.receivedAt, textPreview: args.text?.slice(0, 1_000), body: args.text?.slice(0, 20_000),
        attachmentNames: args.attachmentNames.slice(0, 20), hasPdfAttachment: args.hasPdfAttachment,
        outcome: "ignored",
        createdAt: now,
      });
      return { outcome: "ignored" as const, reason: "empty_message" };
    }

    const requestId: Id<"requests"> = await ctx.db.insert("requests", {
      source: "email", externalSourceId: args.externalId, status: "nouveau",
      contactName: args.senderName?.trim() || args.senderEmail || "Contact à identifier",
      contactEmail: parsed.contactEmail || args.senderEmail, contactPhone: parsed.contactPhone,
      organizationName: parsed.organizationName, eventDate: parsed.eventDate, eventAddress: parsed.eventAddress,
      eventType: parsed.eventType, guestCount: parsed.guestCount, specialNeeds: parsed.specialNeeds,
      message: [args.subject ? `Objet : ${args.subject}` : undefined, args.text, args.pdfText ? `Informations lues dans le PDF :\n${args.pdfText}` : undefined]
        .filter(Boolean).join("\n\n").slice(0, 20_000),
      missingInformation: missingInformationForRequest({ contactEmail: parsed.contactEmail || args.senderEmail, ...parsed }),
      createdAt: now, updatedAt: now,
    });
    await ctx.db.insert("requestHistory", { requestId, label: "Demande reçue par e-mail", createdAt: now });
    await ctx.db.insert("emailMessages", {
      requestId, direction: "inbound", messageId: args.messageId ?? args.externalId, inReplyTo: args.inReplyTo,
      subject: args.subject, body: args.text ?? "", senderEmail: args.senderEmail, sentAt: args.receivedAt ?? now,
      attachmentNames: args.attachmentNames.slice(0, 20),
    });
    await ctx.db.insert("inboxMessages", {
      externalId: args.externalId, messageId: args.messageId, senderName: args.senderName, senderEmail: args.senderEmail,
      subject: args.subject, receivedAt: args.receivedAt, textPreview: args.text?.slice(0, 1_000), body: args.text?.slice(0, 20_000),
      attachmentNames: args.attachmentNames.slice(0, 20), hasPdfAttachment: args.hasPdfAttachment,
      outcome: "created", reviewStatus: "created", requestId, createdAt: now,
    });
    return { outcome: "created" as const, requestId, reason: "new_request" };
  },
});
