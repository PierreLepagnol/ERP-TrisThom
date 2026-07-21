const months: Record<string, number> = {
  janvier: 0, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11,
};

function normalise(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function titleCase(text: string) {
  return text.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, prefix: string, letter: string) =>
    `${prefix}${letter.toUpperCase()}`,
  );
}

function clientText(text: string) {
  const forwardedAt = text.search(/-{3,}\s*forwarded message/i);
  return forwardedAt >= 0 ? text.slice(forwardedAt) : text;
}

function parseDate(text: string, receivedAt: Date) {
  const normalized = normalise(text);
  const match = normalized.match(/\b(\d{1,2})\s+et\s+\d{1,2}\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?\b/)
    ?? normalized.match(/\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?\b/);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = months[match[2]!];
  let year = match[3] ? Number(match[3]) : receivedAt.getUTCFullYear();
  if (!match[3] && month < receivedAt.getUTCMonth() - 1) year += 1;
  if (day < 1 || day > 31 || month === undefined || year < 2020 || year > 2100) return undefined;
  const result = Date.UTC(year, month, day);
  const date = new Date(result);
  return date.getUTCMonth() === month && date.getUTCDate() === day ? result : undefined;
}

function parseAddress(text: string) {
  const normalized = normalise(text).replace(/\s+/g, " ");
  const inline = normalized.match(/\b(?:a|à)\s+([\p{L}' -]+?\s+\d{5})(?=\s*[,.;]|\s+\d{1,4}\s*(?:personnes|convives|invites)|$)/iu);
  if (inline) {
    const address = inline[1]!.trim();
    if (/^deuil la barre \d{5}$/i.test(address)) return `Deuil-la-Barre ${address.slice(-5)}`;
    return titleCase(address);
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const postcodeAt = lines.findIndex((line) => /^\d{5}\s+[\p{L}' -]+$/iu.test(line));
  if (postcodeAt <= 0) return undefined;
  const street = lines[postcodeAt - 1]!;
  if (!/\d+\s+/.test(street)) return undefined;
  return `${titleCase(street)} ${titleCase(lines[postcodeAt]! )}`;
}

function parseForwardedSender(text: string) {
  const match = text.match(/^From:\s*([^<\n]+)\s*<([^>]+)>/im);
  if (!match) return {};
  return { contactName: titleCase(match[1]!.trim()), contactEmail: match[2]!.trim().toLowerCase() };
}

function parseSignature(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const greetingAt = lines.findIndex((line) => /^(belle journee|cordialement|bien cordialement)/.test(normalise(line)));
  if (greetingAt >= 0) {
    const signature = lines.slice(greetingAt + 1).find((line) => /^[\p{L}' -]{4,}$/u.test(line));
    if (signature) return titleCase(signature);
  }
  const candidate = lines[lines.length - 1];
  if (!candidate || !/^[\p{L}' -]{4,}$/u.test(candidate)) return undefined;
  const wordCount = candidate.split(/\s+/).length;
  return wordCount >= 2 && wordCount <= 4 ? titleCase(candidate) : undefined;
}

function parsePhone(text: string) {
  const match = text.match(/(?:\+33\s?[1-9]|0[1-9])(?:[ .-]?\d{2}){4}\b/);
  return match?.[0]?.replace(/[.-]/g, " ");
}

function parseEmail(text: string) {
  const match = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match?.[0]?.toLowerCase();
}

function parseBudgetPerPerson(text: string) {
  const normalized = normalise(text).replace(/\s+/g, " ");
  const match = normalized.match(/\b(\d{1,4}(?:[,.]\d{1,2})?)\s*€?\s*(?:euros?)?\s*(?:par|\/)\s*personne\b/);
  return match ? Math.round(Number(match[1]!.replace(",", ".")) * 100) : undefined;
}

function parse1001Name(text: string) {
  if (!/1001\s*(traiteurs|services)/i.test(text)) return undefined;
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const greetingAt = lines.findIndex((line) => /^(cordialement|bien cordialement)/.test(normalise(line)));
  if (greetingAt < 0) return undefined;
  return lines.slice(0, greetingAt).reverse().find((line) =>
    /^[\p{L}' -]{4,}$/u.test(line) && line.trim().split(/\s+/).length >= 2,
  );
}

function parseOrganization(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).find((line) =>
    /\b(france|academy|groupe|company|entreprise|sarl|sas)\b/i.test(line) && !/coordinatrice|responsable/i.test(line),
  );
}

export type ParsedEmailRequest = {
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  organizationName?: string;
  eventDate?: number;
  eventAddress?: string;
  guestCount?: number;
  eventType?: string;
  specialNeeds?: string;
  budgetPerPersonCents?: number;
};

export function isCateringRequest(text: string) {
  const normalized = normalise(clientText(text));
  return [
    "demande de devis", "demande de prix", "devis traiteur", "prestation traiteur",
    "cocktail", "buffet", "brunch", "plateau", "proposition", "mini sandwich",
  ].some((keyword) => normalized.includes(keyword));
}

export function triageInboxMessage(text: string) {
  if (!text.trim()) return "ignore" as const;
  return isCateringRequest(text) ? "request" as const : "review" as const;
}

export function parseEmailRequest(text: string, receivedAt = new Date()): ParsedEmailRequest {
  const client = clientText(text);
  const normalized = normalise(client);
  const guestMatch = normalized.match(/\b(\d{1,4})\s*(?:personnes|convives|invites)\b/);
  const cold = /\b(?:froid|froide|froids|froides)\b/.test(normalized);
  const eventType = /\bmariage\b/.test(normalized) ? "Mariage"
    : /\banniversaire\b/.test(normalized) ? "Anniversaire"
    : /\bcocktail\b/.test(normalized) ? `Cocktail${cold ? " froid" : ""}`
    : /\bbuffet\b/.test(normalized) ? `Buffet${cold ? " froid" : ""}`
    : /\bbrunch\b/.test(normalized) ? "Brunch"
    : /\bplateaux?\b/.test(normalized) ? `Plateaux-repas${cold ? " froids" : ""}`
    : undefined;
  const forwarded = parseForwardedSender(client);
  return {
    contactName: parse1001Name(client) ?? parseSignature(client) ?? forwarded.contactName,
    contactEmail: forwarded.contactEmail ?? parseEmail(client),
    contactPhone: parsePhone(client),
    organizationName: parseOrganization(client),
    eventDate: parseDate(client, receivedAt),
    eventAddress: parseAddress(client),
    guestCount: guestMatch ? Number(guestMatch[1]) : undefined,
    eventType,
    budgetPerPersonCents: parseBudgetPerPerson(client),
    specialNeeds: cold ? "Proposition froide souhaitée" : undefined,
  };
}
