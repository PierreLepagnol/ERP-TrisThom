import { expect, test } from "bun:test";

import {
  commercialChangeSuggestions,
  emailImportEnabled,
  inboxExternalId,
  inboxUidsAfterCursor,
} from "../convex/inboxPolicy";

test("uses Message-ID before the IMAP UID and keeps a UID fallback", () => {
  expect(inboxExternalId(" <message-42@example.test> ", 7)).toBe("message-id:<message-42@example.test>");
  expect(inboxExternalId("<message-42@example.test>", 99)).toBe("message-id:<message-42@example.test>");
  expect(inboxExternalId(undefined, 7)).toBe("imap:INBOX:7");
});

test("stores commercial changes as suggestions instead of applying them", () => {
  expect(commercialChangeSuggestions(
    { contactName: "Ada", guestCount: 80, eventAddress: "Paris", eventType: "Cocktail" },
    { guestCount: 95, eventAddress: "Paris", eventType: "Buffet" },
  )).toEqual([
    { field: "eventType", currentValue: "Cocktail", proposedValue: "Buffet" },
    { field: "guestCount", currentValue: "80", proposedValue: "95" },
  ]);
});

test("requires an explicit email-import opt-in", () => {
  expect(emailImportEnabled()).toBeFalse();
  expect(emailImportEnabled("false")).toBeFalse();
  expect(emailImportEnabled("true")).toBeTrue();
  expect(emailImportEnabled(" TRUE ")).toBeTrue();
});

test("processes only UIDs received after the activation cursor, in bounded batches", () => {
  expect(inboxUidsAfterCursor([10, 11, 12, 13], 10, 2)).toEqual([11, 12]);
  expect(inboxUidsAfterCursor([10, 11], 11, 20)).toEqual([]);
});
