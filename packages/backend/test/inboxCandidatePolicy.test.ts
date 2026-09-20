import { expect, test } from "bun:test";
import { matchesInboxCandidate } from "../convex/inboxCandidatePolicy";

const request = {
  contactName: "Élodie Martin",
  organizationName: "Comptoir des Arts",
  contactEmail: "elodie@example.fr",
  eventType: "Séminaire",
  status: "accepte" as const,
};

test("keeps every open status, including confirmed dossiers, in active results", () => {
  for (const status of ["nouveau", "a_qualifier", "qualifie", "devis_a_preparer", "devis_envoye", "relance", "accepte"] as const) {
    expect(matchesInboxCandidate({ ...request, status }, "", false)).toBe(true);
    expect(matchesInboxCandidate({ ...request, status }, "", true)).toBe(false);
  }
});

test("shows closed and archived dossiers only in history", () => {
  for (const status of ["termine", "refuse", "annule"] as const) {
    expect(matchesInboxCandidate({ ...request, status }, "", false)).toBe(false);
    expect(matchesInboxCandidate({ ...request, status }, "", true)).toBe(true);
  }
  expect(matchesInboxCandidate({ ...request, archivedAt: 1 }, "", false)).toBe(false);
  expect(matchesInboxCandidate({ ...request, archivedAt: 1 }, "", true)).toBe(true);
});

test("never returns deleted dossiers, even in history", () => {
  for (const history of [false, true]) {
    expect(matchesInboxCandidate({ ...request, deletedAt: 1 }, "", history)).toBe(false);
    expect(matchesInboxCandidate({ ...request, deletedAt: 1, archivedAt: 1 }, "", history)).toBe(false);
  }
});

test("searches contact, company, email and event without case or accent sensitivity", () => {
  for (const search of [" ELODIE ", "comptoir", "EXAMPLE.FR", "seminaire", "martin arts seminaire"]) {
    expect(matchesInboxCandidate(request, search, false)).toBe(true);
  }
  expect(matchesInboxCandidate(request, "martin mariage", false)).toBe(false);
  expect(matchesInboxCandidate({ contactName: "Alice", status: "nouveau" }, "alice", false)).toBe(true);
  expect(matchesInboxCandidate({ ...request, status: "termine" }, "elodie", true)).toBe(true);
});
