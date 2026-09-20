// @ts-expect-error Bun supplies this module when running the test command.
import { expect, test } from "bun:test";
import { getModelContext } from "./bouillon-site-tools";

test("does not expose tools or crash without WebMCP", () => {
  expect(getModelContext()).toBeUndefined();
});
