import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  CirclePlus,
  CopyPlus,
  Printer,
  Sparkles,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  legacyQuoteFromVersion,
  type LocalQuote,
  type LocalQuoteLine,
  type LocalRequest,
  type CatalogItem,
  type QuoteTemplate,
  useLocalCrm,
} from "@/lib/local-crm";
import { QuoteDocument } from "@/components/quotes/quote-document";
import { recommendQuotes } from "@/domain/quote-recommendation";
import { getRequestQualification } from "@/domain/request-qualification";
import { calculateQuoteTotals } from "@/domain/quote-calculation";
import { isQuoteDraftModified, isQuoteVersionFrozen } from "@/domain/quote-draft";
import { canDeleteQuoteVersion } from "@/domain/quote-deletion";
import { duplicateQuoteLine, moveQuoteLine, quickOptionCatalogId } from "@/domain/quote-editor";
import { createCatalogQuoteLine, createFreeQuoteLine, quoteLineOrigin, type QuoteCompositionItem } from "@/domain/quote-line";
import {
  applyFreeCompositionText,
  applyPersonalizedComposition,
  applyPredefinedComposition,
  cloneCompositionItems,
  compositionItemsToCommercialText,
  createCompositionItemFromCatalog,
  createFreeCompositionItem,
  isFormulaLine,
  moveCompositionItem,
  predefinedCompositions,
  removeCompositionItem,
} from "@/domain/quote-composition";

export const Route = createFileRoute("/_auth/requests/$requestId/quote")({
  component: QuotePreparationPage,
});

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const createLine = (): LocalQuoteLine => createFreeQuoteLine(crypto.randomUUID());
const originLabel = (line: LocalQuoteLine) => ({
  catalog: "Catalogue",
  recommendation: "Recommandation",
  free: "Ligne libre",
  legacy: "Ancienne ligne",
})[quoteLineOrigin(line)];
type CompositionMode = "preset" | "personalized" | "text";
type CompositionDraft = { lineId: string; mode: CompositionMode; presetId: string; items: QuoteCompositionItem[]; freeText: string };
type QuoteEditorStep = "offer" | "price" | "review";

function QuotePreparationPage() {
  const { requestId } = Route.useParams();
  const navigate = useNavigate();
  const {
    requests,
    quotes,
    catalog,
    saveQuote,
    createQuoteVersion,
    restoreQuoteVersion,
    deleteQuoteVersion,
  } = useLocalCrm();
  const request = requests.find((item) => item._id === requestId);
  const storedQuote = quotes.find((item) => item.requestId === requestId);
  const [quote, setQuote] = useState<LocalQuote>({
    version: 1,
    status: "brouillon",
    template: "libre",
    issueDate: Date.now(),
    validUntil: Date.now() + 7 * 86400000,
    depositPercent: 50,
    included: "",
    excluded: "",
    logistics: "",
    discountCents: 0,
    lines: [createLine()],
    updatedAt: Date.now(),
    versions: [],
  });
  const [catalogItemId, setCatalogItemId] = useState("");
  const [viewingVersionId, setViewingVersionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [compositionDraft, setCompositionDraft] = useState<CompositionDraft | null>(null);
  const [deleteVersionId, setDeleteVersionId] = useState<string | null>(null);
  const [editorStep, setEditorStep] = useState<QuoteEditorStep>("offer");
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"editor" | "split">("split");

  useEffect(() => {
    const version = storedQuote?.versions.find(
      (item) => item.id === (viewingVersionId ?? storedQuote.currentVersionId),
    );
    if (storedQuote && version)
      setQuote(
        legacyQuoteFromVersion(
          version,
          storedQuote.versions,
          storedQuote.quoteNumber,
        ),
      );
    else if (request?.quote) setQuote(request.quote);
    else if (request) {
      const used = quotes
        .map((item) => Number(item.quoteNumber.split("-").at(-1)))
        .filter(Number.isFinite);
      const next = String(Math.max(0, ...used) + 1).padStart(3, "0");
      setQuote((current) => ({
        ...current,
        number: `D-${new Date().getFullYear()}-${next}`,
      }));
    }
  }, [request, quotes, storedQuote, viewingVersionId]);
  const totals = useMemo(
    () => calculateQuoteTotals(quote.lines, quote.discountCents),
    [quote.discountCents, quote.lines],
  );
  const selectedVersion = storedQuote?.versions.find(
    (item) => item.id === (viewingVersionId ?? storedQuote.currentVersionId),
  );
  const versionToDelete = storedQuote?.versions.find((item) => item.id === deleteVersionId);
  const isHistoricalVersion = Boolean(viewingVersionId && viewingVersionId !== storedQuote?.currentVersionId);
  const isFrozenVersion = Boolean(selectedVersion && isQuoteVersionFrozen(selectedVersion.status));
  const hasUnsavedChanges = useMemo(
    () => isQuoteDraftModified(quote, selectedVersion),
    [quote, selectedVersion],
  );
  if (!request)
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-8">
        Dossier introuvable.
      </div>
    );
  const recommendations = recommendQuotes({
    request,
    catalog,
    dayRequests: requests.filter((item) => item.eventDate === request.eventDate),
  });
  const review = useMemo(
    () => getQuoteReview(request, quote, totals),
    [request, quote, totals],
  );
  const applyRecommendation = (recommendation: (typeof recommendations)[number]) => {
    if (isHistoricalVersion || isFrozenVersion) return;
    setQuote((current) => ({
      ...current,
      ...recommendation.quote,
      lines: recommendation.quote.lines.map((line) => ({ ...line, id: crypto.randomUUID() })),
      updatedAt: Date.now(),
    }));
    toast.success(`${recommendation.title} appliquée au brouillon`);
    setSuggestionsOpen(false);
  };
  const updateLine = (id: string, changes: Partial<LocalQuoteLine>) =>
    setQuote((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === id ? { ...line, ...changes } : line,
      ),
    }));
  const persistLegacy = async (status: LocalQuote["status"]) => {
    if (
      viewingVersionId &&
      viewingVersionId !== storedQuote?.currentVersionId
    ) {
      toast.error(
        "Cette version est figée. Créez une nouvelle version pour la modifier.",
      );
      return;
    }
    if (storedQuote?.status === "envoye" && status !== "envoye") {
      toast.error(
        "Le devis envoyé est figé. Créez une nouvelle version avant modification.",
      );
      return;
    }
    if (status === "pret" && review.blockers.length) {
      toast.error("Complétez les points indispensables avant de déclarer le devis prêt à envoyer.");
      return;
    }
    await saveQuote(request._id, { ...quote, status });
    setQuote((current) => ({ ...current, status }));
    toast.success(
      status === "envoye"
        ? "Devis marqué comme envoyé"
        : status === "pret"
          ? "Devis prêt à envoyer"
          : "Brouillon enregistré",
    );
  };
  const persist = async (status: LocalQuote["status"]) => {
    if (isHistoricalVersion || isFrozenVersion) {
      toast.error("Cette version est figée. Créez une nouvelle version pour la modifier.");
      return false;
    }
    if (status === "pret" && review.blockers.length) {
      toast.error("Complétez les points indispensables avant de déclarer le devis prêt à envoyer.");
      return false;
    }
    setIsSaving(true);
    try {
      await persistLegacy(status);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d’enregistrer le devis.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };
  const openPrint = (versionId?: string) => {
    const query = versionId ? `?version=${encodeURIComponent(versionId)}` : "";
    window.open(`/print/requests/${request._id}/quote${query}`, "_blank", "noopener,noreferrer");
  };
  const printQuote = async () => {
    if (isHistoricalVersion) return openPrint(viewingVersionId ?? undefined);
    if (hasUnsavedChanges && !(await persist("brouillon"))) return;
    openPrint();
  };
  const addCatalogItem = () => {
    const item = catalog.find((entry) => entry.id === catalogItemId);
    if (!item) return;
    setQuote((current) => ({
      ...current,
      lines: [
        ...current.lines,
        createCatalogQuoteLine(item, crypto.randomUUID()),
      ],
    }));
    setCatalogItemId("");
  };
  const addQuickOption = (kind: "delivery" | "tableware" | "setup" | "staff") => {
    const item = catalog.find((entry) => entry.id === quickOptionCatalogId(kind, catalog));
    if (!item) return;
    setQuote((current) => ({ ...current, lines: [...current.lines, createCatalogQuoteLine(item, crypto.randomUUID())] }));
  };
  const duplicateLine = (line: LocalQuoteLine) => setQuote((current) => ({ ...current, lines: [...current.lines, duplicateQuoteLine(line, crypto.randomUUID())] }));
  const moveLine = (index: number, direction: -1 | 1) => setQuote((current) => ({ ...current, lines: moveQuoteLine(current.lines, index, direction) }));
  const applyTemplate = (template: QuoteTemplate) => {
    const references: Record<Exclude<QuoteTemplate, "libre">, string> = {
      cocktail: "cocktail-brasserie",
      buffet_froid: "buffet-brasserie",
      buffet_chaud: "buffet-brasserie",
      mariage: "buffet-reception",
      plateau_repas: "plateau-froid",
      brunch: "brunch",
    };
    const item =
      template === "libre"
        ? undefined
        : catalog.find((entry) => entry.id === references[template]);
    setQuote((current) => ({
      ...current,
      template,
      lines: item
        ? [
            createCatalogQuoteLine(item, crypto.randomUUID(), request.guestCount ?? 1),
          ]
        : current.lines,
      included: item
        ? "Prestation culinaire et composition détaillée ci-dessus."
        : current.included,
      excluded: item
        ? "Livraison, boissons, vaisselle et personnel sauf mention contraire."
        : current.excluded,
    }));
  };
  const formulaLine = compositionDraft ? quote.lines.find((line) => line.id === compositionDraft.lineId) : undefined;
  const openComposition = (line: LocalQuoteLine) => {
    setCompositionDraft({
      lineId: line.id,
      mode: line.compositionItems?.length ? "personalized" : "preset",
      presetId: predefinedCompositions.find((preset) => preset.active)?.id ?? "",
      items: cloneCompositionItems(line.compositionItems ?? []),
      freeText: line.details?.join("\n") ?? "",
    });
  };
  const applyComposition = () => {
    if (!compositionDraft || !formulaLine || isHistoricalVersion || isFrozenVersion) return;
    const updated = compositionDraft.mode === "preset"
      ? applyPredefinedComposition(formulaLine, predefinedCompositions.find((preset) => preset.id === compositionDraft.presetId) ?? predefinedCompositions[0]!)
      : compositionDraft.mode === "personalized"
        ? applyPersonalizedComposition(formulaLine, compositionDraft.items)
        : applyFreeCompositionText(formulaLine, compositionDraft.freeText);
    updateLine(formulaLine.id, updated);
    setCompositionDraft(null);
  };
  const confirmDeleteDraft = async () => {
    if (!storedQuote || !versionToDelete) return;
    const removesQuote = storedQuote.versions.length === 1;
    try {
      await deleteQuoteVersion(request._id, versionToDelete.id);
      setDeleteVersionId(null);
      setViewingVersionId(null);
      toast.success(removesQuote ? "Le devis brouillon a été supprimé. Le dossier client est conservé." : `Version ${versionToDelete.versionNumber} supprimée.`);
      if (removesQuote) await navigate({ to: "/requests/$requestId", params: { requestId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de supprimer ce brouillon.");
    }
  };

  return (
    <div className="quote-page mx-auto max-w-[96rem] space-y-6">
      <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white/95 p-3 shadow-sm backdrop-blur">
        <Link
          to="/requests/$requestId"
          params={{ requestId }}
          className="inline-flex items-center gap-1 text-sm font-bold text-[#8b1629]"
        >
          <ChevronLeft className="size-4" />
          Retour au dossier
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void printQuote()}
            disabled={isSaving}
            className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-bold"
          >
            <Printer className="size-4" />
            {hasUnsavedChanges ? "Enregistrer et ouvrir le PDF" : "Imprimer / Enregistrer en PDF"}
          </button>
          <button
            onClick={() => void persist("brouillon")}
            disabled={isSaving || isHistoricalVersion || isFrozenVersion}
            className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-bold"
          >
            <Save className="size-4" />
            Enregistrer
          </button>
          <button
            onClick={() => void persist("pret")}
            disabled={isSaving || isHistoricalVersion || isFrozenVersion}
            className="rounded-md border border-[#8b1629] px-3 py-2 text-sm font-bold text-[#8b1629]"
          >
            Prêt à envoyer
          </button>
          <button
            onClick={() => void persist("envoye")}
            disabled={isSaving || isHistoricalVersion || isFrozenVersion}
            className="inline-flex items-center gap-1 rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white"
          >
            <Send className="size-4" />
            Marquer envoyé
          </button>
        </div>
      </div>
      <nav aria-label="Étapes du devis" className="flex gap-1 overflow-x-auto border-b border-stone-200">
        {([ ["offer", "1. Offre et composition"], ["price", "2. Prix et conditions"], ["review", "3. Vérification et envoi"] ] as const).map(([step, label]) => <button key={step} type="button" onClick={() => setEditorStep(step)} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-bold ${editorStep === step ? "border-[#8b1629] text-[#8b1629]" : "border-transparent text-stone-500"}`}>{label}</button>)}
        <button type="button" onClick={() => setPreviewMode((current) => current === "split" ? "editor" : "split")} className="ml-auto shrink-0 px-3 text-xs font-bold text-stone-600">{previewMode === "split" ? "Édition seule" : "Édition + aperçu"}</button>
      </nav>
      <p className={`text-right text-xs font-semibold ${hasUnsavedChanges ? "text-amber-800" : "text-emerald-700"}`}>
        {hasUnsavedChanges ? "Modifications non enregistrées" : "Modifications enregistrées"}
      </p>
      <div className={`grid items-start gap-6 ${previewMode === "split" ? "xl:grid-cols-[minmax(0,0.9fr)_minmax(34rem,1.1fr)]" : "grid-cols-1"}`}>
      <div className="quote-editor-shell space-y-6">
      <section className={`rounded-xl border p-5 shadow-sm ${review.blockers.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div className="flex items-start gap-3">
          {review.blockers.length ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-800" /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-800" />}
          <div>
            <p className="text-xs font-bold tracking-[.16em] uppercase text-stone-600">Contrôle avant envoi</p>
            <h2 className="mt-1 font-serif text-xl font-bold">{review.blockers.length ? "Le devis n’est pas encore prêt" : "Le devis peut être relu avant envoi"}</h2>
            <p className="mt-1 text-sm text-stone-600">L’assistant vérifie les éléments commerciaux essentiels ; la décision finale reste la vôtre.</p>
          </div>
        </div>
        {review.blockers.length ? <div className="mt-4"><p className="text-sm font-bold text-amber-950">À compléter</p><ul className="mt-2 space-y-1 text-sm text-amber-950">{review.blockers.map((item) => <li key={item}>• {item}</li>)}</ul></div> : null}
        {review.alerts.length ? <div className="mt-4 border-t border-black/10 pt-4"><p className="text-sm font-bold text-stone-800">À vérifier avant de l’envoyer</p><ul className="mt-2 space-y-1 text-sm text-stone-700">{review.alerts.map((item) => <li key={item}>• {item}</li>)}</ul></div> : null}
      </section>
      <section className="rounded-xl border border-[#d9b8bf] bg-[#fffaf4] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[.16em] text-[#8b1629] uppercase">Assistant de proposition</p>
            <h2 className="mt-1 font-serif text-2xl font-bold">Trois pistes à adapter</h2>
            <p className="mt-1 text-sm text-stone-600">Le système propose des pistes à partir du catalogue. Vous gardez toujours le dernier mot.</p>
          </div>
          <button type="button" onClick={() => setSuggestionsOpen((current) => !current)} className="inline-flex items-center gap-1 text-sm font-bold text-[#8b1629]"><Sparkles className="size-5" />{suggestionsOpen ? "Replier" : "Voir les pistes"}</button>
        </div>
        {recommendations.length ? <div className="mt-5 grid gap-3 lg:grid-cols-3">{recommendations.map((recommendation) => <article key={recommendation.id} className="rounded-lg border border-stone-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-wide text-[#8b1629] uppercase">{recommendation.title}</p><h3 className="mt-1 font-semibold">{recommendation.quote.lines[0]?.label}</h3></div><strong className="text-sm">{euro.format(recommendation.totalTtcCents / 100)}</strong></div><ul className="mt-3 space-y-1 text-xs text-stone-600">{recommendation.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul>{recommendation.foodCostCents !== undefined ? <p className="mt-3 rounded bg-stone-50 p-2 text-xs text-stone-600">Matière estimée : {euro.format(recommendation.foodCostCents / 100)} HT · {recommendation.foodCostSharePercent} % du prix HT</p> : <p className="mt-3 text-xs text-stone-500">Coût matière à compléter pour évaluer la rentabilité.</p>}{recommendation.warnings.length ? <div className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-950">{recommendation.warnings.map((warning) => <p key={warning}>⚠ {warning}</p>)}</div> : null}{recommendation.requiresManualApproval ? <p className="mt-3 text-xs font-bold text-[#8b1629]">Validation humaine obligatoire avant envoi.</p> : null}<button onClick={() => applyRecommendation(recommendation)} className="mt-4 w-full rounded-md border border-[#8b1629] px-3 py-2 text-sm font-bold text-[#8b1629]">Utiliser cette piste</button></article>)}</div> : <p className="mt-4 rounded-lg bg-white p-4 text-sm text-stone-600">Il faut renseigner le nombre de convives et créer une formule adaptée dans le catalogue pour obtenir des pistes.</p>}
      </section>
      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[.16em] text-[#7d6f67] uppercase">
              {quote.number ?? "Numérotation en cours"} · Version{" "}
              {quote.version} · {quote.status}
            </p>
            <h1 className="mt-1 font-serif text-4xl font-bold">
              Préparation du devis
            </h1>
            <p className="mt-2 text-sm text-stone-600">
              {request.contactName} ·{" "}
              {request.eventType || "Prestation à préciser"} ·{" "}
              {request.guestCount
                ? `${request.guestCount} personnes`
                : "Convives à préciser"}
            </p>
          </div>
          <button
            onClick={async () => {
              const next = await createQuoteVersion(request._id, quote);
              setViewingVersionId(null);
              setQuote(next);
              toast.success(`Version ${next.version} créée`);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-stone-200 px-3 py-2 text-sm font-bold"
          >
            <CopyPlus className="size-4" />
            Nouvelle version
          </button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-semibold">
            Modèle
            <select
              value={quote.template}
              disabled={isHistoricalVersion || isFrozenVersion}
              onChange={(e) => applyTemplate(e.target.value as QuoteTemplate)}
              className="input"
            >
              <option value="libre">Devis libre</option>
              <option value="cocktail">Cocktail</option>
              <option value="buffet_froid">Buffet froid</option>
              <option value="buffet_chaud">Buffet chaud</option>
              <option value="mariage">Mariage / service à table</option>
              <option value="plateau_repas">Plateaux-repas</option>
              <option value="brunch">Brunch</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Validité
            <input
              type="date"
              disabled={isHistoricalVersion || isFrozenVersion}
              value={new Date(quote.validUntil).toISOString().slice(0, 10)}
              onChange={(e) =>
                setQuote((current) => ({
                  ...current,
                  validUntil: new Date(`${e.target.value}T12:00:00`).getTime(),
                }))
              }
              className="input"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Acompte (%)
            <input
              type="number"
              min="0"
              disabled={isHistoricalVersion || isFrozenVersion}
              max="100"
              value={quote.depositPercent}
              onChange={(e) =>
                setQuote((current) => ({
                  ...current,
                  depositPercent: Number(e.target.value),
                }))
              }
              className="input"
            />
          </label>
        </div>
      </section>
      {storedQuote ? (
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl font-bold">Historique des versions</h2>
              <p className="text-sm text-stone-500">Les versions envoyées restent figées.</p>
            </div>
            <span className="rounded-full bg-[#f5ecee] px-3 py-1 text-xs font-bold text-[#8b1629]">{storedQuote.quoteNumber}</span>
            <button type="button" onClick={() => setVersionsOpen((current) => !current)} className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-bold">Versions du devis ({storedQuote.versions.length})</button>
          </div>
          {versionsOpen ? <div className="mt-4 space-y-2">
            {[...storedQuote.versions].sort((a, b) => b.versionNumber - a.versionNumber).map((version) => (
              <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#fffaf4] p-3">
                <div><p className="font-bold">Version {version.versionNumber} · {version.status}</p><p className="text-xs text-stone-500">{version.sentAt ? `Envoyée le ${new Intl.DateTimeFormat("fr-FR").format(version.sentAt)}` : `Modifiée le ${new Intl.DateTimeFormat("fr-FR").format(version.updatedAt)}`}</p></div>
                <div className="flex gap-2">
                  <button onClick={() => setViewingVersionId(version.id)} className="rounded border border-stone-200 bg-white px-2 py-1 text-xs font-bold">Consulter</button>
                  <button onClick={async () => { const next = await restoreQuoteVersion(request._id, version.id); setViewingVersionId(null); setQuote(next); toast.success(`Version ${next.version} créée à partir de la version ${version.versionNumber}`); }} className="rounded border border-[#8b1629] bg-white px-2 py-1 text-xs font-bold text-[#8b1629]">Restaurer en nouvelle version</button>
                  {canDeleteQuoteVersion(version) ? <button onClick={() => setDeleteVersionId(version.id)} className="rounded border border-red-200 bg-white px-2 py-1 text-xs font-bold text-red-700">{storedQuote.versions.length === 1 ? "Supprimer le devis brouillon" : "Supprimer le brouillon"}</button> : null}
                </div>
              </div>
            ))}
          </div> : null}
        </section>
      ) : null}
      {viewingVersionId && viewingVersionId !== storedQuote?.currentVersionId ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Vous consultez une version figée. <button onClick={() => setViewingVersionId(null)} className="font-bold underline">Revenir à la version courante</button></div> : null}
      <fieldset disabled={isHistoricalVersion || isFrozenVersion} className="contents">
      <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-6 py-4">
          <div>
            <h2 className="font-serif text-2xl font-bold">Prestations</h2>
            <p className="text-sm text-stone-500">
              Ajoutez une ligne libre ou un article de votre catalogue.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              aria-label="Ajouter un article du catalogue"
              value={catalogItemId}
              onChange={(e) => setCatalogItemId(e.target.value)}
              className="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Choisir dans le catalogue…</option>
              {catalog
                .filter((item) => item.active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} — {euro.format(item.unitPriceCents / 100)} HT
                  </option>
                ))}
            </select>
            <button
              onClick={addCatalogItem}
              disabled={!catalogItemId}
              className="rounded-md border border-[#8b1629] px-3 py-2 text-sm font-bold text-[#8b1629] disabled:opacity-40"
            >
              Ajouter
            </button>
            <button
              onClick={() =>
                setQuote((current) => ({
                  ...current,
                  lines: [...current.lines, createLine()],
                }))
              }
              className="inline-flex items-center gap-1 rounded-md bg-[#f5ecee] px-3 py-2 text-sm font-bold text-[#8b1629]"
            >
              <CirclePlus className="size-4" />
              Ligne libre
            </button>
            {([ ["delivery", "Livraison"], ["tableware", "Vaisselle"], ["setup", "Mise en place"], ["staff", "Personnel"] ] as const).map(([kind, label]) => <button key={kind} type="button" disabled={!quickOptionCatalogId(kind, catalog)} onClick={() => addQuickOption(kind)} className="rounded-md border border-stone-200 px-2 py-2 text-xs font-bold disabled:opacity-35">{label}</button>)}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-175 text-left text-sm">
            <thead className="bg-[#fffaf4] text-xs tracking-wide text-stone-500 uppercase">
              <tr>
                <th className="px-6 py-3">Prestation</th>
                <th className="w-24 px-3 py-3">Qté</th>
                <th className="w-36 px-3 py-3">Prix HT</th>
                <th className="w-24 px-3 py-3">TVA</th>
                <th className="w-36 px-3 py-3 text-right">Total TTC</th>
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {quote.lines.map((line, index) => (
                <>
                  <tr key={line.id}>
                    <td className="px-6 py-3">
                      <input
                        aria-label="Libellé"
                        value={line.label}
                        onChange={(e) =>
                          updateLine(line.id, { label: e.target.value })
                        }
                        className="w-full rounded border border-stone-200 px-2 py-2"
                      />
                      <p className="mt-1 text-[10px] font-bold tracking-wide text-stone-400 uppercase">{originLabel(line)}</p>
                      {isFormulaLine(line) ? <button type="button" onClick={() => openComposition(line)} className="mt-2 text-xs font-bold text-[#8b1629] underline underline-offset-2">Composer la formule</button> : null}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        aria-label="Quantité"
                        min="0"
                        type="number"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(line.id, {
                            quantity: Number(e.target.value),
                          })
                        }
                        className="w-full rounded border border-stone-200 px-2 py-2"
                      />
                      <p className="mt-1 text-[10px] text-stone-500">{line.unit ?? "unité"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <input
                        aria-label="Prix unitaire HT"
                        min="0"
                        step="0.01"
                        type="number"
                        value={line.unitPriceCents / 100}
                        onChange={(e) =>
                          updateLine(line.id, {
                            unitPriceCents: Math.round(
                              Number(e.target.value) * 100,
                            ),
                          })
                        }
                        className="w-full rounded border border-stone-200 px-2 py-2"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <select
                        aria-label="TVA"
                        value={line.vatRate}
                        onChange={(e) =>
                          updateLine(line.id, {
                            vatRate: Number(e.target.value),
                          })
                        }
                        className="w-full rounded border border-stone-200 px-2 py-2"
                      >
                        <option value={0}>0 %</option>
                        <option value={5.5}>5,5 %</option>
                        <option value={10}>10 %</option>
                        <option value={20}>20 %</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {euro.format((totals.lineTotals[index]?.totalTtcCents ?? 0) / 100)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                      <button type="button" aria-label="Dupliquer la ligne" onClick={() => duplicateLine(line)} className="text-stone-500 hover:text-[#8b1629]">⧉</button>
                      <button type="button" aria-label="Monter la ligne" disabled={index === 0} onClick={() => moveLine(index, -1)} className="text-stone-500 disabled:opacity-30">↑</button>
                      <button type="button" aria-label="Descendre la ligne" disabled={index === quote.lines.length - 1} onClick={() => moveLine(index, 1)} className="text-stone-500 disabled:opacity-30">↓</button>
                      <button
                        aria-label="Supprimer la ligne"
                        disabled={quote.lines.length === 1}
                        onClick={() =>
                          setQuote((current) => ({
                            ...current,
                            lines: current.lines.filter(
                              (item) => item.id !== line.id,
                            ),
                          }))
                        }
                        className="text-stone-400 hover:text-[#8b1629] disabled:opacity-30"
                      >
                        <Trash2 className="size-4" />
                      </button>
                      </div>
                    </td>
                  </tr>
                  {line.details?.length ? (
                    <tr key={`${line.id}-details`}>
                      <td colSpan={6} className="bg-[#fffaf4] px-6 pb-4">
                        <label className="grid gap-1 text-xs font-bold text-stone-600">
                          Composition détaillée (modifiable pour ce devis)
                          <textarea
                            value={line.details.join("\n")}
                            onChange={(e) =>
                              {
                                updateLine(line.id, { details: e.target.value.split("\n") });
                              }
                            }
                            className="min-h-20 rounded border border-stone-200 bg-white p-2 text-sm font-normal"
                          />
                        </label>
                      </td>
                    </tr>
                  ) : null}
                  {line.estimatedFoodCostCents !== undefined || line.estimatedProductionMinutes !== undefined ? (
                    <tr key={`${line.id}-internal`}>
                      <td colSpan={6} className="bg-stone-50 px-6 pb-3 text-xs text-stone-600">
                        <details>
                          <summary className="cursor-pointer font-semibold">Informations internes</summary>
                          <p className="mt-2">{line.estimatedFoodCostCents !== undefined ? `Coût matière estimé : ${euro.format(line.estimatedFoodCostCents / 100)} HT` : ""}{line.estimatedFoodCostCents !== undefined && line.estimatedProductionMinutes !== undefined ? " · " : ""}{line.estimatedProductionMinutes !== undefined ? `Temps de production estimé : ${line.estimatedProductionMinutes} min` : ""}</p>
                        </details>
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-stone-100 p-6">
          <div className="w-full max-w-xs space-y-2">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Remise (€)</span>
              <input
                min="0"
                step="0.01"
                type="number"
                value={quote.discountCents / 100}
                onChange={(e) =>
                  setQuote((current) => ({
                    ...current,
                    discountCents: Math.round(Number(e.target.value) * 100),
                  }))
                }
                className="w-28 rounded border border-stone-200 px-2 py-1.5 text-right"
              />
            </label>
            <div className="flex justify-between text-sm">
              <span>Total HT</span>
              <strong>{euro.format(totals.totalHtCents / 100)}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span>TVA</span>
              <strong>{euro.format(totals.totalVatCents / 100)}</strong>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-3 font-serif text-xl">
              <span>Total TTC</span>
              <strong>{euro.format(totals.totalTtcCents / 100)}</strong>
            </div>
          </div>
        </div>
      </section>
      <section className="grid gap-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">
          Inclus dans le devis
          <textarea
            value={quote.included}
            onChange={(e) =>
              setQuote((current) => ({ ...current, included: e.target.value }))
            }
            placeholder="Prestation, dressage, pain…"
            className="input min-h-28"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Non inclus / options
          <textarea
            value={quote.excluded}
            onChange={(e) =>
              setQuote((current) => ({ ...current, excluded: e.target.value }))
            }
            placeholder="Boissons, vaisselle, personnel…"
            className="input min-h-28"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Logistique
          <textarea
            value={quote.logistics}
            onChange={(e) =>
              setQuote((current) => ({ ...current, logistics: e.target.value }))
            }
            placeholder="Livraison, accès, dressage, horaires…"
            className="input min-h-28"
          />
        </label>
      </section>
      <section className="grid gap-5 rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">Introduction<textarea value={quote.introduction ?? ""} onChange={(e) => setQuote((current) => ({ ...current, introduction: e.target.value }))} placeholder="Quelques mots pour présenter votre proposition…" className="input min-h-28" /></label>
        <label className="grid gap-1 text-sm font-semibold">Conditions<textarea value={quote.conditions ?? ""} onChange={(e) => setQuote((current) => ({ ...current, conditions: e.target.value }))} placeholder="Conditions commerciales et de réservation…" className="input min-h-28" /></label>
        <label className="grid gap-1 text-sm font-semibold">Remarques<textarea value={quote.remarks ?? ""} onChange={(e) => setQuote((current) => ({ ...current, remarks: e.target.value }))} placeholder="Informations complémentaires…" className="input min-h-28" /></label>
      </section>
      <p className="text-center text-xs text-stone-400">
        Le devis est sauvegardé dans ce navigateur. L’impression permet de l’enregistrer en PDF.
      </p>
      </fieldset>
      </div>
      {previewMode === "split" ? <div className="quote-preview xl:sticky xl:top-6">
        <QuoteDocument quote={storedQuote ?? { id: "preview", requestId: request._id, quoteNumber: quote.number ?? "Brouillon", currentVersionId: "preview", status: quote.status, createdAt: quote.issueDate, updatedAt: quote.updatedAt, totalHtCents: totals.totalHtCents, totalVatCents: totals.totalVatCents, totalTtcCents: totals.totalTtcCents, versions: [] }} version={{ id: "preview", versionNumber: quote.version, status: quote.status, createdAt: quote.issueDate, updatedAt: quote.updatedAt, lines: quote.lines, discountCents: quote.discountCents, issueDate: quote.issueDate, validUntil: quote.validUntil, depositPercent: quote.depositPercent, included: quote.included, excluded: quote.excluded, logistics: quote.logistics, introduction: quote.introduction, conditions: quote.conditions, remarks: quote.remarks, template: quote.template, totalHtCents: totals.totalHtCents, totalVatCents: totals.totalVatCents, totalTtcCents: totals.totalTtcCents }} request={request} />
      </div> : null}
      </div>
      {compositionDraft && formulaLine ? <QuoteCompositionEditor
        line={formulaLine}
        guestCount={request.guestCount}
        catalog={catalog}
        draft={compositionDraft}
        onChange={setCompositionDraft}
        onCancel={() => setCompositionDraft(null)}
        onApply={applyComposition}
      /> : null}
      {versionToDelete && storedQuote ? <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Supprimer le brouillon">
        <section className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
          <h2 className="font-serif text-2xl font-bold">Supprimer le brouillon ?</h2>
          <p className="mt-3 text-sm text-stone-700">Devis {storedQuote.quoteNumber} · version {versionToDelete.versionNumber}.</p>
          <p className="mt-2 text-sm text-stone-600">Seul ce brouillon sera supprimé. Le dossier client, ses notes et ses informations seront conservés.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setDeleteVersionId(null)} className="rounded-md border border-stone-200 px-4 py-2 text-sm font-bold">Annuler</button>
            <button type="button" onClick={() => void confirmDeleteDraft()} className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-700">Supprimer le brouillon</button>
          </div>
        </section>
      </div> : null}
      <style>{`@media print { @page { size: A4; margin: 0; } html, body { background: #fbf6ee !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .quote-page > :not(.quote-preview), .quote-editor-shell, .quote-page > .grid > .quote-editor-shell { display: none !important; } .quote-page > .grid { display: block !important; } .quote-preview { display: block !important; position: static !important; width: 100% !important; } .quote-document-root { box-shadow: none !important; } .quote-document-root > div { min-height: 0 !important; } thead { display: table-header-group; } tr { break-inside: avoid; page-break-inside: avoid; } button, input, select, textarea, details, summary { display: none !important; } }`}</style>
    </div>
  );
}

function QuoteCompositionEditor({
  line,
  guestCount,
  catalog,
  draft,
  onChange,
  onCancel,
  onApply,
}: {
  line: LocalQuoteLine;
  guestCount?: number;
  catalog: CatalogItem[];
  draft: CompositionDraft;
  onChange: (draft: CompositionDraft) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const [catalogItemId, setCatalogItemId] = useState("");
  const [freeName, setFreeName] = useState("");
  const [freeQuantity, setFreeQuantity] = useState(1);
  const [freeUnit, setFreeUnit] = useState("portion");
  const catalogGroups = ["Entrées", "Pièces froides", "Pièces chaudes", "Plats", "Accompagnements", "Desserts", "Autres"];
  const clientPreview = draft.mode === "text" ? draft.freeText : compositionItemsToCommercialText(draft.items).join("\n");
  const updateItem = (index: number, changes: Partial<QuoteCompositionItem>) => onChange({
    ...draft,
    items: draft.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item),
  });
  const addCatalogItem = () => {
    const item = catalog.find((entry) => entry.id === catalogItemId);
    if (!item) return;
    onChange({ ...draft, items: [...draft.items, createCompositionItemFromCatalog(item, 1)] });
    setCatalogItemId("");
  };
  const addFreeItem = () => {
    if (!freeName.trim()) return;
    onChange({ ...draft, items: [...draft.items, createFreeCompositionItem(freeName, freeQuantity, freeUnit)] });
    setFreeName("");
  };
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 md:items-center" role="dialog" aria-modal="true" aria-label="Composer la formule">
    <section className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[.16em] uppercase text-[#8b1629]">Composition de la formule</p>
          <h2 className="mt-1 font-serif text-2xl font-bold">{line.label}</h2>
          <p className="mt-1 text-sm text-stone-500">{guestCount ? `${guestCount} convives` : "Nombre de convives à préciser"} · la composition est enregistrée uniquement quand vous appliquez.</p>
        </div>
        <button type="button" onClick={onCancel} className="text-sm font-bold text-stone-500">Fermer</button>
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-b border-stone-200 pb-4">
        {(["preset", "personalized", "text"] as const).map((mode) => <button key={mode} type="button" onClick={() => onChange({ ...draft, mode })} className={`rounded-md px-3 py-2 text-sm font-bold ${draft.mode === mode ? "bg-[#650d1c] text-white" : "bg-stone-100 text-stone-700"}`}>
          {mode === "preset" ? "Composition prédéfinie" : mode === "personalized" ? "Composition personnalisée" : "Texte libre"}
        </button>)}
      </div>
      {draft.mode === "preset" ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {predefinedCompositions.filter((preset) => preset.active).map((preset) => <label key={preset.id} className={`cursor-pointer rounded-lg border p-3 ${draft.presetId === preset.id ? "border-[#8b1629] bg-[#fffaf4]" : "border-stone-200"}`}>
          <input type="radio" className="mr-2" checked={draft.presetId === preset.id} onChange={() => onChange({ ...draft, presetId: preset.id })} />
          <span className="font-bold">{preset.name}</span>
          <span className="mt-1 block text-xs text-stone-500">{compositionItemsToCommercialText(preset.compositionItems).join(" · ")}</span>
        </label>)}
      </div> : null}
      {draft.mode === "personalized" ? <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2 rounded-lg bg-stone-50 p-3">
          <select value={catalogItemId} onChange={(event) => setCatalogItemId(event.target.value)} className="min-w-56 rounded border border-stone-200 bg-white px-2 py-2 text-sm">
            <option value="">Ajouter un élément du catalogue…</option>
            {catalogGroups.map((group) => {
              const items = catalog.filter((item) => item.active && (group === "Autres" || compositionGroup(item.category) === group));
              return items.length ? <optgroup key={group} label={group}>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup> : null;
            })}
          </select>
          <button type="button" onClick={addCatalogItem} disabled={!catalogItemId} className="rounded border border-[#8b1629] px-3 py-2 text-sm font-bold text-[#8b1629] disabled:opacity-40">Ajouter</button>
        </div>
        <div className="flex flex-wrap gap-2 rounded-lg bg-stone-50 p-3">
          <input value={freeName} onChange={(event) => setFreeName(event.target.value)} placeholder="Élément libre" className="min-w-48 rounded border border-stone-200 px-2 py-2 text-sm" />
          <input type="number" min="0" value={freeQuantity} onChange={(event) => setFreeQuantity(Number(event.target.value))} className="w-20 rounded border border-stone-200 px-2 py-2 text-sm" />
          <input value={freeUnit} onChange={(event) => setFreeUnit(event.target.value)} className="w-28 rounded border border-stone-200 px-2 py-2 text-sm" />
          <button type="button" onClick={addFreeItem} className="rounded border border-stone-300 px-3 py-2 text-sm font-bold">Ajouter libre</button>
        </div>
        <div className="space-y-2">
          {draft.items.length ? draft.items.map((item, index) => <div key={`${item.catalogItemId ?? item.name}-${index}`} className="flex flex-wrap items-center gap-2 rounded border border-stone-200 p-2">
            <span className="min-w-48 flex-1 text-sm font-semibold">{item.name}</span>
            <input aria-label={`Quantité ${item.name}`} type="number" min="0" value={item.quantity ?? ""} onChange={(event) => updateItem(index, { quantity: Number(event.target.value) })} className="w-20 rounded border border-stone-200 px-2 py-1 text-sm" />
            <input aria-label={`Unité ${item.name}`} value={item.unit ?? ""} onChange={(event) => updateItem(index, { unit: event.target.value })} className="w-24 rounded border border-stone-200 px-2 py-1 text-sm" />
            <button type="button" aria-label="Monter" onClick={() => onChange({ ...draft, items: moveCompositionItem(draft.items, index, -1) })} className="px-1 text-sm">↑</button>
            <button type="button" aria-label="Descendre" onClick={() => onChange({ ...draft, items: moveCompositionItem(draft.items, index, 1) })} className="px-1 text-sm">↓</button>
            <button type="button" aria-label="Supprimer l'élément" onClick={() => onChange({ ...draft, items: removeCompositionItem(draft.items, index) })} className="px-1 text-sm text-[#8b1629]">×</button>
          </div>) : <p className="text-sm text-stone-500">Ajoutez les éléments qui composent cette formule.</p>}
        </div>
      </div> : null}
      {draft.mode === "text" ? <textarea value={draft.freeText} onChange={(event) => onChange({ ...draft, freeText: event.target.value })} className="mt-4 min-h-48 w-full rounded border border-stone-200 p-3 text-sm" placeholder="Décrivez librement la composition proposée au client." /> : null}
      <div className="mt-5 rounded-lg bg-[#fffaf4] p-3">
        <p className="text-xs font-bold tracking-wide uppercase text-stone-500">Aperçu du texte client</p>
        <p className="mt-2 whitespace-pre-line text-sm text-stone-800">{clientPreview || "Aucun élément renseigné."}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-stone-200 px-4 py-2 text-sm font-bold">Annuler</button>
        <button type="button" onClick={onApply} className="rounded-md bg-[#650d1c] px-4 py-2 text-sm font-bold text-white">Appliquer</button>
      </div>
    </section>
  </div>;
}

function compositionGroup(category: string): string {
  if (/froid/i.test(category)) return "Pièces froides";
  if (/chaud/i.test(category)) return "Pièces chaudes";
  if (/dessert|sucr/i.test(category)) return "Desserts";
  if (/entr/i.test(category)) return "Entrées";
  if (/accompagnement/i.test(category)) return "Accompagnements";
  if (/plat/i.test(category)) return "Plats";
  return "Autres";
}

function getQuoteReview(
  request: LocalRequest,
  quote: LocalQuote,
  totals: ReturnType<typeof calculateQuoteTotals>,
) {
  const blockers: string[] = [];
  const alerts: string[] = [];
  const validLines = quote.lines.filter(
    (line) => line.label.trim() && line.quantity > 0 && line.unitPriceCents > 0,
  );

  if (validLines.length === 0)
    blockers.push("Ajoutez au moins une prestation chiffrée (libellé, quantité et prix).");
  if (totals.totalTtcCents <= 0)
    blockers.push("Le total du devis doit être supérieur à 0 €.");
  if (!request.contactEmail && !request.contactPhone)
    blockers.push("Ajoutez au moins un moyen de contact pour le client.");

  const missingEventDetails = getRequestQualification(request)
    .filter((criterion) => ["date", "location", "guestCount", "service"].includes(criterion.id) && !criterion.complete)
    .map((criterion) => criterion.label);
  if (missingEventDetails.length)
    alerts.push(`Informations événement à confirmer : ${missingEventDetails.join(", ")}.`);
  if (!request.budgetCents && !request.budgetPerPersonCents)
    alerts.push("Aucun budget client renseigné : vérifiez le positionnement commercial du prix.");
  else {
    const budget = request.budgetCents ?? (request.budgetPerPersonCents ?? 0) * (request.guestCount ?? 0);
    if (budget > 0 && totals.totalTtcCents > budget)
      alerts.push(`Le devis dépasse le budget annoncé de ${euro.format((totals.totalTtcCents - budget) / 100)} TTC.`);
  }
  if (request.dietaryRequirements)
    alerts.push("Contraintes alimentaires à relire recette par recette avant envoi.");
  if (!quote.included.trim() || !quote.excluded.trim())
    alerts.push("Précisez ce qui est inclus et exclu pour éviter tout malentendu avec le client.");
  if (!quote.logistics.trim())
    alerts.push("Conditions de livraison, accès ou installation à confirmer.");

  return { blockers, alerts };
}

export function legacyPrintQuote(
  request: LocalRequest,
  quote: LocalQuote,
) {
  const popup = window.open("", "_blank");
  if (!popup) {
    toast.error("Autorisez les fenêtres surgissantes pour exporter le devis.");
    return;
  }
  const number =
    quote.number ??
    `D-${new Date().getFullYear()}-${request._id.slice(0, 4).toUpperCase()}`;
  const calculation = calculateQuoteTotals(quote.lines, quote.discountCents);
  const rows = quote.lines
    .map(
      (line, index) =>
        `<tr><td><strong>${escapeHtml(line.label)}</strong>${line.details?.length ? `<br><span class="muted">${line.details.map(escapeHtml).join("<br>")}</span>` : ""}</td><td>${line.quantity}</td><td>${money(line.unitPriceCents)}</td><td>${line.vatRate} %</td><td>${money(calculation.lineTotals[index]?.totalTtcCents ?? 0)}</td></tr>`,
    )
    .join("");
  const totals = {
    excludingVat: calculation.totalHtCents,
    vat: calculation.totalVatCents,
    includingVat: calculation.totalTtcCents,
  };
  popup.document.write(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${number}</title><style>body{font:12px Arial;color:#251e1b;margin:42px;line-height:1.45}header{border-bottom:4px solid #650d1c;padding-bottom:18px;display:flex;justify-content:space-between}h1{font:700 34px Georgia;margin:6px 0;color:#650d1c}h2{font:700 19px Georgia;margin:28px 0 8px}.muted{color:#756b65}.grid{display:grid;grid-template-columns:1fr 1fr;gap:30px}.box{background:#fffaf4;padding:14px}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#650d1c;color:#fff;text-align:left;padding:9px}td{padding:10px 8px;border-bottom:1px solid #e8ded8}td:last-child,th:last-child{text-align:right}.totals{margin-left:auto;width:260px;margin-top:18px}.total{font:700 20px Georgia;border-top:2px solid #650d1c;padding-top:9px}.footer{position:fixed;bottom:20px;font-size:9px;color:#756b65}@media print{body{margin:22px}}</style></head><body><header><div><p class="muted">Traiteur de cuisine française maison<br>Val-d’Oise & Île-de-France</p><h1>DEVIS</h1><p><strong>${number}</strong> · Émission : ${new Intl.DateTimeFormat("fr-FR").format(Date.now())}<br>Validité : 7 jours</p></div><div style="text-align:right"><strong>TRISTHOM · Bouillon Comptoir</strong><br>90 boulevard de Montmorency<br>95170 Deuil-la-Barre<br>SIRET : 943 286 690 00012<br>contact@bouilloncomptoir.fr</div></header><h2>${escapeHtml(request.eventType || "Prestation")}</h2><p class="muted">${request.eventDate ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(request.eventDate) : "Date à confirmer"} · ${request.guestCount ?? "—"} personnes · ${escapeHtml(request.eventAddress || "Adresse à confirmer")}</p><div class="grid"><div class="box"><strong>Client / lieu de l’événement</strong><br>${escapeHtml(request.contactName)}<br>${escapeHtml(request.contactEmail || "")}<br>${escapeHtml(request.contactPhone || "")}</div><div class="box"><strong>Proposition</strong><br>${escapeHtml(request.message || "Proposition commerciale Bouillon Comptoir.")}</div></div><h2>Récapitulatif chiffré</h2><table><thead><tr><th>Description</th><th>Qté</th><th>PU HT</th><th>TVA</th><th>Total TTC</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><p>Total HT <span style="float:right">${money(totals.excludingVat)}</span></p><p>TVA <span style="float:right">${money(totals.vat)}</span></p><p>Remise <span style="float:right">− ${money(quote.discountCents)}</span></p><p class="total">TOTAL TTC <span style="float:right">${money(totals.includingVat)}</span></p></div><h2>Conditions</h2><p>Devis valable 7 jours. Acompte de 50 % à la confirmation. Prestation sous réserve de disponibilité de production et de logistique. Les accès, horaires et conditions de livraison sont à confirmer avant validation.</p><p class="footer">Bouillon Comptoir · TRISTHOM SAS · 90 boulevard de Montmorency, 95170 Deuil-la-Barre · contact@bouilloncomptoir.fr</p><script>window.onload=()=>window.print()</script></body></html>`,
  );
  popup.document.close();
}
function money(cents: number) {
  return euro.format(cents / 100);
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}
