import type { LocalRequest } from "@/lib/local-crm";

export type IndividualCustomer = { id: string; type: "individual"; name: string; email?: string; phone?: string; address?: string; notes: string[]; createdAt: number; updatedAt: number };
export type OrganizationCustomer = { id: string; type: "organization"; name: string; address?: string; email?: string; phone?: string; vatNumber?: string; siret?: string; notes: string[]; createdAt: number; updatedAt: number };
export type OrganizationContact = { id: string; organizationId: string; name: string; role?: string; email?: string; phone?: string; primary: boolean; notes?: string; createdAt: number; updatedAt: number };
export type CustomerBuild = { individuals: IndividualCustomer[]; organizations: OrganizationCustomer[]; contacts: OrganizationContact[]; links: Record<string, { customerId?: string; organizationId?: string; contactId?: string }> };

export const normalizeCustomerValue = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const phone = (value?: string) => (value ?? "").replace(/\D/g, "");
const stableId = (prefix: string, value: string) => `${prefix}-${normalizeCustomerValue(value).replace(/\s+/g, "-") || "unknown"}`;

export function buildCustomersFromRequests(requests: readonly LocalRequest[]): CustomerBuild {
  const organizations: OrganizationCustomer[] = [], individuals: IndividualCustomer[] = [], contacts: OrganizationContact[] = [], links: CustomerBuild["links"] = {};
  for (const request of requests) {
    const now = request.createdAt;
    if (request.organizationName?.trim()) {
      const key = normalizeCustomerValue(request.organizationName);
      let organization = organizations.find((item) => normalizeCustomerValue(item.name) === key);
      if (!organization) { organization = { id: stableId("org", request.organizationName), type: "organization", name: request.organizationName, address: request.eventAddress, notes: [], createdAt: now, updatedAt: request.updatedAt }; organizations.push(organization); }
      const existing = contacts.find((item) => item.organizationId === organization!.id && ((request.contactEmail && item.email?.toLowerCase() === request.contactEmail.toLowerCase()) || (phone(request.contactPhone) && phone(item.phone) === phone(request.contactPhone)) || (!request.contactEmail && !request.contactPhone && normalizeCustomerValue(item.name) === normalizeCustomerValue(request.contactName))));
      const contact = existing ?? { id: stableId("contact", `${organization.id}-${request.contactEmail || request.contactPhone || request.contactName}`), organizationId: organization.id, name: request.contactName, email: request.contactEmail, phone: request.contactPhone, primary: !contacts.some((item) => item.organizationId === organization!.id), createdAt: now, updatedAt: request.updatedAt };
      if (!existing) contacts.push(contact); links[request._id] = { organizationId: organization.id, contactId: contact.id };
    } else {
      const existing = individuals.find((item) => (request.contactEmail && item.email?.toLowerCase() === request.contactEmail.toLowerCase()) || (phone(request.contactPhone) && phone(item.phone) === phone(request.contactPhone)) || (!request.contactEmail && !request.contactPhone && normalizeCustomerValue(item.name) === normalizeCustomerValue(request.contactName)));
      const customer = existing ?? { id: stableId("person", request.contactEmail || request.contactPhone || request.contactName), type: "individual" as const, name: request.contactName, email: request.contactEmail, phone: request.contactPhone, address: request.eventAddress, notes: [], createdAt: now, updatedAt: request.updatedAt };
      if (!existing) individuals.push(customer); links[request._id] = { customerId: customer.id };
    }
  }
  return { individuals, organizations, contacts, links };
}

export function acceptedCustomerMetrics(requests: readonly LocalRequest[]) { const accepted = requests.filter((request) => request.status === "accepte" && request.quoteAmountCents !== undefined); const revenue = accepted.reduce((sum, request) => sum + (request.quoteAmountCents ?? 0), 0); return { acceptedCount: accepted.length, acceptedRevenueCents: revenue, averageAcceptedCents: accepted.length ? Math.round(revenue / accepted.length) : 0 }; }
