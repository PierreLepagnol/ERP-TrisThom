import type { LocalQuote } from "@/lib/local-crm";

/** Keeps internal catalogue metadata in the browser while sending only quote fields accepted by Convex. */
export function toConvexQuote(quote: LocalQuote) {
  return {
    ...quote,
    lines: quote.lines.map(({ id, label, quantity, unitPriceCents, vatRate, details }) => ({
      id,
      label,
      quantity,
      unitPriceCents,
      vatRate,
      details,
    })),
  };
}
