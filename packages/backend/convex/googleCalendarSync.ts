"use node";

import { createHash } from "node:crypto";
import { z } from "zod";
import { legacyEventId, legacySourceId, possibleDuplicates, octoberSelection, resolvedOctoberPair, type PlanningEvent, type SyncCandidate } from "./googleCalendarPlanning";

export type SyncResult = { status: "ok" | "erreur" | "ignore"; message: string; operation?: "cree" | "mis_a_jour" | "retire"; eventUrl?: string };
type Credentials = { calendarId: string; accessToken: string };
type SyncArgs = { requestId: SyncCandidate["requestId"]; snapshot: string; eventId: string; calendarFingerprint: string };
export type SyncDependencies = {
  fetch: typeof fetch;
  automatic?: boolean;
  remove?: (args: SyncArgs) => Promise<unknown>;
  prepare: (args: SyncArgs & { reserveCreation: boolean }) => Promise<boolean>;
  record: (args: SyncArgs) => Promise<unknown>;
};
const responseEvent = z.object({
  id: z.string(), status: z.string(), etag: z.string(), htmlLink: z.string().optional(),
  recurrence: z.array(z.string()).optional(), recurringEventId: z.string().optional(),
  extendedProperties: z.object({ private: z.record(z.string(), z.string()).optional(), shared: z.record(z.string(), z.string()).optional() }).optional(),
});

export function calendarFingerprint(calendarId: string): string {
  return createHash("sha256").update(calendarId).digest("hex");
}

export function eventIdFor(candidate: SyncCandidate): string {
  return candidate.savedEventId ?? candidate.reservedEventId
    ?? (candidate.projection.body?.extendedProperties.private.externalSourceId === legacySourceId
      ? legacyEventId : `bc${createHash("sha256").update(`bouillon-comptoir:request:${candidate.requestId}`).digest("hex")}`);
}

const googleError = z.object({ error: z.object({ errors: z.array(z.object({ reason: z.string().max(80) })).max(20).optional() }) });
const safeGoogleReasons = new Map<string, string>([
  ["rateLimitExceeded", "Google applique une limite de requêtes : nouvelle tentative automatique après temporisation."],
  ["userRateLimitExceeded", "Google applique une limite de requêtes au compte de service : nouvelle tentative automatique après temporisation."],
  ["quotaExceeded", "Le quota Google Agenda est atteint : attendre la prochaine tentative et vérifier les quotas si cela persiste."],
  ["forbiddenForNonOrganizer", "Google réserve cette modification à l’organisateur de l’événement : vérifier ses droits, sans le recréer."],
  ["insufficientPermissions", "Droits Google insuffisants : vérifier le partage de cet agenda avec le compte de service."],
  ["forbidden", "Accès Google refusé : vérifier les droits sur cet agenda et cet événement."],
  ["authError", "Authentification Google refusée : vérifier le compte de service et sa configuration."],
  ["conditionNotMet", "L’événement a changé depuis sa lecture : la prochaine tentative relira le même événement."],
  ["backendError", "Service Google temporairement indisponible : nouvelle tentative automatique prévue."],
]);

// Translate only known reason codes. Never copy provider messages, bodies,
// identifiers or unknown reason strings into ERP results or logs.
async function googleFailure(response: Response, operation: string): Promise<SyncResult> {
  let explanation: string | undefined;
  try {
    const parsed = googleError.safeParse(await response.json());
    if (parsed.success) for (const error of parsed.data.error.errors ?? []) {
      const safe = safeGoogleReasons.get(error.reason);
      if (safe) { explanation = `${safe} Code : ${error.reason}.`; break; }
    }
  } catch { /* Non-JSON responses use a fixed message below. */ }
  explanation ??= response.status === 429 ? "Google applique une limite de requêtes : nouvelle tentative automatique après temporisation."
    : response.status >= 500 ? "Service Google temporairement indisponible : nouvelle tentative automatique prévue."
    : "Motif Google non identifié : vérifier les droits et la configuration si le refus persiste. Les réservations sont conservées.";
  return { status: "erreur", message: `${operation} refusée (HTTP ${response.status}). ${explanation}` };
}
function patchTime(time: PlanningEvent["start"]) {
  return "date" in time ? { ...time, dateTime: null, timeZone: null } : { ...time, date: null };
}

// No raw Google exceptions/bodies/IDs/tokens are returned or logged.
export async function synchronizeCandidate(candidate: SyncCandidate, credentials: Credentials, deps: SyncDependencies): Promise<SyncResult> {
  const body = candidate.projection.body;
  const removing = deps.automatic && ["refuse", "annule"].includes(candidate.review.status);
  if (!body && !removing) return { status: "ignore", message: candidate.projection.reason };
  if (removing && !candidate.savedEventId && !candidate.reservedEventId) return { status: "ignore", message: "Aucun événement ERP à retirer." };
  const fingerprint = calendarFingerprint(credentials.calendarId);
  if (candidate.calendarFingerprint && candidate.calendarFingerprint !== fingerprint) {
    return { status: "erreur", message: "L'agenda configuré a changé : synchronisation bloquée pour éviter les doublons." };
  }
  const eventId = eventIdFor(candidate);
  if (!/^[a-v0-9]{5,1024}$/.test(eventId)) return { status: "erreur", message: "L'identifiant d'événement enregistré est invalide : vérification manuelle nécessaire." };
  const args = { requestId: candidate.requestId, snapshot: candidate.snapshot, eventId, calendarFingerprint: fingerprint };
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(credentials.calendarId)}/events`;
  const endpoint = `${base}/${encodeURIComponent(eventId)}`;
  const headers = { Authorization: `Bearer ${credentials.accessToken}`, "Content-Type": "application/json" };
  const send = (url: string, init: RequestInit) => deps.fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15_000) });
  let phase = "lecture Google";
  let operation: "cree" | "mis_a_jour" = "mis_a_jour";
  try {
    let response = await send(endpoint, { method: "GET", headers });
    if (removing) {
      if (response.status === 404 || response.status === 410) {
        await deps.remove?.(args);
        return { status: "ok", operation: "retire", message: "Événement déjà absent de Google Agenda." };
      }
      if (!response.ok) return googleFailure(response, "Lecture avant retrait");
      const event = responseEvent.safeParse(await response.json());
      if (!event.success || event.data.id !== eventId || event.data.recurrence?.length || event.data.recurringEventId
        || event.data.extendedProperties?.private?.requestId !== candidate.requestId) {
        return { status: "erreur", message: "Retrait bloqué : propriété ERP non prouvée. Événement manuel préservé." };
      }
      if (event.data.status !== "cancelled") {
        await deps.prepare({ ...args, reserveCreation: false });
        response = await send(`${endpoint}?sendUpdates=none`, { method: "DELETE", headers: { ...headers, "If-Match": event.data.etag } });
        if (!response.ok && response.status !== 404 && response.status !== 410) return googleFailure(response, "Suppression Google");
      }
      await deps.remove?.(args);
      return { status: "ok", operation: "retire", message: "Événement ERP retiré ; dossier conservé." };
    }
    if (response.status === 404) {
      if (candidate.savedEventId || (candidate.creationAttempted && !deps.automatic)) {
        return { status: "erreur", message: "Événement lié ou création déjà réservée, mais introuvable. Aucune nouvelle création : relancer plus tard ou vérifier manuellement." };
      }
      phase = "réservation Convex";
      const claimed = await deps.prepare({ ...args, reserveCreation: true });
      if (!claimed) return { status: "erreur", message: "Une autre tentative a déjà réservé la création. Relancer pour retrouver l'événement." };
      phase = "création Google";
      response = await send(`${base}?sendUpdates=none&eventLabelVersion=0`, {
        method: "POST", headers, body: JSON.stringify({ id: eventId, ...body }),
      });
      operation = "cree";
      if (response.status === 409) {
        response = await send(endpoint, { method: "GET", headers });
        operation = "mis_a_jour";
      }
    }
    if (!response.ok) return googleFailure(response, "Opération Google");
    const parsed = responseEvent.safeParse(await response.json());
    if (!parsed.success) return { status: "erreur", message: "Réponse Google inattendue : relancer pour réconcilier l'événement sans nouvelle création." };
    let event = parsed.data;
    if (!body) return { status: "ignore", message: candidate.projection.reason };
    const owner = event.extendedProperties?.private?.requestId;
    if (event.id !== eventId || (event.status !== "confirmed" && !(deps.automatic && candidate.removedByErp && event.status === "cancelled")) || event.recurrence?.length || event.recurringEventId
      || owner !== candidate.requestId) {
      return { status: "erreur", message: "Événement annulé, récurrent ou appartenant à un autre dossier : aucune modification effectuée." };
    }
    if (operation === "mis_a_jour") {
      phase = "validation Convex avant mise à jour";
      await deps.prepare({ ...args, reserveCreation: false });
      phase = "mise à jour Google";
      response = await send(`${endpoint}?sendUpdates=none&eventLabelVersion=0`, {
        method: "PATCH", headers: { ...headers, "If-Match": event.etag },
        body: JSON.stringify({ ...body, status: "confirmed", start: patchTime(body.start), end: patchTime(body.end),
          extendedProperties: { ...event.extendedProperties, private: { ...event.extendedProperties?.private, ...body.extendedProperties.private } },
        }),
      });
      if (!response.ok) return googleFailure(response, "Mise à jour Google");
      const updated = responseEvent.safeParse(await response.json());
      if (!updated.success || updated.data.id !== eventId || updated.data.status !== "confirmed"
        || updated.data.extendedProperties?.private?.requestId !== candidate.requestId) {
        return { status: "erreur", message: "La mise à jour n'a pas pu être confirmée : relancer la synchronisation du même événement." };
      }
      event = updated.data;
    }
    phase = "enregistrement Convex";
    await deps.record(args);
    let eventUrl: string | undefined;
    if (event.htmlLink) {
      const link = new URL(event.htmlLink);
      if (link.protocol === "https:" && ["www.google.com", "calendar.google.com"].includes(link.hostname)) eventUrl = event.htmlLink;
    }
    return { status: "ok", operation, message: "Événement synchronisé et dossier marqué synced.", ...(eventUrl ? { eventUrl } : {}) };
  } catch {
    return { status: "erreur", message: `Échec pendant la phase : ${phase}. Le dossier peut avoir changé ou le service être indisponible. Refaire le preview puis relancer pour reprendre sur le même événement ; identifiant réservé conservé pour toute reprise.` };
  }
}

export function buildOctoberPreview(candidates: SyncCandidate[], calendarId: string | undefined) {
  calendarId = calendarId?.trim();
  if (!calendarId) throw new Error("GOOGLE_CALENDAR_ID doit être configuré.");
  const fingerprint = calendarFingerprint(calendarId);
  const allPairs = possibleDuplicates(candidates);
  const rapprochementsValides = allPairs.filter(pair => resolvedOctoberPair(pair, candidates));
  const doublonsPossibles = allPairs.filter(pair => !resolvedOctoberPair(pair, candidates));
  const decisionsARevoir = candidates.filter(candidate => octoberSelection(candidate)?.valid === false)
    .map(candidate => ({ requestId: candidate.requestId, motif: "Date ou statut modifié depuis la sélection validée : nouvelle décision nécessaire." }));
  const dossiers = candidates.map(candidate => {
    const selection = octoberSelection(candidate);
    const excluded = selection?.valid && selection.exclude;
    const differentCalendar = candidate.calendarFingerprint !== null && candidate.calendarFingerprint !== fingerprint;
    const invalidId = !/^[a-v0-9]{5,1024}$/.test(eventIdFor(candidate));
    const action = !candidate.projection.body || differentCalendar || invalidId || excluded || selection?.valid === false ? "ignorer" as const
      : candidate.savedEventId || candidate.reservedEventId ? "mettre_a_jour" as const : "creer" as const;
    return {
      requestId: candidate.requestId, date: candidate.projection.day,
      client: candidate.review.client, statut: candidate.review.status,
      doublonPossible: doublonsPossibles.some(pair => pair.dossiers.some(dossier => dossier.requestId === candidate.requestId)),
      selectionValidee: selection?.valid ? selection.reason : null,
      action, motif: excluded ? selection.reason : selection?.valid === false ? "Sélection à revoir : date ou statut changé." : differentCalendar ? "Agenda différent de la réservation : synchronisation bloquée."
        : invalidId ? "Identifiant enregistré invalide : vérification manuelle nécessaire." : action === "ignorer" ? candidate.projection.reason
        : action === "mettre_a_jour" ? "Événement déjà lié ou réservé : réconciliation et mise à jour, jamais duplication."
        : "Création avec identifiant déterministe et réservation atomique.",
      journeeEntiere: candidate.projection.allDay, avertissement: candidate.projection.warning,
      evenement: action === "ignorer" ? null : candidate.projection.body
        ? { title: candidate.projection.body.summary, description: candidate.projection.body.description,
          location: candidate.projection.body.location, colorId: candidate.projection.body.colorId,
          start: candidate.projection.body.start, end: candidate.projection.body.end } : null,
    };
  });
  const toCreate = dossiers.filter(d => d.action === "creer").length;
  const toUpdate = dossiers.filter(d => d.action === "mettre_a_jour").length;
  return {
    mois: "2026-10", fuseau: "Europe/Paris", total: dossiers.length, toCreate, toUpdate,
    doublonsPossibles, rapprochementsValides, decisionsARevoir,
    aVerifier: doublonsPossibles.length + decisionsARevoir.length, applyBlocked: doublonsPossibles.length > 0 || decisionsARevoir.length > 0,
    ignored: dossiers.length - toCreate - toUpdate, expectedCount: toCreate + toUpdate,
    previewToken: createHash("sha256").update(JSON.stringify({ version: 3, fingerprint, candidates, doublonsPossibles, rapprochementsValides, decisionsARevoir, selection: dossiers.map(dossier => dossier.selectionValidee) })).digest("hex"),
    note: "Prévision fondée sur l'ERP, sans appel Google. Les événements liés/réservés seront vérifiés lors d'apply. Aucun événement supprimé.",
    dossiers,
  };
}

export function matchesOctoberApproval(plan: ReturnType<typeof buildOctoberPreview>, approval: { expectedCount: number; previewToken: string }): boolean {
  return !plan.applyBlocked && Number.isSafeInteger(approval.expectedCount) && approval.expectedCount === plan.expectedCount && approval.previewToken === plan.previewToken;
}


