// @ts-expect-error Bun supplies this module when running `bun test`.
import { expect, test } from "bun:test";
import { calculateQuoteTotals } from "./quote-calculation";

const line = (quantity: number, unitPriceCents: number, vatRate: number) => ({
  quantity,
  unitPriceCents,
  vatRate,
});

function expectInvariants(result: ReturnType<typeof calculateQuoteTotals>) {
  expect(result.totalHtCents + result.totalVatCents).toBe(result.totalTtcCents);
  expect(result.vatBreakdown.reduce((total, group) => total + group.netHtCents, 0)).toBe(result.totalHtCents);
  expect(result.vatBreakdown.reduce((total, group) => total + group.vatCents, 0)).toBe(result.totalVatCents);
  expect(result.vatBreakdown.reduce((total, group) => total + group.discountCents, 0)).toBe(result.appliedDiscountCents);
}

test("aucune ligne", () => {
  const result = calculateQuoteTotals([], 100);
  expect(result).toMatchObject({ grossHtCents: 0, appliedDiscountCents: 0, totalHtCents: 0, totalVatCents: 0, totalTtcCents: 0 });
  expectInvariants(result);
});

test("une ligne à 10 % sans remise", () => {
  const result = calculateQuoteTotals([line(1, 1_000, 10)], 0);
  expect(result).toMatchObject({ grossHtCents: 1_000, totalHtCents: 1_000, totalVatCents: 100, totalTtcCents: 1_100 });
  expectInvariants(result);
});

test("une ligne à 20 % sans remise", () => {
  const result = calculateQuoteTotals([line(1, 1_000, 20)], 0);
  expect(result).toMatchObject({ totalHtCents: 1_000, totalVatCents: 200, totalTtcCents: 1_200 });
  expectInvariants(result);
});

test("plusieurs lignes avec le même taux", () => {
  const result = calculateQuoteTotals([line(1, 1_000, 10), line(2, 500, 10)], 0);
  expect(result.vatBreakdown).toEqual([{ vatRate: 10, grossHtCents: 2_000, discountCents: 0, netHtCents: 2_000, vatCents: 200, totalTtcCents: 2_200 }]);
  expectInvariants(result);
});

test("mélange de TVA à 10 % et 20 %", () => {
  const result = calculateQuoteTotals([line(1, 1_000, 10), line(1, 1_000, 20)], 0);
  expect(result.vatBreakdown.map((group) => group.vatCents)).toEqual([100, 200]);
  expect(result.totalTtcCents).toBe(2_300);
  expectInvariants(result);
});

test("remise sur une prestation uniquement à 10 %", () => {
  const result = calculateQuoteTotals([line(1, 1_000, 10)], 100);
  expect(result.vatBreakdown[0]).toMatchObject({ discountCents: 100, netHtCents: 900, vatCents: 90 });
  expect(result.totalTtcCents).toBe(990);
  expectInvariants(result);
});

test("remise globale répartie entre 10 % et 20 %", () => {
  const result = calculateQuoteTotals([line(1, 1_000, 10), line(1, 1_000, 20)], 101);
  expect(result.vatBreakdown.map((group) => group.discountCents)).toEqual([51, 50]);
  expect(result).toMatchObject({ totalHtCents: 1_899, totalVatCents: 285, totalTtcCents: 2_184 });
  expectInvariants(result);
});

test("les centimes restants suivent un ordre de taux stable", () => {
  const result = calculateQuoteTotals([line(1, 1, 5.5), line(1, 1, 10), line(1, 1, 20)], 2);
  expect(result.vatBreakdown.map((group) => group.discountCents)).toEqual([1, 1, 0]);
  expectInvariants(result);
});

test("une remise supérieure au total HT est bornée", () => {
  const result = calculateQuoteTotals([line(1, 500, 10)], 999);
  expect(result).toMatchObject({ appliedDiscountCents: 500, totalHtCents: 0, totalVatCents: 0, totalTtcCents: 0 });
  expectInvariants(result);
});

test("une remise négative est ignorée", () => {
  const result = calculateQuoteTotals([line(1, 500, 10)], -10);
  expect(result.appliedDiscountCents).toBe(0);
  expect(result.totalTtcCents).toBe(550);
  expectInvariants(result);
});

test("une quantité décimale est arrondie au centime", () => {
  const result = calculateQuoteTotals([line(1.5, 999, 10)], 0);
  expect(result).toMatchObject({ grossHtCents: 1_499, totalVatCents: 150, totalTtcCents: 1_649 });
  expectInvariants(result);
});

test("régression : alimentaire à 10 %, livraison à 20 % et remise globale", () => {
  const result = calculateQuoteTotals([line(1, 2_500, 10), line(1, 1_000, 20)], 333);
  expect(result.vatBreakdown).toEqual([
    { vatRate: 10, grossHtCents: 2_500, discountCents: 238, netHtCents: 2_262, vatCents: 226, totalTtcCents: 2_488 },
    { vatRate: 20, grossHtCents: 1_000, discountCents: 95, netHtCents: 905, vatCents: 181, totalTtcCents: 1_086 },
  ]);
  expect(result).toMatchObject({ totalHtCents: 3_167, totalVatCents: 407, totalTtcCents: 3_574 });
  expectInvariants(result);
});
