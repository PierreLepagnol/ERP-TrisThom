export type CalculableQuoteLine = {
  quantity: number;
  unitPriceCents: number;
  vatRate: number;
};

export type QuoteVatBreakdown = {
  vatRate: number;
  grossHtCents: number;
  discountCents: number;
  netHtCents: number;
  vatCents: number;
  totalTtcCents: number;
};

export type CalculatedQuoteLine = {
  index: number;
  totalHtCents: number;
  vatCents: number;
  totalTtcCents: number;
};

export type QuoteCalculation = {
  grossHtCents: number;
  appliedDiscountCents: number;
  totalHtCents: number;
  vatBreakdown: QuoteVatBreakdown[];
  totalVatCents: number;
  totalTtcCents: number;
  lineTotals: CalculatedQuoteLine[];
};

type VatGroup = {
  vatRate: number;
  grossHtCents: number;
};

const cents = (value: number) => Math.round(Number.isFinite(value) ? value : 0);

/**
 * Calcule les montants d'un devis à partir de prix HT et d'une remise globale HT.
 * La remise est répartie au prorata des bases HT, puis les éventuels centimes
 * restants vont aux taux dont le reste est le plus élevé (ordre de taux croissant
 * pour départager deux restes identiques).
 */
export function calculateQuoteTotals(
  lines: readonly CalculableQuoteLine[],
  discountCents: number,
): QuoteCalculation {
  const lineBases = lines.map((line) =>
    Math.max(0, cents(line.quantity * line.unitPriceCents)),
  );
  const grossHtCents = lineBases.reduce((total, value) => total + value, 0);
  const appliedDiscountCents = Math.min(
    grossHtCents,
    Math.max(0, cents(discountCents)),
  );

  const groups = new Map<number, VatGroup>();
  lines.forEach((line, index) => {
    const vatRate = Number.isFinite(line.vatRate) ? line.vatRate : 0;
    const current = groups.get(vatRate);
    groups.set(vatRate, {
      vatRate,
      grossHtCents: (current?.grossHtCents ?? 0) + lineBases[index]!,
    });
  });
  const sortedGroups = [...groups.values()].sort((first, second) => first.vatRate - second.vatRate);
  const groupDiscounts = allocateDiscount(sortedGroups, grossHtCents, appliedDiscountCents);

  const vatBreakdown = sortedGroups.map((group) => {
    const discount = groupDiscounts.get(group.vatRate) ?? 0;
    const netHtCents = group.grossHtCents - discount;
    const vatCents = cents(netHtCents * (group.vatRate / 100));
    return {
      vatRate: group.vatRate,
      grossHtCents: group.grossHtCents,
      discountCents: discount,
      netHtCents,
      vatCents,
      totalTtcCents: netHtCents + vatCents,
    };
  });
  const totalHtCents = vatBreakdown.reduce((total, group) => total + group.netHtCents, 0);
  const totalVatCents = vatBreakdown.reduce((total, group) => total + group.vatCents, 0);

  return {
    grossHtCents,
    appliedDiscountCents,
    totalHtCents,
    vatBreakdown,
    totalVatCents,
    totalTtcCents: totalHtCents + totalVatCents,
    lineTotals: lines.map((line, index) => {
      const totalHtCents = lineBases[index]!;
      const vatCents = cents(totalHtCents * (line.vatRate / 100));
      return { index, totalHtCents, vatCents, totalTtcCents: totalHtCents + vatCents };
    }),
  };
}

function allocateDiscount(
  groups: readonly VatGroup[],
  grossHtCents: number,
  discountCents: number,
) {
  const allocations = new Map<number, number>();
  if (!grossHtCents || !discountCents) {
    groups.forEach((group) => allocations.set(group.vatRate, 0));
    return allocations;
  }

  const provisional = groups.map((group) => {
    const exact = (discountCents * group.grossHtCents) / grossHtCents;
    const base = Math.floor(exact);
    return { vatRate: group.vatRate, base, remainder: exact - base };
  });
  let remaining = discountCents - provisional.reduce((total, item) => total + item.base, 0);
  provisional
    .sort((first, second) => second.remainder - first.remainder || first.vatRate - second.vatRate)
    .forEach((item) => {
      const extra = remaining > 0 ? 1 : 0;
      allocations.set(item.vatRate, item.base + extra);
      remaining -= extra;
    });
  return allocations;
}
