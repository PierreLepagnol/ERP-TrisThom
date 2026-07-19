// @ts-expect-error Bun supplies this module when running `bun test`.
import { describe, expect, it } from "bun:test";
import { duplicateQuoteLine, moveQuoteLine, quickOptionCatalogId } from "./quote-editor";

const line: any = { id: "a", label: "Buffet", quantity: 2, unitPriceCents: 1000, vatRate: 10, compositionItems: [{ name: "Entrée", quantity: 2 }], productionBaseIds: ["base"] };
describe("quote editor helpers", () => {
  it("duplicates a line with independent structured content", () => { const copy = duplicateQuoteLine(line, "b"); copy.compositionItems![0]!.name = "Modifié"; expect(copy.id).toBe("b"); expect(line.compositionItems[0].name).toBe("Entrée"); });
  it("moves lines up and down without changing them", () => { expect(moveQuoteLine([line, { ...line, id: "b" }], 1, -1).map((item) => item.id)).toEqual(["b", "a"]); expect(moveQuoteLine([line, { ...line, id: "b" }], 0, 1).map((item) => item.id)).toEqual(["b", "a"]); });
  it("finds only active quick options", () => { expect(quickOptionCatalogId("delivery", [{ id: "l", name: "Livraison", active: true }, { id: "p", name: "Personnel", active: false }])).toBe("l"); expect(quickOptionCatalogId("staff", [{ id: "p", name: "Personnel", active: false }])).toBeUndefined(); });
});
