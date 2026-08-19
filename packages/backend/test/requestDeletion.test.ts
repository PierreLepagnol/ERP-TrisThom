import { describe, expect, test } from "bun:test";

import { canCreateRequestForSource, isVisibleRequest } from "../convex/requestDeletion";

describe("request deletion", () => {
  test("hides a soft-deleted request from normal views", () => {
    expect(isVisibleRequest({})).toBe(true);
    expect(isVisibleRequest({ deletedAt: 1_723_456_789_000 })).toBe(false);
  });

  test("keeps a known source identifier reserved after deletion", () => {
    expect(canCreateRequestForSource(null)).toBe(true);
    expect(canCreateRequestForSource({ deletedAt: 1_723_456_789_000 })).toBe(false);
  });
});
