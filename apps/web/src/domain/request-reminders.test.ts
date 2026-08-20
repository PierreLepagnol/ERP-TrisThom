// @ts-expect-error Bun supplies this module when running `bun test`.
import { expect, test } from "bun:test";

import { openManualReminders } from "./request-reminders";

test("keeps only open manual reminders and orders them by due date", () => {
  const reminders = openManualReminders([
    { _id: "first", contactName: "Alice", followUps: [
      { id: "legacy", kind: "relance_j3", title: "Ancienne relance", dueAt: 1 },
      { id: "future", kind: "manuel", title: "Demander un retour", dueAt: 30 },
      { id: "done", kind: "manuel", title: "Terminée", dueAt: 2, completedAt: 3 },
    ] },
    { _id: "second", contactName: "Bruno", followUps: [
      { id: "late", kind: "manuel", title: "Rappeler", dueAt: 10 },
    ] },
  ] as never);

  expect(reminders).toEqual([
    { requestId: "second", requestName: "Bruno", followUpId: "late", title: "Rappeler", dueAt: 10 },
    { requestId: "first", requestName: "Alice", followUpId: "future", title: "Demander un retour", dueAt: 30 },
  ]);
});
