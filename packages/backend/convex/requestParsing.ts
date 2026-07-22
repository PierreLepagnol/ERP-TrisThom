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
  const numeric = normalized.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
  if (numeric) return Date.UTC(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]));
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
  const match = text.match(/(?:\+33\s?[67]|0[67])(?:[ .-]?\d{2}){4}\b/);
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
  const signature = greetingAt >= 0 ? lines.slice(greetingAt + 1).find((line) =>
    /^[\p{L}' -]{4,}$/u.test(line) && line.trim().split(/\s+/).length >= 2,
  ) : undefined;
  if (signature) return titleCase(signature);
  const fallback = fieldValue(text, "Nom\\s*(?:&|et)\\s*pr[ée]nom\\s*(?:internaute)?");
  return fallback ? titleCase(fallback) : undefined;
}

function without1001Footer(text: string) {
  const lines = text.split(/\r?\n/);
  const footerAt = lines.findIndex((line) => /1001\s*traiteurs\s*[–-]\s*rond-point|1001services\s+est|r\s*c\s*s\s*de\s*creteil|siret|ape\s*6312|tva\s*intra|sas\s+au\s+capital/i.test(normalise(line)));
  return (footerAt >= 0 ? lines.slice(0, footerAt) : lines).join("\n");
}

function fieldValue(text: string, label: string) {
  const match = text.match(new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i"));
  const value = match?.[1]?.trim();
  return value && !/^n\.?c\.?$/i.test(value) ? value : undefined;
}

function parseTime(text: string) {
  const value = fieldValue(text, "(?:horaire|heure)\\s*(?:de\\s*)?(?:d[ée]but|arriv[ée])")
    ?? text.match(/(?:à partir de|debut)\s*(\d{1,2}\s*(?::|h)\s*\d{2})/i)?.[1];
  const match = value?.match(/\b(\d{1,2})\s*(?::|h)\s*(\d{2})\b/);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 ? `${match[1].padStart(2, "0")}:${match[2]}` : undefined;
}

function parse1001Preferences(text: string) {
  const selected = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /plateaux?\s*(?:repas|\/|box)|afro[ -]?carib|gastronomique/i.test(normalise(line)));
  return selected.length ? selected.join(" · ") : undefined;
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
  eventStartTime?: string;
  budgetPerPersonCents?: number;
  budgetCents?: number;
  message?: string;
};

export type PositionedPdfFragment = { x: number; y: number; text: string };
export type PositionedPdfRow = { y: number; fragments: PositionedPdfFragment[]; text: string };
export type PositionedPdfDocument = { rows: PositionedPdfRow[]; rawText: string };

const formLabels = [
  "Date de la demande", "Date de l'événement", "Pays", "Région", "Département", "Ville", "Budget",
  "Nombre de participants", "Nom & prénom internaute", "Adresse email", "Téléphone fixe", "Téléphone mobile",
] as const;

function rowLabelX(row: PositionedPdfRow, label: string) {
  const exact = normalise(label);
  return row.fragments.find((fragment) => normalise(fragment.text).includes(exact))?.x
    ?? row.fragments.find((fragment) => normalise(fragment.text).includes(exact.split(/\s+/)[0]!))?.x;
}

function formValue(document: PositionedPdfDocument, label: string) {
  const header = document.rows.find((row) => normalise(row.text).includes(normalise(label)));
  const x = header && rowLabelX(header, label);
  if (!header || x === undefined) return undefined;
  const candidates = document.rows
    .filter((row) => row.y > header.y && row.y - header.y < 5)
    .flatMap((row) => row.fragments.map((fragment) => ({ ...fragment, row })))
    .filter((fragment) => Math.abs(fragment.x - x) < 3 && !formLabels.some((known) => normalise(fragment.text).includes(normalise(known))));
  const closest = candidates.sort((left, right) => (left.y - header.y) - (right.y - header.y) || Math.abs(left.x - x) - Math.abs(right.x - x))[0];
  return closest?.text.trim() || undefined;
}

function formMessage(document: PositionedPdfDocument) {
  const start = document.rows.find((row) => /^message$/i.test(row.text.trim()));
  if (!start) return undefined;
  const body = document.rows
    .filter((row) => row.y > start.y && !is1001FooterLine(row.text))
    .map((row) => row.text.trim())
    .filter((row) => row && !formLabels.some((label) => normalise(row).includes(normalise(label))));
  return body.join("\n").trim() || undefined;
}

function cleanPdfWords(value: string) {
  return value.replace(/-\s*\n\s*/g, "-").replace(/\s+/g, " ").trim();
}

/** Parses the positioned table emitted by the current 1001Traiteur/1001Salles PDF template. */
export function parse1001TraiteurForm(document: PositionedPdfDocument, filename = "", receivedAt = new Date()): ParsedEmailRequest {
  const message = formMessage(document);
  const messageLines = message?.split(/\n/).map(cleanPdfWords) ?? [];
  const cleanMessage = message ? cleanPdfWords(message) : undefined;
  const greeting = messageLines.findIndex((line) => /^(cordialement|bien cordialement)/i.test(normalise(line)));
  const signature = greeting >= 0 ? messageLines.slice(greeting + 1).find((line) => /^[\p{L}' -]{4,}$/u.test(line) && line.split(/\s+/).length >= 2) : undefined;
  const tableName = formValue(document, "Nom & prénom internaute");
  const eventText = cleanMessage ?? "";
  const filenameType = /anniversaire/i.test(filename) ? "Anniversaire" : /mariage/i.test(filename) ? "Mariage" : undefined;
  const budgetValue = formValue(document, "Budget");
  const amount = budgetValue?.match(/\d{1,5}(?:[,.]\d{1,2})?/)?.[0];
  const budget = amount ? Math.round(Number(amount.replace(",", ".")) * 100) : undefined;
  const perPerson = Boolean(/par\s+personne/i.test(eventText)) || Boolean(budget && budget <= 20000);
  const mobile = formValue(document, "Téléphone mobile");
  const fixed = formValue(document, "Téléphone fixe");
  const phone = mobile && !/^n\.?c\.?$/i.test(mobile) ? parsePhone(mobile) : fixed && !/^n\.?c\.?$/i.test(fixed) ? parsePhone(fixed) : undefined;
  const email = formValue(document, "Adresse email");
  const needs = [
    cleanMessage?.match(/Côté (?:formule|cuisine).*?(?=Nos préférences culinaires|Cordialement|$)/i)?.[0],
    cleanMessage?.match(/Nos préférences culinaires.*?(?=Cordialement|$)/i)?.[0],
    cleanMessage?.match(/Besoins? particuliers.*?(?=Cordialement|$)/i)?.[0],
  ].filter(Boolean).map((value) => value!.trim()).join(" · ") || undefined;
  return {
    contactName: signature ? titleCase(signature) : tableName && !/^n\.?c\.?$/i.test(tableName) ? titleCase(tableName) : undefined,
    contactEmail: email && !/@(?:1001traiteurs|1001salles|1001services)/i.test(email) ? parseEmail(email) : undefined,
    contactPhone: phone,
    organizationName: undefined,
    eventDate: (() => { const value = formValue(document, "Date de l'événement"); return value ? parseDate(value, receivedAt) : undefined; })(),
    eventAddress: formValue(document, "Ville"),
    guestCount: (() => { const value = formValue(document, "Nombre de participants")?.match(/\d{1,4}/)?.[0]; return value ? Number(value) : undefined; })(),
    eventType: /mariage/i.test(eventText) ? "Mariage" : /anniversaire/i.test(eventText) ? "Anniversaire" : /événement professionnel/i.test(eventText) ? "Événement professionnel" : filenameType,
    eventStartTime: parseTime(eventText),
    budgetPerPersonCents: perPerson ? budget : undefined,
    budgetCents: perPerson ? undefined : budget,
    specialNeeds: needs,
    message: cleanMessage,
  };
}

function is1001FooterLine(line: string) {
  return /1001\s*traiteurs\s*[–-]\s*rond-point|1001services|1001salles|1001traiteurs\.com|sas\s+au\s+capital|r\s*c\s*s|siret|ape\s*6312|tva\s*intra|maurice\s+grandcoing|94200\s+ivry|page\s*\(\d+\)\s*break/i.test(normalise(line));
}

function pdfLabelValue(lines: string[], label: string) {
  const wanted = normalise(label);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const at = normalise(line).indexOf(wanted);
    if (at < 0) continue;
    const remainder = line.slice(at + label.length).replace(/^\s*[:–-]?\s*/, "").trim();
    if (remainder) return remainder;
    return lines.slice(index + 1, index + 4).find((candidate) => candidate && !/^(date|ville|budget|nombre|nom|adresse|telephone|téléphone|message)\b/i.test(candidate));
  }
  return undefined;
}

/** Dedicated parser for 1001Traiteur PDFs. The footer is discarded line by
 * line because pdf2json can return it before the visible client section. */
export function parse1001TraiteurPdf(text: string, receivedAt = new Date()): ParsedEmailRequest {
  // Some PDFs lose their layout entirely: restore just the known field
  // boundaries before filtering. This also isolates a footer placed first.
  const structured = text
    .replace(/(?=\b(?:MESSAGE|Date de l['’]événement|Ville|Budget|Nombre de participants|Nom\s*&\s*prénom internaute|Adresse email|Téléphone mobile)\b)/gi, "\n")
    .replace(/\bMESSAGE\b/gi, "\nMESSAGE\n")
    .replace(/\b(Cordialement|Bien cordialement)\b/gi, "\n$1\n")
    .replace(/(?=\b(?:1001\s*Salles|1001Services|1001\s*Traiteurs|SAS\s+au\s+capital|RCS\s+de\s+Créteil)\b)/gi, "\n");
  const lines = structured.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !is1001FooterLine(line));
  const messageAt = lines.findIndex((line) => normalise(line) === "message");
  const greetingAt = lines.findIndex((line, index) => index > messageAt && /^(cordialement|bien cordialement)/.test(normalise(line)));
  const message = messageAt >= 0 ? lines.slice(messageAt + 1, greetingAt >= 0 ? greetingAt + 2 : undefined).join("\n").trim() || undefined : undefined;
  const signature = greetingAt >= 0 ? lines.slice(greetingAt + 1).find((line) => /^[\p{L}' -]{4,}$/u.test(line) && line.split(/\s+/).length >= 2) : undefined;
  const name = signature ?? pdfLabelValue(lines, "Nom & prénom internaute");
  const emailCandidate = pdfLabelValue(lines, "Adresse email");
  const phoneCandidate = pdfLabelValue(lines, "Téléphone mobile");
  const date = pdfLabelValue(lines, "Date de l'événement") ?? pdfLabelValue(lines, "Date de l’événement");
  const participants = pdfLabelValue(lines, "Nombre de participants");
  const budget = pdfLabelValue(lines, "Budget");
  const eventText = message ?? lines.join("\n");
  const preferences = [eventText.match(/Côté formule[^\n]*/i)?.[0], eventText.match(/Nos préférences culinaires[^\n]*/i)?.[0]].filter(Boolean).join(" · ") || undefined;
  const number = (value?: string) => value?.match(/\d{1,4}(?:[,.]\d{1,2})?/)?.[0];
  return {
    contactName: name ? titleCase(name) : undefined,
    contactEmail: emailCandidate && !/@(?:1001traiteurs|1001services|1001salles)/i.test(emailCandidate) ? parseEmail(emailCandidate) : undefined,
    contactPhone: phoneCandidate && !/^n\.?c\.?$/i.test(phoneCandidate) ? parsePhone(phoneCandidate) : undefined,
    organizationName: undefined,
    eventDate: date ? parseDate(date, receivedAt) : undefined,
    eventAddress: pdfLabelValue(lines, "Ville"),
    guestCount: number(participants) ? Number(number(participants)) : undefined,
    budgetPerPersonCents: number(budget) ? Math.round(Number(number(budget)!.replace(",", ".")) * 100) : undefined,
    eventType: /mariage/i.test(eventText) ? "Mariage" : /anniversaire/i.test(eventText) ? "Anniversaire" : /événement professionnel/i.test(eventText) ? "Événement professionnel" : undefined,
    eventStartTime: parseTime(eventText),
    specialNeeds: preferences,
    message,
  };
}

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
  const rawClient = clientText(text);
  const is1001 = /1001\s*(traiteurs|services)/i.test(rawClient);
  const client = is1001 ? without1001Footer(rawClient) : rawClient;
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
  const mobile = fieldValue(client, "T[ée]l[ée]phone\\s+mobile");
  const labelledEmail = fieldValue(client, "(?:e-?mail|email)");
  const city = fieldValue(client, "Ville") ?? fieldValue(client, "Lieu");
  const preferences = is1001 ? parse1001Preferences(client) : undefined;
  return {
    contactName: parse1001Name(client) ?? parseSignature(client) ?? forwarded.contactName,
    contactEmail: labelledEmail ?? forwarded.contactEmail ?? parseEmail(client),
    contactPhone: parsePhone(mobile ?? client),
    organizationName: is1001 ? undefined : parseOrganization(client),
    eventDate: parseDate(client, receivedAt),
    eventAddress: city ?? parseAddress(client),
    guestCount: guestMatch ? Number(guestMatch[1]) : undefined,
    eventType,
    budgetPerPersonCents: parseBudgetPerPerson(client),
    specialNeeds: preferences ?? (cold ? "Proposition froide souhaitée" : undefined),
    eventStartTime: parseTime(client),
  };
}
