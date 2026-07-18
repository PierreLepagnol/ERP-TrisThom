import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { QuoteDocument } from "@/components/quotes/quote-document";
import { selectQuoteVersion } from "@/domain/quote-draft";
import { LocalCrmProvider, useLocalCrm } from "@/lib/local-crm";

export const Route = createFileRoute("/print/requests/$requestId/quote")({
  validateSearch: z.object({ version: z.string().optional() }),
  component: PrintQuoteRoute,
});

function PrintQuoteRoute() {
  return (
    <LocalCrmProvider>
      <PrintQuoteDocument />
    </LocalCrmProvider>
  );
}

function PrintQuoteDocument() {
  const { requestId } = Route.useParams();
  const { version: versionId } = Route.useSearch();
  const { requests, archivedRequests, quotes } = useLocalCrm();
  const request = [...requests, ...archivedRequests].find(
    (item) => item._id === requestId,
  );
  const quote = quotes.find((item) => item.requestId === requestId);
  const version = quote && selectQuoteVersion(quote.versions, quote.currentVersionId, versionId);
  if (!request || !quote || !version)
    return (
      <main className="p-8 text-sm text-stone-600">Chargement du devis…</main>
    );
  return (
    <main className="print-document-page">
      <div className="no-print mx-auto mb-4 max-w-3xl rounded-lg border border-[#d8cdbb] bg-[#fbf6ee] p-4 text-sm text-stone-700">
        <strong className="text-[#5a1420]">Avant l’impression :</strong> désactivez « En-têtes et pieds de page » dans la fenêtre d’impression pour ne pas afficher la date, l’URL ou le titre du navigateur.
        <button onClick={() => window.print()} className="ml-2 rounded bg-[#5a1420] px-3 py-1.5 font-bold text-white">Imprimer / Enregistrer en PDF</button>
      </div>
      <QuoteDocument quote={quote} version={version} request={request} />
      <style>{`@media print { .no-print { display: none !important; } html, body { margin: 0 !important; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
    </main>
  );
}
