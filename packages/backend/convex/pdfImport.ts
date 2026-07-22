"use node";

import PDFParser from "pdf2json";
import { v } from "convex/values";

import { authComponent } from "./auth";
import { action } from "./_generated/server";
import { parse1001TraiteurForm, type PositionedPdfDocument, type PositionedPdfFragment } from "./requestParsing";

const MAX_PDF_BYTES = 5 * 1024 * 1024;

type Pdf2JsonText = { x: number; y: number; R: Array<{ T: string }> };
type Pdf2JsonData = { Pages?: Array<{ Texts?: Pdf2JsonText[] }> };

function decodeText(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function positionedDocument(data: Pdf2JsonData, rawText: string): PositionedPdfDocument {
  const fragments: PositionedPdfFragment[] = (data.Pages ?? []).flatMap((page, pageIndex) =>
    (page.Texts ?? []).map((item) => ({ x: item.x, y: item.y + pageIndex * 1000, text: item.R.map((run) => decodeText(run.T)).join("") })).filter((item) => item.text.trim()),
  );
  const groups: PositionedPdfFragment[][] = [];
  for (const fragment of fragments.sort((left, right) => left.y - right.y || left.x - right.x)) {
    const group = groups.find((candidate) => Math.abs(candidate[0]!.y - fragment.y) <= 0.15);
    (group ?? groups[groups.push([]) - 1]!).push(fragment);
  }
  return { rawText, rows: groups.map((fragments) => ({ y: fragments[0]!.y, fragments: fragments.sort((left, right) => left.x - right.x), text: fragments.sort((left, right) => left.x - right.x).map((fragment) => fragment.text).join(" ") })) };
}

async function extractText(content: Buffer) {
  const parser = new PDFParser(null, true);
  return await new Promise<{ text: string; document: PositionedPdfDocument }>((resolve, reject) => {
    parser.once("pdfParser_dataReady", (data: Pdf2JsonData) => {
      const text = parser.getRawTextContent().replace(/[^\S\r\n]+/g, " ").replace(/\r\n?/g, "\n").trim().slice(0, 20_000);
      const document = positionedDocument(data, text);
      parser.destroy();
      resolve({ text, document });
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
    const { text, document } = await extractText(content);
    if (!text) throw new Error("Aucun texte n’a été trouvé dans ce PDF.");
    const parsed = parse1001TraiteurForm(document, args.filename, new Date());
    return { filename: args.filename, text, parsed };
  },
});
