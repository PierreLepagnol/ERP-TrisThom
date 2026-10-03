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
