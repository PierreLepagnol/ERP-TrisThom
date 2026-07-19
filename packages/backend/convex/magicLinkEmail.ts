"use node";

import nodemailer from "nodemailer";
import { v } from "convex/values";

import { env, internalAction } from "./_generated/server";

function parseSmtpPort(value: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parseSmtpSecure(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error('SMTP_SECURE must be either "true" or "false"');
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

export const sendMagicLinkEmail = internalAction({
  args: {
    email: v.string(),
    url: v.string(),
  },
  handler: async (_ctx, { email, url }) => {
    const magicLinkUrl = new URL(url);
    const expectedOrigin = new URL(env.SITE_URL ?? "http://localhost:3001").origin;
    if (magicLinkUrl.origin !== expectedOrigin) {
      throw new Error("Refusing to send a magic link for an unexpected origin");
    }

    const secure = parseSmtpSecure(env.SMTP_SECURE);
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: parseSmtpPort(env.SMTP_PORT),
      secure,
      requireTLS: !secure,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
      tls: {
        minVersion: "TLSv1.2",
      },
    });

    const result = await transporter.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: "Votre lien de connexion — Bouillon Comptoir",
      text: [
        "Bonjour,",
        "",
        "Utilisez ce lien pour vous connecter à Bouillon Comptoir :",
        url,
        "",
        "Ce lien expire dans 10 minutes et ne peut être utilisé qu’une seule fois.",
        "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.",
      ].join("\n"),
      html: `
        <p>Bonjour,</p>
        <p>Utilisez le bouton ci-dessous pour vous connecter à Bouillon Comptoir.</p>
        <p>
          <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#8b1629;color:#fff;text-decoration:none;font-weight:700">
            Se connecter
          </a>
        </p>
        <p>Ce lien expire dans 10 minutes et ne peut être utilisé qu’une seule fois.</p>
        <p>Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>
      `,
    });

    if (result.rejected.length > 0) {
      throw new Error("The SMTP server rejected the magic-link recipient");
    }

    return null;
  },
});
