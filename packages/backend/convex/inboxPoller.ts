"use node";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import PDFParser from "pdf2json";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { parseEmailRequest } from "./requestParsing";

const MAX_MESSAGES_PER_RUN = 20;
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024;

function toBoolean(value: string) {
  return value.trim().toLowerCase() === "true";
}

async function extractPdfText(content: Buffer) {
  if (content.length > MAX_PDF_BYTES) return undefined;
  const parser = new PDFParser(null, true);
  return await new Promise<string | undefined>((resolve) => {
    parser.once("pdfParser_dataReady", () => {
      const text = parser.getRawTextContent().replace(/\s+/g, " ").trim().slice(0, 12_000);
      parser.destroy();
      resolve(text || undefined);
    });
    parser.once("pdfParser_dataError", () => {
      parser.destroy();
      resolve(undefined);
    });
    parser.parseBuffer(content);
  });
}

export const pollInbox = internalAction({
  args: { forceReprocess: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const client = new ImapFlow({
      host: env.IMAP_HOST,
      port: Number(env.IMAP_PORT),
      secure: toBoolean(env.IMAP_SECURE),
      // La boîte reçue est le même compte OVH que celui déjà utilisé pour les e-mails de connexion.
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      logger: false,
    });
    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX", { readOnly: true });
      try {
        const uids = await client.search({ all: true }, { uid: true });
        if (!uids) return { scanned: 0, created: 0, ignored: 0 };
        const pending: Array<{ uid: number; externalId: string }> = [];
        for (let end = uids.length; end > 0 && pending.length < MAX_MESSAGES_PER_RUN; end -= 100) {
          const start = Math.max(0, end - 100);
          const candidates = uids.slice(start, end)
            .reverse()
            .map((uid) => ({ uid, externalId: `imap:INBOX:${uid}` }));
          const knownExternalIds: string[] = await ctx.runQuery(internal.inbox.listKnownExternalIds, {
            externalIds: candidates.map((candidate) => candidate.externalId),
          });
          const known = new Set(knownExternalIds);
          pending.push(...candidates.filter((candidate) => args.forceReprocess || !known.has(candidate.externalId)));
        }
        pending.splice(MAX_MESSAGES_PER_RUN);
        let created = 0;
        let ignored = 0;
        for (const { uid, externalId } of pending) {
          const download = await client.download(uid, undefined, { uid: true, maxBytes: MAX_MESSAGE_BYTES });
          const message = await simpleParser(download.content);
          const sender = message.from?.value[0];
          const extracted = parseEmailRequest(message.text ?? "", message.date ?? new Date());
          const attachmentNames = message.attachments
            .filter((attachment) => attachment.filename)
            .map((attachment) => attachment.filename!)
            .slice(0, 20);
          const hasPdfAttachment = message.attachments.some((attachment) =>
            attachment.contentType === "application/pdf" || attachment.filename?.toLowerCase().endsWith(".pdf"),
          );
          const pdfText = (await Promise.all(message.attachments
            .filter((attachment) =>
              (attachment.contentType === "application/pdf" || attachment.filename?.toLowerCase().endsWith(".pdf")) &&
              attachment.size <= MAX_PDF_BYTES,
            )
            .slice(0, 2)
            .map((attachment) => extractPdfText(attachment.content))))
            .filter((text): text is string => Boolean(text))
            .join("\n\n")
            .slice(0, 12_000) || undefined;
          const result: { outcome: "created" | "ignored" } = await ctx.runMutation(internal.inbox.recordMessage, {
            externalId,
            messageId: message.messageId,
            senderName: extracted.contactName || sender?.name || undefined,
            senderEmail: extracted.contactEmail || sender?.address || undefined,
            subject: message.subject?.slice(0, 500),
            receivedAt: message.date?.getTime(),
            text: message.text?.slice(0, 20_000),
            pdfText,
            attachmentNames,
            hasPdfAttachment,
          });
          if (result.outcome === "created") created += 1;
          else ignored += 1;
        }
        return { scanned: pending.length, created, ignored };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  },
});
