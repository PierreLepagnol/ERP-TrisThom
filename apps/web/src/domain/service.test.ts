// @ts-expect-error Bun supplies this module when running `bun test`.
import { expect, test } from "bun:test";

import { getCurrentQuoteVersion, getOperationalServices } from "./service";

const now = new Date(2026, 6, 22, 10).getTime();
const request = (id: string, eventDate: number, status = "accepte") => ({ _id: id, status, eventDate });

test("lists confirmed upcoming services separately from recently completed ones", () => {
  const result = getOperationalServices([
    request("future", now + 2 * 86_400_000),
    request("recent", now - 5 * 86_400_000, "termine"),
    request("old", now - 31 * 86_400_000, "termine"),
  ] as any, now);

  expect(result.upcoming.map((item) => item._id)).toEqual(["future"]);
  expect(result.recentlyCompleted.map((item) => item._id)).toEqual(["recent"]);
});

test("uses the current quote version and falls back to the latest version", () => {
  const versions = [{ id: "v1", versionNumber: 1 }, { id: "v2", versionNumber: 2 }];
  expect(getCurrentQuoteVersion({ currentVersionId: "v1", versions } as any)?.id).toBe("v1");
  expect(getCurrentQuoteVersion({ currentVersionId: "missing", versions } as any)?.id).toBe("v2");
});

test("shows two confirmed prestations of one dossier separately, without the legacy date", () => {
  const dossier = {
    ...request("romane", now + 86400000),
    effectiveEvents: [
      { _id: "oct-3", historical: false, label: "Plateaux 3 octobre", date: now + 86400000, status: "confirmee" },
      { _id: "oct-10", historical: false, label: "Plateaux 10 octobre", date: now + 8 * 86400000, status: "confirmee" },
    ],
  };
  expect(getOperationalServices([dossier] as any, now).upcoming).toHaveLength(2);
});

test("a cancelled prestation is not replaced by its parent dossier legacy date", () => {
  const dossier = {
    ...request("romane", now + 86400000),
    effectiveEvents: [{ _id: "cancelled", historical: false, label: "Annulée", date: now + 86400000, status: "annulee" }],
  };
  expect(getOperationalServices([dossier] as any, now).upcoming).toHaveLength(0);
});
