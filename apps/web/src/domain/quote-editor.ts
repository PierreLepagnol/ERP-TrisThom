import type { LocalQuoteLine } from "@/lib/local-crm";

export function duplicateQuoteLine(line: LocalQuoteLine, id: string): LocalQuoteLine {
  return { ...line, id, details: line.details ? [...line.details] : undefined, compositionItems: line.compositionItems?.map((item) => ({ ...item })), productionBaseIds: line.productionBaseIds ? [...line.productionBaseIds] : undefined };
}

export function moveQuoteLine(lines: readonly LocalQuoteLine[], index: number, direction: -1 | 1): LocalQuoteLine[] {
  const target = index + direction;
  if (target < 0 || target >= lines.length) return lines.map((line) => ({ ...line }));
  const next = lines.map((line) => ({ ...line }));
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function quickOptionCatalogId(kind: "delivery" | "tableware" | "setup" | "staff", catalog: ReadonlyArray<{ id: string; name: string; active: boolean }>) {
  const words = { delivery: /livraison/i, tableware: /vaisselle/i, setup: /mise en place|installation/i, staff: /personnel|service/i }[kind];
  return catalog.find((item) => item.active && words.test(item.name))?.id;
}
