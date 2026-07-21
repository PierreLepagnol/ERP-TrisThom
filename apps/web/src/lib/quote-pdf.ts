import type { LocalQuote, LocalRequest } from "@/lib/local-crm";

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

function pdfText(value: string) {
  return value
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/€/g, "EUR")
    .replace(/[^\x20-\xFF]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(value: string, width = 92) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width && line) {
      lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines;
}

export function generateQuotePdf(request: LocalRequest, quote: LocalQuote) {
  const totals = quote.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceCents), 0) - quote.discountCents;
  const vat = quote.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPriceCents * line.vatRate / 100), 0);
  const lines = [
    "BOUILLON COMPTOIR — DEVIS",
    `Devis ${quote.number ?? "sans numéro"}`,
    "",
    `Client : ${request.contactName}${request.organizationName ? ` — ${request.organizationName}` : ""}`,
    `Événement : ${request.eventType ?? "Prestation"} — ${request.eventDate ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(request.eventDate) : "Date à confirmer"}`,
    `Lieu : ${request.eventAddress ?? request.venue ?? "À confirmer"} — ${request.guestCount ?? "—"} personnes`,
    "",
    "PRESTATIONS",
    ...quote.lines.flatMap((line) => wrap(`${line.label} — ${line.quantity} × ${euro.format(line.unitPriceCents / 100)} HT — TVA ${line.vatRate}%`).concat(line.details?.map((detail) => `  • ${detail}`) ?? [])),
    "",
    `Total HT : ${euro.format(totals / 100)}`,
    `TVA : ${euro.format(vat / 100)}`,
    `Total TTC : ${euro.format((totals + vat) / 100)}`,
    "",
    ...wrap(`Conditions : ${quote.conditions || "Devis valable 7 jours. Acompte de 50 % à la confirmation. Prestation sous réserve de disponibilité."}`),
    "",
    "Bouillon Comptoir — contact@bouilloncomptoir.fr",
  ];
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 46) pages.push(lines.slice(index, index + 46));
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const pageRefs: number[] = [];
  for (const page of pages) {
    const pageObject = objects.length + 1;
    const contentObject = pageObject + 1;
    pageRefs.push(pageObject);
    const content = ["BT", "/F1 11 Tf", "50 790 Td", "15 TL", ...page.map((line, index) => `${index === 0 ? "" : "T*\n"}(${pdfText(line)}) Tj`), "ET"].join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return btoa(unescape(encodeURIComponent(pdf)));
}
