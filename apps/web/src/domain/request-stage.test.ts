// @ts-expect-error Bun supplies this module when running `bun test`.
import { expect, test } from "bun:test";

import { getRequestStage, isHistoricalRequest } from "./request-stage";

const today = new Date(2026, 6, 22, 10).getTime();
const tomorrow = new Date(2026, 6, 23, 12).getTime();
const yesterday = new Date(2026, 6, 21, 12).getTime();

test("groups every legacy active status into its user stage", () => {
  for (const status of ["nouveau", "a_qualifier", "qualifie", "devis_a_preparer"] as const) expect(getRequestStage({ status }, today)).toBe("a_traiter");
  for (const status of ["devis_envoye", "relance"] as const) expect(getRequestStage({ status }, today)).toBe("devis_envoye");
});

test("derives accepted work from the event date", () => {
  expect(getRequestStage({ status: "accepte", eventDate: today }, today)).toBe("confirme");
  expect(getRequestStage({ status: "accepte", eventDate: tomorrow }, today)).toBe("confirme");
  expect(getRequestStage({ status: "accepte", eventDate: yesterday }, today)).toBe("termine");
  expect(getRequestStage({ status: "accepte" }, today)).toBe("confirme");
});

test("keeps refused and cancelled requests in history", () => {
  expect(isHistoricalRequest({ status: "refuse" }, today)).toBe(true);
  expect(isHistoricalRequest({ status: "annule" }, today)).toBe(true);
});
