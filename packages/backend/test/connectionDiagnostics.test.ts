import { expect, test } from "bun:test";

import { statusFromAudit } from "../convex/connectionDiagnostics";
import { destructiveCrmResetEnabled, requireDestructiveCrmResetEnabled } from "../convex/destructiveOperations";

test("reports configuration, success and failure without exposing diagnostic payloads", () => {
  expect(statusFromAudit(false, [])).toBe("non_configure");
  expect(statusFromAudit(true, [])).toBe("configure_non_teste");
  expect(statusFromAudit(true, [{ receivedAt: 1, outcome: "success", code: "created" }])).toBe("ok");
  expect(statusFromAudit(true, [
    { receivedAt: 1, outcome: "success", code: "created" },
    { receivedAt: 2, outcome: "failure", code: "invalid_secret" },
  ])).toBe("erreur");
});

test("disables destructive CRM resets unless explicitly enabled", () => {
  expect(destructiveCrmResetEnabled()).toBeFalse();
  expect(destructiveCrmResetEnabled("false")).toBeFalse();
  expect(destructiveCrmResetEnabled("true")).toBeTrue();
  expect(() => requireDestructiveCrmResetEnabled()).toThrow("ALLOW_DESTRUCTIVE_CRM_RESET");
});
