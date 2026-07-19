// @ts-expect-error Bun supplies this module when running `bun test`.
import { expect, test } from "bun:test";
import { acceptedCustomerMetrics, buildCustomersFromRequests } from "./customers";
const req = (id: string, changes = {}) => ({ _id: id, contactName: "Camille Martin", contactEmail: "camille@example.test", contactPhone: "0600000000", status: "qualifie", source: "manuel", missingInformation: [], followUps: [], notes: [], history: [], createdAt: 1, updatedAt: 1, ...changes } as any);
test("groups an organization and preserves different contacts", () => { const built = buildCustomersFromRequests([req("1", { organizationName: "Café Étoile" }), req("2", { organizationName: "Cafe Etoile", contactName: "Noah", contactEmail: "noah@example.test", contactPhone: "0611111111" })]); expect(built.organizations).toHaveLength(1); expect(built.contacts).toHaveLength(2); });
test("only counts accepted confirmed amounts", () => expect(acceptedCustomerMetrics([req("1", { status: "accepte", quoteAmountCents: 12000 }), req("2", { status: "devis_envoye", quoteAmountCents: 9000 })])).toEqual({ acceptedCount: 1, acceptedRevenueCents: 12000, averageAcceptedCents: 12000 }));
