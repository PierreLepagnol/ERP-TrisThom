import { expect, test } from "bun:test";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { legacyEventId, legacySourceId, octoberStart, octoberEnd, parisDay, projectRequest, requestSnapshot, reviewDetails, type SyncCandidate } from "../convex/googleCalendarPlanning";
import { buildOctoberPreview, matchesOctoberApproval, calendarFingerprint, eventIdFor, synchronizeCandidate, type SyncDependencies } from "../convex/googleCalendarSync";

function request(changes: Partial<Doc<"requests">> = {}): Doc<"requests"> {
  return { _id: "synthetic-request" as Id<"requests">, _creationTime: 0, source: "manuel", status: "accepte",
    contactName: "Marine Monbelli", organizationName: "Points communs", guestCount: 31,
    eventDate: Date.parse("2026-10-09T12:00:00+02:00"), eventStartTime: "15:00", eventEndTime: "17:00",
    eventAddress: "Théâtre des Louvrais, Pontoise", missingInformation: [], createdAt: 0, updatedAt: 42, ...changes };
}
function candidate(value = request()): SyncCandidate {
  return { requestId: value._id, snapshot: requestSnapshot(value, ""), projection: projectRequest(value), review: reviewDetails(value),
    savedEventId: value.googleCalendarEventId ?? null, reservedEventId: null, calendarFingerprint: null, creationAttempted: false };
}

for (const [status, colorId] of [["accepte", "10"], ["devis_envoye", "6"], ["relance", "6"], ["nouveau", "5"], ["a_qualifier", "5"], ["qualifie", "5"], ["devis_a_preparer", "5"]] as const) {
  test(`Google colorId and title for ${status}`, () => {
    const body = projectRequest(request({ status })).body!;
    expect(body.colorId).toBe(colorId); expect(body.summary).toStartWith("["); expect(body.description).toContain("Statut commercial");
  });
}

test("timed events use Paris offsets before and after the DST change", () => {
  expect(projectRequest(request()).body?.start).toEqual({ dateTime: "2026-10-09T13:00:00.000Z", timeZone: "Europe/Paris" });
  expect(projectRequest(request({ eventDate: Date.parse("2026-10-26T12:00:00+01:00") })).body?.start)
    .toEqual({ dateTime: "2026-10-26T14:00:00.000Z", timeZone: "Europe/Paris" });
  expect(projectRequest(request({ eventDate: Date.parse("2026-10-25T12:00:00+01:00"), eventStartTime: "02:30", eventEndTime: "04:00" })).body).toBeNull();
});

test("missing or partial hours produce an all-day event with exclusive next-day end", () => {
  const projection = projectRequest(request({ eventDate: octoberEnd - 1, eventEndTime: undefined }));
  expect(projection.allDay).toBe(true); expect(projection.body?.start).toEqual({ date: "2026-10-31" });
  expect(projection.body?.end).toEqual({ date: "2026-11-01" });
  expect(projectRequest(request({ eventStartTime: "bogus", eventEndTime: "17:00" })).body).toBeNull();
  expect(projectRequest(request({ eventStartTime: "18:00" })).body).toBeNull();
});

test("October boundaries follow the Paris calendar, including midnight", () => {
  expect(parisDay(octoberStart)).toBe("2026-10-01"); expect(parisDay(octoberStart - 1)).toBe("2026-09-30");
  expect(parisDay(octoberEnd - 1)).toBe("2026-10-31"); expect(parisDay(octoberEnd)).toBe("2026-11-01");
});

test("descriptions use structured fields, omit unknown data, mail history and localhost links", () => {
  const body = projectRequest(request({ eventType: "Plateaux repas", contactPhone: "01 23 45 67 89",
    specialNeeds: "Accès cuisine http://localhost:3000/dossiers/secret", dietaryRequirements: "Sans gluten",
    staffingNeeds: "Deux serveurs", message: "EMAIL HISTORY MUST NOT BE COPIED" }), "Livrer à l'entrée artistes").body!;
  expect(body.description).toContain("31"); expect(body.description).toContain("01 23 45 67 89");
  expect(body.description).toContain("Sans gluten"); expect(body.description).toContain("entrée artistes");
  expect(body.description).not.toContain("localhost"); expect(body.description).not.toContain("EMAIL HISTORY");
  expect(body.description).not.toContain("undefined");
});

for (const status of ["refuse", "annule", "termine"] as const) {
  test(`${status} events are left untouched`, async () => {
    const result = await synchronizeCandidate(candidate(request({ status, googleCalendarEventId: legacyEventId })), credentials,
      { fetch: (() => { throw new Error("network forbidden"); }) as typeof fetch, prepare: async () => { throw new Error("write forbidden"); }, record: async () => { throw new Error("write forbidden"); } });
    expect(result.status).toBe("ignore");
  });
}

const credentials = { calendarId: "synthetic-calendar", accessToken: "synthetic-token" };
function harness(options: { uncertainPost?: boolean; failRecord?: boolean; conflict?: boolean; owner?: string; cancelled?: boolean; stale?: boolean } = {}) {
  let value = candidate(), event: Record<string, any> | null = null, created = false, failRecord = options.failRecord;
  const calls: Array<{ url: string; method: string; body?: any; headers?: any }> = [];
  const deps: SyncDependencies = {
    fetch: (async (_input, init) => {
      const method = init!.method!; const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: String(_input), method, body, headers: init?.headers });
      if (method === "GET") return event ? Response.json(event) : new Response(null, { status: 404 });
      if (method === "POST") {
        event = { ...body, etag: '"v1"', status: "confirmed", htmlLink: "https://calendar.google.com/calendar/event?eid=synthetic" };
        if (options.uncertainPost) throw new Error("uncertain delivery");
        return options.conflict ? new Response(null, { status: 409 }) : Response.json(event);
      }
      expect(method).toBe("PATCH"); expect((init?.headers as any)["If-Match"]).toBe(event!.etag);
      event = { ...event, ...body, etag: '"v2"' }; return Response.json(event);
    }) as typeof fetch,
    prepare: async args => {
      if (options.stale) throw new Error("snapshot changed");
      if (args.reserveCreation && created) return false;
      if (args.reserveCreation) created = true;
      value = { ...value, reservedEventId: args.eventId, calendarFingerprint: args.calendarFingerprint, creationAttempted: created };
      return args.reserveCreation;
    },
    record: async args => {
      if (failRecord) { failRecord = false; throw new Error("database unavailable"); }
      value = { ...value, savedEventId: args.eventId }; return null;
    },
  };
  return { calls, run: () => synchronizeCandidate(value, credentials, deps), value: () => value,
    removeEvent: () => { event = null; }, seed: (linked = true) => {
      const id = legacyEventId;
      value = { ...value, savedEventId: linked ? id : null, reservedEventId: id, creationAttempted: true, calendarFingerprint: calendarFingerprint(credentials.calendarId) };
      event = { id, etag: '"legacy"', status: options.cancelled ? "cancelled" : "confirmed",
        extendedProperties: { private: { requestId: options.owner ?? value.requestId } },
        htmlLink: "https://calendar.google.com/calendar/event?eid=synthetic" };
    } };
}

test("new event is created once and reruns update the same ID", async () => {
  const h = harness(); expect((await h.run()).operation).toBe("cree"); expect((await h.run()).operation).toBe("mis_a_jour");
  expect(h.calls.filter(c => c.method === "POST")).toHaveLength(1);
  expect(h.calls.find(c => c.method === "POST")?.body.colorId).toBe("10");
});

test("uncertain insert response is recovered by GET/PATCH without a second POST", async () => {
  const h = harness({ uncertainPost: true }); expect((await h.run()).status).toBe("erreur"); expect((await h.run()).status).toBe("ok");
  expect(h.calls.filter(c => c.method === "POST")).toHaveLength(1);
});

test("failed Convex save is retried against the existing Google event", async () => {
  const h = harness({ failRecord: true }); expect((await h.run()).status).toBe("erreur"); expect((await h.run()).status).toBe("ok");
  expect(h.calls.filter(c => c.method === "POST")).toHaveLength(1);
});

test("concurrent creation attempts authorize only one POST", async () => {
  const h = harness(); const results = await Promise.all([h.run(), h.run()]);
  expect(results.some(r => r.status === "ok")).toBe(true); expect(h.calls.filter(c => c.method === "POST")).toHaveLength(1);
});

test("Google 409 is reconciled by reading and updating the existing event", async () => {
  const h = harness({ conflict: true }); expect((await h.run()).status).toBe("ok");
  expect(h.calls.map(c => c.method)).toEqual(["GET", "POST", "GET", "PATCH"]);
});

test("Points communs legacy event is updated, never recreated", async () => {
  const h = harness(); h.seed(); expect((await h.run()).operation).toBe("mis_a_jour");
  expect(h.calls.map(c => c.method)).toEqual(["GET", "PATCH"]);
  expect(eventIdFor(candidate(request({ externalSourceId: legacySourceId })))).toBe(legacyEventId);
});

test("all-day/timed PATCH clears incompatible fields and keeps notifications disabled", async () => {
  const h = harness(); h.seed(); await h.run();
  expect(h.calls.find(c => c.method === "PATCH")?.body.start.date).toBeNull();
  expect(h.calls.find(c => c.method === "PATCH")?.url).toContain("sendUpdates=none");
});

test("missing linked events, changed owners, cancelled events and stale ERP snapshots never create another event", async () => {
  for (const options of [{}, { owner: "someone-else" }, { cancelled: true }, { stale: true }]) {
    const h = harness(options); h.seed(); if (!Object.keys(options).length) h.removeEvent();
    expect((await h.run()).status).toBe("erreur"); expect(h.calls.filter(c => c.method === "POST")).toHaveLength(0);
  }
});

test("changed calendar is rejected before network and IDs are absent from the result", async () => {
  const value = candidate(); value.calendarFingerprint = "another-calendar";
  const result = await synchronizeCandidate(value, credentials, { fetch: (() => { throw new Error("forbidden"); }) as typeof fetch,
    prepare: async () => false, record: async () => null });
  expect(result.status).toBe("erreur"); expect(JSON.stringify(result)).not.toContain(credentials.accessToken);
  expect(JSON.stringify(result)).not.toContain(eventIdFor(value));
});

test("preview forecasts creations, updates and ignored records without leaking Google IDs", () => {
  const linked = candidate(request({ googleCalendarEventId: legacyEventId }));
  const ignored = candidate(request({ status: "termine" }));
  const preview = buildOctoberPreview([candidate(), linked, ignored], credentials.calendarId);
  expect(preview).toMatchObject({ toCreate: 1, toUpdate: 1, ignored: 1, expectedCount: 2 });
  expect(preview.dossiers.map(d => d.action)).toEqual(["creer", "mettre_a_jour", "ignorer"]);
  expect(JSON.stringify(preview)).not.toContain(legacyEventId);
  expect(preview.dossiers[1]?.evenement?.colorId).toBe("10");
});

test("approval rejects changed counts and changed payloads even when the count is the same", () => {
  const before = buildOctoberPreview([candidate()], credentials.calendarId);
  expect(matchesOctoberApproval(before, { expectedCount: 1, previewToken: before.previewToken })).toBe(true);
  expect(matchesOctoberApproval(before, { expectedCount: 2, previewToken: before.previewToken })).toBe(false);
  const after = buildOctoberPreview([candidate(request({ guestCount: 32 }))], credentials.calendarId);
  expect(matchesOctoberApproval(after, { expectedCount: 1, previewToken: before.previewToken })).toBe(false);
  expect(buildOctoberPreview([candidate()], "different-calendar").previewToken).not.toBe(before.previewToken);
});

test("preview keeps reserved creations as reconciliations and flags changed calendars", () => {
  const reserved = candidate(); reserved.reservedEventId = legacyEventId; reserved.creationAttempted = true;
  reserved.calendarFingerprint = calendarFingerprint(credentials.calendarId);
  expect(buildOctoberPreview([reserved], credentials.calendarId).dossiers[0]?.action).toBe("mettre_a_jour");
  expect(buildOctoberPreview([reserved], "changed-calendar").dossiers[0]?.action).toBe("ignorer");
});

test("preview detects known aliases and contradictory statuses without merging or excluding records", () => {
  const old = candidate(request({ _id: "old-monastery" as Id<"requests">, organizationName: undefined,
    contactName: "MONASTERE DE L ANNONCIADE", status: "devis_a_preparer" }));
  const imported = candidate(request({ _id: "imported-monastery" as Id<"requests">, organizationName: undefined,
    contactName: "Monastère", status: "refuse" }));
  const before = JSON.stringify([old, imported]);
  const plan = buildOctoberPreview([old, imported], credentials.calendarId);
  expect(plan.doublonsPossibles).toHaveLength(1); expect(plan.applyBlocked).toBe(true);
  expect(plan.dossiers.map(d => d.action)).toEqual(["creer", "ignorer"]);
  expect(plan.doublonsPossibles[0]?.motifs).toContain("Statuts commerciaux différents : décision manuelle nécessaire.");
  expect(matchesOctoberApproval(plan, { expectedCount: 1, previewToken: plan.previewToken })).toBe(false);
  expect(JSON.stringify([old, imported])).toBe(before);
});

for (const [first, second] of [["Scène nationale de Cergy-Pontoise", "Points communs"],
  ["Solene BOULMONT", "LOXAM / Grande Table"], ["Enora Marquez", "Barry / Enora + CODIR"],
  ["Olivier LIMOGES", "FEHAP"], ["MAS", "MAS"], ["Bouvier Laura", "Bouvier"],
  ["Lydia CHEVALIER", "Lydia"], ["Etienne", "Benoît Etienne"]]) {
  test(`possible duplicate review: ${first} / ${second}`, () => {
    const rows = [first, second].map((contactName, index) => candidate(request({
      _id: `alias-${index}` as Id<"requests">, organizationName: undefined, contactName,
    })));
    expect(buildOctoberPreview(rows, credentials.calendarId).doublonsPossibles).toHaveLength(1);
  });
}

test("same contacts on different dates, and deleted duplicates, require no blocking decision", () => {
  const rows = [candidate(request()), candidate(request({ _id: "other-day" as Id<"requests">,
    eventDate: Date.parse("2026-10-10T12:00:00+02:00") })),
    candidate(request({ _id: "deleted" as Id<"requests">, deletedAt: 1 }))];
  expect(buildOctoberPreview(rows, credentials.calendarId).doublonsPossibles).toHaveLength(0);
  expect(buildOctoberPreview(rows, credentials.calendarId).applyBlocked).toBe(false);
});

test("two distinct prestations on the same day are flagged for review, never automatically merged", () => {
  const rows = [candidate(request({ _id: "cocktail" as Id<"requests">, eventType: "Cocktail" })),
    candidate(request({ _id: "brunch" as Id<"requests">, eventType: "Brunch" }))];
  const plan = buildOctoberPreview(rows, credentials.calendarId);
  expect(plan.toCreate).toBe(2); expect(plan.doublonsPossibles).toHaveLength(1);
});

test("request narrative stored in specialNeeds is removed without changing ERP fields", () => {
  const value = request({ specialNeeds: "Buffet · Bonjour,Dans le cadre de la recherche de salle pour notre événement, nous souhaitons également recevoir des propositions de traiteurs. Merci d'avance. Cordialement, Marie Pelage" });
  const before = JSON.stringify(value);
  const projection = projectRequest(value);
  expect(projection.body?.description).toContain("Besoins particuliers : Buffet");
  expect(projection.body?.description).not.toContain("Bonjour");
  expect(projection.body?.description).not.toContain("propositions");
  expect(projection.warning).toContain("Passages de correspondance");
  expect(JSON.stringify(value)).toBe(before);
});

test("useful dietary/logistics details survive while quoted messages and signatures are omitted", () => {
  const projection = projectRequest(request({ specialNeeds: "Sans gluten\nBonjour\nAccès par l'entrée artistes\nCordialement\nSignature client\nDe: ancienne conversation\nHistorique à ne pas copier",
    dietaryRequirements: "Sans noix", staffingNeeds: "Deux serveurs" }), "Livrer à 11h30\nMerci pour votre devis\nPrévoir matériel de maintien au chaud");
  expect(projection.body?.description).toContain("Sans gluten");
  expect(projection.body?.description).toContain("entrée artistes");
  expect(projection.body?.description).toContain("Sans noix");
  expect(projection.body?.description).toContain("Livrer à 11h30");
  expect(projection.body?.description).toContain("matériel de maintien au chaud");
  expect(projection.body?.description).not.toContain("Signature client");
  expect(projection.body?.description).not.toContain("Historique");
  expect(projection.body?.description).not.toContain("Merci");
});

test("validated October selection keeps Points communs and excludes the reviewed duplicate", () => {
  const rows = [candidate(request({ _id: "jh7cqrc4mbhxxm2vnxkjtdvem98fwy0e" as Id<"requests">, eventDate: Date.parse("2026-10-08T12:00:00+02:00") })),
    candidate(request({ _id: "jh7ekexxyapy1cazcnt56aehah8e2zcc" as Id<"requests">, eventDate: Date.parse("2026-10-08T12:00:00+02:00"), organizationName: "Scène nationale de Cergy-Pontoise" }))];
  const before = JSON.stringify(rows);
  const plan = buildOctoberPreview(rows, credentials.calendarId);
  expect(plan.dossiers.map(row => row.action)).toEqual(["creer", "ignorer"]);
  expect(plan.rapprochementsValides).toHaveLength(1);
  expect(plan.applyBlocked).toBe(false);
  expect(plan.expectedCount).toBe(1);
  expect(JSON.stringify(rows)).toBe(before);
});

test("all three reviewed Lydia records are excluded from the first October batch", () => {
  const rows = ["jh75479jffks516b9jbxjc3r2h8e4w7e", "jh71vx9vkbhy0bp8s0gvjs2x0s8e67jz", "jh7fawbmacq81ba43cjrzbvsfs8fwwby"].map((id, index) => candidate(request({
    _id: id as Id<"requests">, organizationName: "Lydia", eventDate: Date.parse("2026-10-25T12:00:00+01:00"), status: index === 2 ? "devis_envoye" : "nouveau",
  })));
  const plan = buildOctoberPreview(rows, credentials.calendarId);
  expect(plan.ignored).toBe(3); expect(plan.expectedCount).toBe(0);
  expect(plan.rapprochementsValides).toHaveLength(3); expect(plan.applyBlocked).toBe(false);
});

test("changed validated status and new duplicate require another review", () => {
  const selected = candidate(request({ _id: "jh7cqrc4mbhxxm2vnxkjtdvem98fwy0e" as Id<"requests">, eventDate: Date.parse("2026-10-08T12:00:00+02:00"), status: "relance" }));
  const changed = buildOctoberPreview([selected], credentials.calendarId);
  expect(changed.decisionsARevoir).toHaveLength(1); expect(changed.applyBlocked).toBe(true);
  expect(matchesOctoberApproval(changed, { expectedCount: 0, previewToken: changed.previewToken })).toBe(false);
  selected.review.status = "accepte";
  const unknown = candidate(request({ _id: "new-duplicate" as Id<"requests">, eventDate: Date.parse("2026-10-08T12:00:00+02:00") }));
  expect(buildOctoberPreview([selected, unknown], credentials.calendarId).applyBlocked).toBe(true);
});

for (const [reason, expected] of [["rateLimitExceeded", "limite de requêtes"], ["userRateLimitExceeded", "limite de requêtes"], ["quotaExceeded", "quota"], ["forbiddenForNonOrganizer", "organisateur"]] as const) {
  test(`Google 403 exposes a safe, actionable diagnosis for ${reason}`, async () => {
    const value = candidate(request({ googleCalendarEventId: legacyEventId }));
    const calls: string[] = [];
    const result = await synchronizeCandidate(value, credentials, {
      fetch: (async (_url, init) => {
        calls.push(init!.method!);
        if (init!.method === "GET") return Response.json({ id: legacyEventId, status: "confirmed", etag: "etag", extendedProperties: { private: { requestId: value.requestId } } });
        return Response.json({ error: { errors: [{ reason, message: "synthetic-token private-key calendar-secret" }], message: "private-key", code: 403 } }, { status: 403 });
      }) as typeof fetch,
      prepare: async () => true, record: async () => { throw new Error("must not record failure"); },
    });
    expect(result.status).toBe("erreur"); expect(result.message).toContain(expected);
    expect(result.message).not.toContain("private-key"); expect(result.message).not.toContain("synthetic-token");
    expect(calls).toEqual(["GET", "PATCH"]);
  });
}

