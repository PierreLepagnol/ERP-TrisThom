"use node";

import nodemailer from "nodemailer";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import { authComponent } from "./auth";
import { action, env } from "./_generated/server";

function smtpPort(value: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT est invalide.");
  }
  return port;
}

function smtpSecure(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("SMTP_SECURE doit valoir true ou false.");
}

export const send = action({
  args: {
    requestId: v.id("requests"),
    recipientEmail: v.string(),
    subject: v.string(),
    body: v.string(),
    inReplyTo: v.optional(v.string()),
    attachments: v.optional(v.array(v.object({
      filename: v.string(),
      contentBase64: v.string(),
      contentType: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    if (!await authComponent.safeGetAuthUser(ctx)) {
      throw new Error("Vous devez être connecté.");
    }
    if (!args.recipientEmail.includes("@")) {
      throw new Error("L’adresse e-mail du client est invalide.");
    }
    if (!args.subject.trim() || !args.body.trim()) {
      throw new Error("L’objet et le message sont obligatoires.");
    }
    if ((args.attachments?.length ?? 0) > 3) {
      throw new Error("Vous pouvez joindre au maximum 3 fichiers.");
    }
    for (const attachment of args.attachments ?? []) {
      if (attachment.contentType !== "application/pdf" || !attachment.filename.toLowerCase().endsWith(".pdf")) {
        throw new Error("Seuls les fichiers PDF peuvent être joints.");
      }
      if (Buffer.byteLength(attachment.contentBase64, "base64") > 5 * 1024 * 1024) {
        throw new Error("Chaque PDF doit faire moins de 5 Mo.");
      }
    }

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: smtpPort(env.SMTP_PORT),
      secure: smtpSecure(env.SMTP_SECURE),
      requireTLS: !smtpSecure(env.SMTP_SECURE),
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      tls: { minVersion: "TLSv1.2" },
    });
    const result = await transporter.sendMail({
      from: env.SMTP_FROM,
      to: args.recipientEmail,
      subject: args.subject.trim(),
      text: args.body.trim(),
      attachments: (args.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        content: Buffer.from(attachment.contentBase64, "base64"),
        contentType: attachment.contentType,
      })),
      ...(args.inReplyTo ? { inReplyTo: args.inReplyTo, references: args.inReplyTo } : {}),
    });
    if (result.rejected.length > 0) {
      throw new Error("Le serveur e-mail a refusé le destinataire.");
    }
    await ctx.runMutation(internal.customerEmailData.recordOutgoing, {
      ...args,
      subject: args.subject.trim(),
      body: args.body.trim(),
      messageId: result.messageId,
      attachmentNames: args.attachments?.map((attachment) => attachment.filename),
      sentAt: Date.now(),
    });
    return { messageId: result.messageId };
  },
});
