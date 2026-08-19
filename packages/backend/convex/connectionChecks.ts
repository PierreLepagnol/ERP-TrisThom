"use node";

import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

import { authComponent } from "./auth";
import { action, env } from "./_generated/server";

function configured(...values: Array<string | undefined>) {
  return values.every((value) => Boolean(value?.trim()));
}

function port(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) throw new Error("invalid_port");
  return parsed;
}

function secure(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("invalid_secure_value");
}

async function requireUser(ctx: Parameters<typeof authComponent.safeGetAuthUser>[0]) {
  if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Vous devez être connecté.");
}

export const verifyImap = action({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    if (!configured(env.IMAP_HOST, env.IMAP_PORT, env.IMAP_SECURE, env.SMTP_USER, env.SMTP_PASSWORD)) {
      return { status: "non_configure" as const, code: "imap_not_configured" };
    }
    const client = new ImapFlow({
      host: env.IMAP_HOST,
      port: port(env.IMAP_PORT),
      secure: secure(env.IMAP_SECURE),
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      logger: false,
    });
    try {
      await client.connect();
      return { status: "ok" as const, code: "imap_connection_verified" };
    } catch {
      return { status: "erreur" as const, code: "imap_connection_failed" };
    } finally {
      await client.logout().catch(() => undefined);
    }
  },
});

export const verifySmtp = action({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    if (!configured(env.SMTP_HOST, env.SMTP_PORT, env.SMTP_SECURE, env.SMTP_USER, env.SMTP_PASSWORD, env.SMTP_FROM)) {
      return { status: "non_configure" as const, code: "smtp_not_configured" };
    }
    try {
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: port(env.SMTP_PORT),
        secure: secure(env.SMTP_SECURE),
        requireTLS: !secure(env.SMTP_SECURE),
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
        tls: { minVersion: "TLSv1.2" },
      });
      await transporter.verify();
      return { status: "ok" as const, code: "smtp_connection_verified" };
    } catch {
      return { status: "erreur" as const, code: "smtp_connection_failed" };
    }
  },
});
