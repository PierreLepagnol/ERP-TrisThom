export function cleanInboxBody(value?: string) {
  return (value ?? "").replace(/<style[\s\S]*?<\/style>|@import[^;]+;|(?:https?:\/\/|www\.)\S+/gi, "").replace(/(?:^|\n)\s*(?:body|table|img|\.ExternalClass|a)\s*\{[^}]*\}\s*/gim, "").replace(/(?:se désinscrire|unsubscribe|mentions légales)[\s\S]*/i, "").replace(/\n\s*\n\s*\n+/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}
export type Parsed1001 = { name?: string; email?: string; phone?: string; eventType?: string; eventDate?: string; venue?: string; guests?: number; budgetPerPerson?: number; cateringMode?: string; options?: string[]; customerMessage?: string; startTime?: string; formula?: string; cuisine?: string; dietary?: string; services?: string };
export function parse1001Request(sender?: string, subject?: string, body?: string): Parsed1001 | undefined {
  const text = body ?? "";
  const structural = /A propos de la demande/i.test(text) && /Nombre d'invités/i.test(text) && /A propos de l'internaute/i.test(text) && /Adresse email/i.test(text);
  if (!((/@1001traiteurs\.com$/i.test(sender ?? "") && /nouvelle demande/i.test(subject ?? "")) || (/1001\s*traiteurs.*nouvelle demande/i.test(subject ?? "") && structural))) return;
  const get = (label: string) => text.match(new RegExp("(?:^|\\n)" + label + "\\s*:\\s*([^\\n]+)", "i"))?.[1]?.trim();
  const customerMessage = text.match(/Son message\s*:\s*([\s\S]*?)(?=A propos de l'internaute\s*:|$)/i)?.[1]?.trim() || undefined;
  const pick = (label: string) => customerMessage?.match(new RegExp(label + "[^:\\n]*:\\s*([^\\n.]+)", "i"))?.[1]?.trim();
  const time = customerMessage?.match(/à partir de\s*(\d{1,2})h(?:\s*(\d{2}))?/i);
  return {
    name: [get("Prénom"), get("Nom")].filter(Boolean).join(" ") || undefined,
    email: get("Adresse email"), phone: get("Téléphone mobile") || get("Téléphone"), eventType: get("Type d'événement"),
    eventDate: get("Date")?.match(/\d{2}\/\d{2}\/\d{4}/)?.[0], venue: get("Ville"),
    guests: Number(get("Nombre d'invités")) || undefined,
    budgetPerPerson: Number(text.match(/budget de\s*(\d+(?:[,.]\d+)?)\s*€?\s*par personne/i)?.[1]?.replace(",", ".")) || undefined,
    cateringMode: get("Mode de restauration") || pick("Côté formule"), options: get("Option\\(s\\) de service")?.split(/\s*-\s*|;/).filter(Boolean),
    customerMessage, startTime: time ? time[1].padStart(2, "0") + ":" + (time[2] ?? "00") : undefined,
    formula: pick("Côté formule"), cuisine: pick("Côté cuisine"), dietary: pick("Côté préparation ou régime"), services: pick("En complément"),
  };
}
