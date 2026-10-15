import type { Doc, Id } from "./_generated/dataModel";

export const octoberStart = Date.parse("2026-10-01T00:00:00+02:00");
export const octoberEnd = Date.parse("2026-11-01T00:00:00+01:00");
export const legacySourceId = "reprise-oct-2026:2026-10-09:points-communs";
export const legacyEventId = "bc20261009pointscommuns";
const zone = "Europe/Paris";
const labels: Record<Doc<"requests">["status"], string> = {
  nouveau: "Nouveau", a_qualifier: "À qualifier", qualifie: "Qualifié",
  devis_a_preparer: "Devis à préparer", devis_envoye: "En attente client",
  relance: "En attente client — relance", accepte: "Confirmé", termine: "Terminé",
  refuse: "Perdu", annule: "Annulé",
};

export function parisDay(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value) || Number.isNaN(new Date(value).getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function instant(day: string, time: string): string | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const local = `${day}T${time}:00`;
  // Paris uses UTC+1/UTC+2. Reject nonexistent or ambiguous DST wall times.
  const candidates = ["+01:00", "+02:00"].map(offset => Date.parse(local + offset)).filter(value => {
    const clock = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
    return parisDay(value) === day && clock === time;
  });
  return candidates.length === 1 ? new Date(candidates[0]!).toISOString() : null;
}

function text(value: string | undefined): string {
  // Never publish local ERP URLs, including URLs pasted into structured fields.
  return (value ?? "").replace(/https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|0\.0\.0\.0)(?::\d+)?(?:\/[^\s]*)?/gi, "").trim();
}

type EventTime = { date: string } | { dateTime: string; timeZone: string };
export type PlanningEvent = {
  summary: string; description: string; location: string; colorId: string;
  start: EventTime; end: EventTime;
  extendedProperties: { private: { requestId: string; externalSourceId?: string } };
};
export type Projection = { body: PlanningEvent | null; reason: string; day: string | null; allDay: boolean; warning: string | null };

export function projectRequest(request: Doc<"requests">, logistics = ""): Projection {
  const day = parisDay(request.eventDate);
  const ignore = (reason: string): Projection => ({ body: null, reason, day, allDay: false, warning: null });
  if (request.deletedAt !== undefined) return ignore("Dossier supprimé : événement existant conservé.");
  if (request.archivedAt !== undefined) return ignore("Dossier archivé : événement existant conservé.");
  if (request.status === "refuse" || request.status === "annule") return ignore("Dossier perdu ou annulé : exclu, sans suppression Google.");
  if (request.status === "termine") return ignore("Dossier terminé : historique Google conservé, sans modification.");
  if (!day) return ignore("Date absente ou invalide.");
  const startTime = request.eventStartTime?.trim();
  const endTime = request.eventEndTime?.trim();
  const allDay = !startTime || !endTime;
  let start: EventTime;
  let end: EventTime;
  if (allDay) {
    start = { date: day };
    end = { date: new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) };
  } else {
    const from = instant(day, startTime);
    const until = instant(day, endTime);
    if (!from || !until || until <= from) return ignore("Horaires invalides, ambigus ou fin antérieure au début : correction ERP nécessaire.");
    start = { dateTime: from, timeZone: zone };
    end = { dateTime: until, timeZone: zone };
  }
  const status = labels[request.status];
  const client = text(request.organizationName) || text(request.contactName) || text(request.title);
  const lines: string[] = [];
  const add = (label: string, value: string | undefined) => { const clean = text(value); if (clean) lines.push(`${label} : ${clean}`); };
  add("Client / société", request.organizationName || request.contactName);
  add("Type de prestation", request.eventType);
  if (request.guestCount !== undefined) lines.push(`Nombre de personnes : ${request.guestCount}`);
  add("Contact", request.contactName);
  add("Téléphone", request.contactPhone);
  add("Adresse", request.eventAddress);
  add("Lieu", request.venue);
  if (startTime) add("Début", startTime);
  if (endTime) add("Fin", endTime);
  if (allDay) lines.push("Journée entière : horaires incomplets.");
  lines.push("Fuseau horaire : Europe/Paris");
  const omittedFields: string[] = [];
  const addDetails = (label: string, value: string | undefined) => {
    const cleaned = cleanCalendarDetails(value);
    add(label, cleaned.value);
    if (cleaned.omitted) omittedFields.push(label);
  };
  addDetails("Besoins particuliers", request.specialNeeds);
  addDetails("Régimes / allergies", request.dietaryRequirements);
  addDetails("Personnel", request.staffingNeeds);
  addDetails("Logistique (devis courant)", logistics);
  lines.push(`Statut commercial : ${status}`);
  const description = lines.join("\n");
  if (description.length > 8000) return ignore("Description trop longue : réduire les indications structurées avant synchronisation.");
  return {
    body: {
      summary: `[${status}] ${[client, text(request.eventType)].filter(Boolean).join(" — ") || "Dossier"}`,
      description, location: [text(request.venue), text(request.eventAddress)].filter(Boolean).join(", "),
      colorId: request.status === "accepte" ? "10" : ["devis_envoye", "relance"].includes(request.status) ? "6" : "5",
      start, end, extendedProperties: { private: {
        requestId: request._id, ...(request.externalSourceId ? { externalSourceId: request.externalSourceId } : {}),
      } },
    },
    reason: "Dossier daté éligible.", day, allDay,
    warning: [allDay ? "Horaires incomplets : événement journée entière." : "",
      omittedFields.length ? `Passages de correspondance ou trop longs omis : ${omittedFields.join(", ")}. Vérifier les détails conservés.` : "",
    ].filter(Boolean).join(" ") || null,
  };
}

export function requestSnapshot(request: Doc<"requests">, logistics: string): string {
  return JSON.stringify({ projection: projectRequest(request, logistics), eventDate: request.eventDate,
    status: request.status, eventId: request.googleCalendarEventId ?? null, externalSourceId: request.externalSourceId ?? null });
}

export type SyncCandidate = {
  requestId: Id<"requests">; snapshot: string; projection: Projection; review: ReviewDetails;
  savedEventId: string | null; reservedEventId: string | null;
  calendarFingerprint: string | null; creationAttempted: boolean; removedByErp?: boolean;
};
// Only projections are cleaned. Source fields and commercial statuses stay intact.
export function cleanCalendarDetails(value: string | undefined): { value: string; omitted: boolean } {
  if (!value?.trim()) return { value: "", omitted: false };
  const parts = value.split(/\r?\n|\s+[*•]\s+|\s+·\s+/);
  const kept: string[] = [];
  let omitted = false;
  let correspondence = false;
  for (const part of parts) {
    const line = part.trim();
    if (!line) continue;
    if (/^(?:de|from|a|à|to|objet|subject|envoy[eé]|sent)\s*:|^-{3,}|message (?:transf[eé]r[eé]|d.origine)|forwarded message/i.test(line)) correspondence = true;
    const normalized = line.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/\b(?:cordialement|salutations|bien a vous)\b/.test(normalized)) correspondence = true;
    if (correspondence || line.length > 240 || /^>/.test(line) || /<\/?(?:html|body|div|p|script|br)\b/i.test(line)
      || /\b(?:bonjour|bonsoir|madame|monsieur|pouvez vous|pourriez vous|veuillez|je souhaite|je souhaiterais|demande de devis|cordialement|salutations|merci|je vous remercie|je vous prie|nous souhaitons|nous aimerions|nous voudrions|nous recherchons|propositions? de (?:menus|traiteurs)|recevoir des propositions|estimation budgetaire|devis pour|bien vouloir|dans le cadre de la recherche)\b/.test(normalized)) {
      omitted = true;
    } else kept.push(text(line));
  }
  return { value: kept.filter(Boolean).join("\n"), omitted };
}

export type ReviewDetails = {
  client: string; contact: string; status: Doc<"requests">["status"];
  source: Doc<"requests">["source"]; externalSourceId: string | null;
  email: string | null; phone: string | null; inactive: boolean;
};

export function reviewDetails(request: Doc<"requests">): ReviewDetails {
  return { client: request.organizationName?.trim() || request.contactName.trim(), contact: request.contactName.trim(),
    status: request.status, source: request.source, externalSourceId: request.externalSourceId ?? null,
    email: request.contactEmail?.trim().toLowerCase() || null,
    phone: request.contactPhone?.replace(/\D/g, "") || null,
    inactive: request.deletedAt !== undefined || request.archivedAt !== undefined };
}

function normalizedIdentity(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clientAlias(value: string): string {
  const name = normalizedIdentity(value);
  // Aliases observed in the initial October preview. These are review hints,
  // never evidence sufficient to merge, delete or exclude a request.
  const aliases: Array<[RegExp, string]> = [
    [/points communs|^scene nationale de cergy pontoise$/, "points communs"],
    [/^solene boulmont$|^loxam(?: grande table)?$/, "loxam solene"],
    [/^enora marquez$|^barry enora codir$/, "barry enora"],
    [/^gaelle corniere$|^barry gaelle j2$/, "barry gaelle"],
    [/^olivier limoges$|^fehap$/, "fehap olivier"],
    [/^monastere(?: de l annonciade)?$/, "monastere"],
    [/^bouvier(?: laura)?$/, "bouvier"],
    [/^lydia(?: chevalier)?$/, "lydia"],
    [/^(?:benoit )?etienne$/, "etienne"],
  ];
  return aliases.find(([pattern]) => pattern.test(name))?.[1] ?? name;
}

export function possibleDuplicates(candidates: SyncCandidate[]) {
  const pairs: Array<{ date: string; motifs: string[]; dossiers: Array<{
    requestId: Id<"requests">; client: string; contact: string; statut: string;
    source: Doc<"requests">["source"]; externalSourceId: string | null; eligible: boolean;
  }> }> = [];
  for (let i = 0; i < candidates.length; i++) {
    const first = candidates[i]!;
    if (first.review.inactive || !first.projection.day) continue;
    for (let j = i + 1; j < candidates.length; j++) {
      const second = candidates[j]!;
      if (second.requestId === first.requestId || second.review.inactive || second.projection.day !== first.projection.day) continue;
      // At least one event would be written; ignored historical pairs need no decision.
      if (!first.projection.body && !second.projection.body) continue;
      const reasons: string[] = [];
      const a = first.review;
      const b = second.review;
      const namesA = [a.client, a.contact].map(clientAlias).filter(Boolean);
      const namesB = [b.client, b.contact].map(clientAlias).filter(Boolean);
      if (namesA.some(name => namesB.includes(name))) reasons.push("Même client/contact ou alias connu à la même date.");
      if (a.email && a.email === b.email) reasons.push("Même e-mail de contact à la même date.");
      const phone = (value: string | null) => value?.replace(/^(?:0033|33)(?=\d{9}$)/, "0");
      if (a.phone && a.phone.length >= 9 && phone(a.phone) === phone(b.phone)) reasons.push("Même téléphone à la même date.");
      if (!reasons.length) continue;
      if (a.status !== b.status) reasons.push("Statuts commerciaux différents : décision manuelle nécessaire.");
      pairs.push({ date: first.projection.day, motifs: reasons, dossiers: [first, second].map(candidate => ({
        requestId: candidate.requestId, client: candidate.review.client, contact: candidate.review.contact,
        statut: labels[candidate.review.status], source: candidate.review.source,
        externalSourceId: candidate.review.externalSourceId, eligible: Boolean(candidate.projection.body),
      })) });
    }
  }
  return pairs;
}

// Human-approved selection for the first October 2026 batch only. These IDs
// come from the reviewed preview; this never changes/deletes ERP records.
const octoberDecisions: Record<string, { day: string; status: Doc<"requests">["status"]; exclude: boolean; reason: string }> = {
  jh7cqrc4mbhxxm2vnxkjtdvem98fwy0e: { day: "2026-10-08", status: "accepte", exclude: false, reason: "Points communs de reprise retenu (25 repas)." },
  jh7ekexxyapy1cazcnt56aehah8e2zcc: { day: "2026-10-08", status: "accepte", exclude: true, reason: "Scène nationale exclu : dossier Points communs de reprise retenu." },
  jh72bm1z23xhrd2j7tt0n87djs8fwc46: { day: "2026-10-13", status: "accepte", exclude: false, reason: "LOXAM / Grande Table de reprise retenu." },
  jh72b7ynjmcc9ba9669fb6jwt18f1803: { day: "2026-10-13", status: "a_qualifier", exclude: true, reason: "Ancienne demande Solène exclue : LOXAM de reprise retenu." },
  jh71pgjs5gbwp78wcynekswyth8fx04j: { day: "2026-10-14", status: "accepte", exclude: false, reason: "Barry / Enora + CODIR de reprise retenu." },
  jh787rz92hc6xtje581pza41jh8f9r1c: { day: "2026-10-14", status: "devis_envoye", exclude: true, reason: "Ancienne demande Enora exclue : Barry / Enora de reprise retenu." },
  jh73563zw7rb0az9x4yjnmxem58b2cx6: { day: "2026-10-18", status: "devis_a_preparer", exclude: true, reason: "Monastère exclu de la première synchronisation : prestation perdue selon validation utilisateur." },
  jh7c0g55ee7mdyjnn5rr12esax8fxfxx: { day: "2026-10-18", status: "refuse", exclude: true, reason: "Monastère perdu : exclu selon validation utilisateur." },
  jh74taj1w8ap1bnptcc60d4nbd8fw4ns: { day: "2026-10-20", status: "devis_envoye", exclude: false, reason: "FEHAP de reprise retenu (30 personnes)." },
  jh7fbtrp2zxegyyb4zy9te7sk58fbsph: { day: "2026-10-20", status: "a_qualifier", exclude: true, reason: "Ancienne demande Olivier Limoges exclue : FEHAP de reprise retenu." },
  jh71rgvgzgeq0m9n69gw0nqb0x8fxa96: { day: "2026-10-23", status: "devis_envoye", exclude: false, reason: "MAS de reprise retenu." },
  jh76efrqfawd8qqpwd0wdwb5cx8evqe7: { day: "2026-10-23", status: "nouveau", exclude: true, reason: "MAS Directus nouveau exclu : MAS de reprise retenu." },
  jh7cb7k2nmxm649wwbz47danv98b29r8: { day: "2026-10-23", status: "refuse", exclude: true, reason: "MAS Directus perdu exclu selon validation utilisateur." },
  jh7aat2xkryt1vzhmsp9qpw9h98fx40j: { day: "2026-10-24", status: "devis_envoye", exclude: false, reason: "Bouvier de reprise retenu." },
  jh77c67zfpn7a15bdm08d0qknn8b1krc: { day: "2026-10-24", status: "devis_a_preparer", exclude: true, reason: "Bouvier Laura exclu : Bouvier de reprise retenu." },
  jh75479jffks516b9jbxjc3r2h8e4w7e: { day: "2026-10-25", status: "nouveau", exclude: true, reason: "Lydia cocktail exclue de cette première synchronisation selon validation utilisateur." },
  jh71vx9vkbhy0bp8s0gvjs2x0s8e67jz: { day: "2026-10-25", status: "nouveau", exclude: true, reason: "Lydia brunch exclue de cette première synchronisation selon validation utilisateur." },
  jh7fawbmacq81ba43cjrzbvsfs8fwwby: { day: "2026-10-25", status: "devis_envoye", exclude: true, reason: "Lydia de reprise exclue de cette première synchronisation selon validation utilisateur." },
  jh74e91kwrn8cj11pzp8vjgxfx8fwrt8: { day: "2026-10-31", status: "devis_envoye", exclude: false, reason: "Benoît Etienne de reprise retenu." },
  jh7fgwad3qv2jm0j7cmvrf72398fbmv7: { day: "2026-10-31", status: "nouveau", exclude: true, reason: "Ancienne demande Etienne exclue : Benoît Etienne de reprise retenu." },
};

export function octoberSelection(candidate: SyncCandidate) {
  const decision = octoberDecisions[candidate.requestId];
  if (!decision) return null;
  const valid = decision.day === candidate.projection.day && decision.status === candidate.review.status;
  return { ...decision, valid };
}

export function resolvedOctoberPair(pair: ReturnType<typeof possibleDuplicates>[number], candidates: SyncCandidate[]): boolean {
  const members = pair.dossiers.map(row => candidates.find(candidate => candidate.requestId === row.requestId));
  const decisions = members.map(member => member ? octoberSelection(member) : null);
  return decisions.every(decision => decision?.valid) && decisions.some(decision => decision?.exclude);
}

export function automaticDecision(candidate: SyncCandidate, now: number): string | null {
  if (octoberSelection(candidate)?.exclude) return "Dossier écarté lors de la sélection validée : exclusion conservée.";
  if (candidate.review.status === "termine") return "Dossier terminé : historique conservé.";
  if (["refuse", "annule"].includes(candidate.review.status)) return candidate.savedEventId || candidate.reservedEventId ? null : "Aucun événement ERP à retirer.";
  if (!candidate.projection.body) return candidate.projection.reason;
  if (!candidate.savedEventId && !candidate.reservedEventId && candidate.projection.day! < parisDay(now)!) return "Dossier passé sans événement : aucune création rétroactive.";
  return null;
}
export function retryDelay(attempt: number): number {
  return Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(9, Math.max(0, attempt - 1)));
}
