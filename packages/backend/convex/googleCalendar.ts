"use node";

import { createPrivateKey, sign } from "node:crypto";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { automaticDecision, octoberStart, octoberEnd, type SyncCandidate } from "./googleCalendarPlanning";
import { buildOctoberPreview, matchesOctoberApproval, synchronizeCandidate, type SyncResult } from "./googleCalendarSync";

import { env, internalAction, type ActionCtx } from "./_generated/server";

const tokenUrl = "https://oauth2.googleapis.com/token";

async function authenticate(scope: string) {
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim();
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();

  if (!calendarId || !email || !privateKey) {
    throw new Error("Configuration incomplète : vérifier GOOGLE_CALENDAR_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL et GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY dans Convex.");
  }

  let assertion: string;
  try {
    const key = createPrivateKey(privateKey.replace(/\\n/g, "\n"));
    if (key.asymmetricKeyType !== "rsa") {
      throw new Error("La clé privée doit être une clé RSA au format PEM.");
    }
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const claims = Buffer.from(JSON.stringify({
      iss: email,
      scope,
      aud: tokenUrl,
      iat: now,
      exp: now + 3600,
    })).toString("base64url");
    const unsigned = `${header}.${claims}`;
    assertion = `${unsigned}.${sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url")}`;
  } catch {
    throw new Error("Clé privée invalide : vérifier le format PEM et les retours à la ligne dans GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.");
  }

  let accessToken: string;
  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!response.ok) {
      throw new Error(`Authentification Google refusée (HTTP ${response.status}) : vérifier que l'adresse et la clé correspondent à un compte de service actif.`);
    }
    const token: unknown = await response.json();
    if (typeof token !== "object" || token === null || !("access_token" in token)
      || typeof token.access_token !== "string" || !token.access_token) {
      throw new Error("Réponse d'authentification Google invalide : aucun jeton d'accès reçu.");
    }
    accessToken = token.access_token;
  } catch {
    throw new Error("Impossible de joindre le service d'authentification Google ou de lire sa réponse (réseau ou délai dépassé).");
  }

  return { calendarId, accessToken };
}

// Never log or return raw exceptions, response bodies, credentials or tokens.
export const testConnection = internalAction({
  args: {},
  returns: v.object({
    status: v.union(v.literal("ok"), v.literal("erreur")),
    message: v.string(),
  }),
  handler: async () => {
    const failure = (message: string) => ({ status: "erreur" as const, message });
    let credentials: Awaited<ReturnType<typeof authenticate>>;
    try {
      credentials = await authenticate("https://www.googleapis.com/auth/calendar.events.readonly");
    } catch (error) {
      return failure(error instanceof Error ? error.message : "Authentification Google impossible.");
    }
    const { calendarId, accessToken } = credentials;
    try {
      // Read at most one event ID. An empty calendar also confirms access.
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set("maxResults", "1");
      url.searchParams.set("fields", "kind,items(id)");
      const response = await fetch(url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const explanations: Record<number, string> = {
          400: "Vérifier GOOGLE_CALENDAR_ID : utiliser l'identifiant de l'agenda, pas son nom d'affichage.",
          401: "Le jeton Google a été refusé : vérifier le compte de service et sa clé.",
          403: "Vérifier que l'API Google Calendar est activée dans le projet Google et que l'agenda est partagé avec le compte de service avec le droit de lire les événements.",
          404: "Agenda introuvable ou inaccessible : vérifier GOOGLE_CALENDAR_ID et le partage avec le compte de service.",
          429: "Quota Google atteint : réessayer plus tard.",
        };
        return failure(`Lecture Google Agenda refusée (HTTP ${response.status}). ${explanations[response.status] ?? "Erreur du service Google : réessayer plus tard."}`);
      }
      const events: unknown = await response.json();
      if (typeof events !== "object" || events === null || !("kind" in events)
        || events.kind !== "calendar#events") {
        return failure("Réponse Google Agenda inattendue : la lecture des événements n'a pas pu être confirmée.");
      }
      return { status: "ok" as const, message: "Connexion Google Agenda réussie : accès aux événements confirmé, même si l'agenda est vide. Aucun événement modifié." };
    } catch {
      return failure("Impossible de joindre Google Agenda ou de lire sa réponse (réseau ou délai dépassé).");
    }
  },
});

const syncResultValidator = v.object({
  status: v.union(v.literal("ok"), v.literal("erreur"), v.literal("ignore")),
  message: v.string(), operation: v.optional(v.union(v.literal("cree"), v.literal("mis_a_jour"), v.literal("retire"))), eventUrl: v.optional(v.string()),
});

async function syncRequest(ctx: ActionCtx, candidate: SyncCandidate, credentials: Awaited<ReturnType<typeof authenticate>>): Promise<SyncResult> {
  return synchronizeCandidate(candidate, credentials, {
    fetch,
    prepare: args => ctx.runMutation(internal.googleCalendarData.prepareSync, args),
    record: args => ctx.runMutation(internal.googleCalendarData.recordSyncSuccess, args),
  });
}

export const syncDossier = internalAction({
  args: { requestId: v.id("requests") },
  returns: syncResultValidator,
  handler: async (ctx, args): Promise<SyncResult> => {
    try {
      const candidate: SyncCandidate = await ctx.runQuery(internal.googleCalendarData.getSyncCandidate, args);
      if (!candidate.projection.body) return { status: "ignore", message: candidate.projection.reason };
      const credentials = await authenticate("https://www.googleapis.com/auth/calendar.events");
      return await syncRequest(ctx, candidate, credentials);
    } catch {
      return { status: "erreur", message: "Impossible de préparer la synchronisation : vérifier le dossier, le devis courant et la configuration Google." };
    }
  },
});

// Compatibility with the already-created test event: reuse the saved/legacy ID.
export const syncPointsCommunsTest = internalAction({
  args: {},
  returns: syncResultValidator,
  handler: async (ctx): Promise<SyncResult> => {
    try {
      const target: { requestId: Id<"requests"> } = await ctx.runQuery(internal.googleCalendarData.getTestDossier, {});
      const candidate: SyncCandidate = await ctx.runQuery(internal.googleCalendarData.getSyncCandidate, { requestId: target.requestId });
      const credentials = await authenticate("https://www.googleapis.com/auth/calendar.events");
      return await syncRequest(ctx, candidate, credentials);
    } catch {
      return { status: "erreur", message: "Le dossier Points communs de test ou la configuration Google ne correspondent plus au test autorisé." };
    }
  },
});

export const preview = internalAction({
  args: {},
  handler: async ctx => {
    const candidates: SyncCandidate[] = await ctx.runQuery(internal.googleCalendarData.octoberCandidates, {});
    return buildOctoberPreview(candidates, env.GOOGLE_CALENDAR_ID);
  },
});

export const apply = internalAction({
  args: { confirmation: v.literal("SYNC_OCTOBER_2026"), expectedCount: v.number(), previewToken: v.string() },
  handler: async (ctx, args): Promise<{ status: "ok" | "erreur"; message: string; processed: number; results: Array<{ requestId: Id<"requests"> } & SyncResult> }> => {
    const results: Array<{ requestId: Id<"requests"> } & SyncResult> = [];
    const failure = (message: string) => ({ status: "erreur" as const, message, processed: results.filter(r => r.status === "ok").length, results });
    const candidates: SyncCandidate[] = await ctx.runQuery(internal.googleCalendarData.octoberCandidates, {});
    const plan = buildOctoberPreview(candidates, env.GOOGLE_CALENDAR_ID);
    if (plan.applyBlocked) return failure("Des doublons possibles nécessitent une décision dossier par dossier. Aucun événement écrit : examiner doublonsPossibles dans preview avant de préparer une sélection validée.");
    if (!matchesOctoberApproval(plan, args)) {
      return failure("Le nombre attendu ou l'empreinte du Planning a changé. Refaire preview et valider explicitement son résultat avant apply.");
    }
    let credentials: Awaited<ReturnType<typeof authenticate>>;
    try { credentials = await authenticate("https://www.googleapis.com/auth/calendar.events"); }
    catch { return failure("Authentification Google impossible. Aucun dossier synchronisé."); }
    const startedAt = Date.now();
    for (const [index, candidate] of candidates.entries()) {
      if (plan.dossiers[index]!.action === "ignorer") continue;
      // Fixed first-operation boundary; no scheduling or continuation is automatic.
      const date = JSON.parse(candidate.snapshot).eventDate as number | undefined;
      if (date === undefined || date < octoberStart || date >= octoberEnd) return failure("Dossier hors octobre 2026 : opération arrêtée.");
      if (Date.now() - startedAt > 7 * 60_000) return failure("Durée maximale atteinte. Refaire preview pour reprendre manuellement ; aucune suite automatique.");
      const result = await syncRequest(ctx, candidate, credentials);
      results.push({ requestId: candidate.requestId, ...result });
      if (result.status !== "ok") return failure("Synchronisation arrêtée sur une erreur. Les réussites précédentes sont conservées. Refaire preview pour reprendre sur les mêmes événements.");
    }
    return { status: "ok", message: "Planning d'octobre 2026 synchronisé, sans suppression Google ni changement des dates/statuts ERP.", processed: results.length, results };
  },
});


// All automatic work reuses synchronizeCandidate and the existing reservations.
export const automatic = internalAction({
  args: { requestId: v.id("requests") }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const claim: { revision: number; leaseUntil: number; lastSnapshot: string | null } | null = await ctx.runMutation(internal.googleCalendarAutomation.claim, args);
    if (!claim) return null;
    let snapshot: string | undefined;
    let result: SyncResult;
    try {
      const candidate: SyncCandidate = await ctx.runQuery(internal.googleCalendarData.getSyncCandidate, args);
      snapshot = candidate.snapshot;
      const ignored = automaticDecision(candidate, Date.now());
      if (ignored) result = { status: "ignore", message: ignored };
      else if (snapshot === claim.lastSnapshot) result = { status: "ok", message: "Projection inchangée : aucun appel Google nécessaire." };
      else {
        const credentials = await authenticate("https://www.googleapis.com/auth/calendar.events");
        result = await synchronizeCandidate(candidate, credentials, {
          fetch, automatic: true,
          prepare: values => ctx.runMutation(internal.googleCalendarData.prepareSync, { ...values, leaseUntil: claim.leaseUntil }),
          record: values => ctx.runMutation(internal.googleCalendarData.recordSyncSuccess, { ...values, leaseUntil: claim.leaseUntil }),
          remove: values => ctx.runMutation(internal.googleCalendarData.recordRemoval, { ...values, leaseUntil: claim.leaseUntil }),
        });
        // Linking the Google ID changes the snapshot; capture it only after a
        // confirmed write. A newer ERP mutation is still detected by revision.
        if (result.status === "ok") snapshot = (await ctx.runQuery(internal.googleCalendarData.getSyncCandidate, args)).snapshot;
      }
    } catch { result = { status: "erreur", message: "Synchronisation indisponible : nouvelle tentative automatique prévue. Vérifier la configuration ou le dossier si l'erreur persiste." }; }
    await ctx.runMutation(internal.googleCalendarAutomation.finish, { ...args, revision: claim.revision,
      leaseUntil: claim.leaseUntil, status: result.status, message: result.message, ...(snapshot ? { snapshot } : {}) });
    return null;
  },
});
