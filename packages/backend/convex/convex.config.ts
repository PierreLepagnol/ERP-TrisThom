import betterAuth from "@convex-dev/better-auth/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    BETTER_AUTH_SECRET: v.string(),
    DIRECTUS_WEBHOOK_SECRET: v.optional(v.string()),
    DIRECTUS_BASE_URL: v.optional(v.string()),
    DIRECTUS_STATIC_TOKEN: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    SMTP_FROM: v.string(),
    SMTP_HOST: v.string(),
    SMTP_PASSWORD: v.string(),
    SMTP_PORT: v.string(),
    SMTP_SECURE: v.string(),
    SMTP_USER: v.string(),
    IMAP_HOST: v.string(),
    IMAP_PORT: v.string(),
    IMAP_SECURE: v.string(),
    CRM_IMPORT_SECRET: v.optional(v.string()),
  },
});
app.use(betterAuth);

export default app;
