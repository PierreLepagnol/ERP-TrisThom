"use node";

import PDFParser from "pdf2json";
import { v } from "convex/values";

import { authComponent } from "./auth";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import { parseEmailRequest } from "./requestParsing";

const MAX_PDF_BYTES = 5 * 1024 * 1024;

async function extractText(content: Buffer) {
  const parser = new PDFParser(null, true);
  return await new Promise<string>((resolve, reject) => {
    parser.once("pdfParser_dataReady", () => {
      const text = parser.getRawTextContent().replace(/\s+/g, " ").trim().slice(0, 20_000);
      parser.destroy();
      resolve(text);
    });
    parser.once("pdfParser_dataError", () => {
      parser.destroy();
      reject(new Error("Le PDF ne peut pas être lu."));
    });
    parser.parseBuffer(content);
  });
}

export const import1001Pdf = action({
  args: { filename: v.string(), contentBase64: v.string() },
  handler: async (ctx, args) => {
    if (!await authComponent.safeGetAuthUser(ctx)) throw new Error("Vous devez être connecté.");
    if (!args.filename.toLowerCase().endsWith(".pdf")) throw new Error("Veuillez choisir un fichier PDF.");
    const content = Buffer.from(args.contentBase64, "base64");
    if (!content.length || content.length > MAX_PDF_BYTES) throw new Error("Le PDF doit faire moins de 5 Mo.");
    const text = await extractText(content);
    if (!text) throw new Error("Aucun texte n’a été trouvé dans ce PDF.");
    const parsed = parseEmailRequest(text, new Date());
    const requestId = await ctx.runMutation(api.crm.createRequest, {
      source: "1001traiteur",
      contactName: parsed.contactName ?? "Contact à identifier",
      contactEmail: parsed.contactEmail,
      contactPhone: parsed.contactPhone,
      organizationName: parsed.organizationName,
      eventType: parsed.eventType,
      eventDate: parsed.eventDate,
      eventAddress: parsed.eventAddress,
      guestCount: parsed.guestCount,
      budgetPerPersonCents: parsed.budgetPerPersonCents,
      specialNeeds: parsed.specialNeeds,
      message: `Importé depuis le PDF ${args.filename}\n\n${text}`.slice(0, 20_000),
    });
    return { requestId, parsed };
  },
});
