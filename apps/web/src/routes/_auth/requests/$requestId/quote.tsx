import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ChevronLeft,
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
  type QuoteTemplate,
  useLocalCrm,
} from "@/lib/local-crm";
import { QuoteDocument } from "@/components/quotes/quote-document";
import { recommendQuotes } from "@/domain/quote-recommendation";

export const Route = createFileRoute("/_auth/requests/$requestId/quote")({
  component: QuotePreparationPage,
});

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});
const createLine = (): LocalQuoteLine => ({
  id: crypto.randomUUID(),
  label: "Nouvelle prestation",
  quantity: 1,
  unitPriceCents: 0,
  vatRate: 10,
});

function QuotePreparationPage() {
  const { requestId } = Route.useParams();
  const {
    requests,
    quotes,
    catalog,
    saveQuote,
    createQuoteVersion,
    restoreQuoteVersion,
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
  const totals = useMemo(() => calculate(quote), [quote]);
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
  const applyRecommendation = (recommendation: (typeof recommendations)[number]) => {
    setQuote((current) => ({
      ...current,
      ...recommendation.quote,
      lines: recommendation.quote.lines.map((line) => ({ ...line, id: crypto.randomUUID() })),
      updatedAt: Date.now(),
    }));
    toast.success(`${recommendation.title} appliquée au brouillon`);
  };
  const updateLine = (id: string, changes: Partial<LocalQuoteLine>) =>
    setQuote((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === id ? { ...line, ...changes } : line,
      ),
    }));
  const persist = async (status: LocalQuote["status"]) => {
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
  const addCatalogItem = () => {
    const item = catalog.find((entry) => entry.id === catalogItemId);
    if (!item) return;
    setQuote((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          id: crypto.randomUUID(),
          label: item.name,
          quantity: 1,
          unitPriceCents: item.unitPriceCents,
          vatRate: item.vatRate,
          details: item.details,
        },
      ],
    }));
    setCatalogItemId("");
  };
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
            {
              id: crypto.randomUUID(),
              label: item.name,
              quantity: request.guestCount ?? 1,
              unitPriceCents: item.unitPriceCents,
              vatRate: item.vatRate,
              details: item.details,
            },
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

  return (
    <div className="quote-page mx-auto max-w-[96rem] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
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
            onClick={() => window.open(`/print/requests/${request._id}/quote`, "_blank", "noopener,noreferrer")}
            className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-bold"
          >
            <Printer className="size-4" />
            Imprimer / Enregistrer en PDF
          </button>
          <button
            onClick={() => persist("brouillon")}
            className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-bold"
          >
            <Save className="size-4" />
            Enregistrer
          </button>
          <button
            onClick={() => persist("pret")}
            className="rounded-md border border-[#8b1629] px-3 py-2 text-sm font-bold text-[#8b1629]"
          >
            Prêt à envoyer
          </button>
          <button
            onClick={() => persist("envoye")}
            className="inline-flex items-center gap-1 rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white"
          >
            <Send className="size-4" />
            Marquer envoyé
          </button>
        </div>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(34rem,1.1fr)]">
      <div className="quote-editor-shell space-y-6">
      <section className="rounded-xl border border-[#d9b8bf] bg-[#fffaf4] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[.16em] text-[#8b1629] uppercase">Assistant de proposition</p>
            <h2 className="mt-1 font-serif text-2xl font-bold">Trois pistes à adapter</h2>
            <p className="mt-1 text-sm text-stone-600">Le système propose des pistes à partir du catalogue. Vous gardez toujours le dernier mot.</p>
          </div>
          <Sparkles className="size-6 text-[#8b1629]" />
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
              <p className="text-sm text-stone-500">Les versions envoyÃ©es restent figÃ©es.</p>
            </div>
            <span className="rounded-full bg-[#f5ecee] px-3 py-1 text-xs font-bold text-[#8b1629]">{storedQuote.quoteNumber}</span>
          </div>
          <div className="mt-4 space-y-2">
            {[...storedQuote.versions].sort((a, b) => b.versionNumber - a.versionNumber).map((version) => (
              <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#fffaf4] p-3">
                <div><p className="font-bold">Version {version.versionNumber} Â· {version.status}</p><p className="text-xs text-stone-500">{version.sentAt ? `EnvoyÃ©e le ${new Intl.DateTimeFormat("fr-FR").format(version.sentAt)}` : `ModifiÃ©e le ${new Intl.DateTimeFormat("fr-FR").format(version.updatedAt)}`}</p></div>
                <div className="flex gap-2">
                  <button onClick={() => setViewingVersionId(version.id)} className="rounded border border-stone-200 bg-white px-2 py-1 text-xs font-bold">Consulter</button>
                  <button onClick={async () => { const next = await restoreQuoteVersion(request._id, version.id); setViewingVersionId(null); setQuote(next); toast.success(`Version ${next.version} crÃ©Ã©e Ã  partir de la version ${version.versionNumber}`); }} className="rounded border border-[#8b1629] bg-white px-2 py-1 text-xs font-bold text-[#8b1629]">Restaurer en nouvelle version</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {viewingVersionId && viewingVersionId !== storedQuote?.currentVersionId ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Vous consultez une version figÃ©e. <button onClick={() => setViewingVersionId(null)} className="font-bold underline">Revenir Ã  la version courante</button></div> : null}
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
              {quote.lines.map((line) => (
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
                      {euro.format(
                        (line.quantity *
                          line.unitPriceCents *
                          (1 + line.vatRate / 100)) /
                          100,
                      )}
                    </td>
                    <td className="px-3 py-3">
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
                              updateLine(line.id, {
                                details: e.target.value
                                  .split("\n")
                                  .filter(Boolean),
                              })
                            }
                            className="min-h-20 rounded border border-stone-200 bg-white p-2 text-sm font-normal"
                          />
                        </label>
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
              <strong>{euro.format(totals.excludingVat / 100)}</strong>
            </div>
            <div className="flex justify-between text-sm">
              <span>TVA</span>
              <strong>{euro.format(totals.vat / 100)}</strong>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-3 font-serif text-xl">
              <span>Total TTC</span>
              <strong>{euro.format(totals.includingVat / 100)}</strong>
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
      </div>
      <div className="quote-preview xl:sticky xl:top-6">
        <QuoteDocument quote={storedQuote ?? { id: "preview", requestId: request._id, quoteNumber: quote.number ?? "Brouillon", currentVersionId: "preview", status: quote.status, createdAt: quote.issueDate, updatedAt: quote.updatedAt, totalHtCents: totals.excludingVat, totalVatCents: totals.vat, totalTtcCents: totals.includingVat, versions: [] }} version={{ id: "preview", versionNumber: quote.version, status: quote.status, createdAt: quote.issueDate, updatedAt: quote.updatedAt, lines: quote.lines, discountCents: quote.discountCents, issueDate: quote.issueDate, validUntil: quote.validUntil, depositPercent: quote.depositPercent, included: quote.included, excluded: quote.excluded, logistics: quote.logistics, introduction: quote.introduction, conditions: quote.conditions, remarks: quote.remarks, template: quote.template, totalHtCents: totals.excludingVat, totalVatCents: totals.vat, totalTtcCents: totals.includingVat }} request={request} />
      </div>
      </div>
      <style>{`@media print { @page { size: A4; margin: 0; } html, body { background: #fbf6ee !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .quote-page > :not(.quote-preview), .quote-editor-shell, .quote-page > .grid > .quote-editor-shell { display: none !important; } .quote-page > .grid { display: block !important; } .quote-preview { display: block !important; position: static !important; width: 100% !important; } .quote-document-root { box-shadow: none !important; } .quote-document-root > div { min-height: 0 !important; } thead { display: table-header-group; } tr { break-inside: avoid; page-break-inside: avoid; } button, input, select, textarea, details, summary { display: none !important; } }`}</style>
    </div>
  );
}

function calculate(quote: LocalQuote) {
  const excludingVat =
    quote.lines.reduce(
      (total, line) => total + line.quantity * line.unitPriceCents,
      0,
    ) - quote.discountCents;
  const includingVatBeforeDiscount = quote.lines.reduce(
    (total, line) =>
      total + line.quantity * line.unitPriceCents * (1 + line.vatRate / 100),
    0,
  );
  const includingVat = Math.max(
    0,
    Math.round(includingVatBeforeDiscount - quote.discountCents),
  );
  return {
    excludingVat: Math.max(0, excludingVat),
    includingVat,
    vat: Math.max(0, includingVat - Math.max(0, excludingVat)),
  };
}

export function legacyPrintQuote(
  request: LocalRequest,
  quote: LocalQuote,
  totals: ReturnType<typeof calculate>,
) {
  const popup = window.open("", "_blank");
  if (!popup) {
    toast.error("Autorisez les fenêtres surgissantes pour exporter le devis.");
    return;
  }
  const number =
    quote.number ??
    `D-${new Date().getFullYear()}-${request._id.slice(0, 4).toUpperCase()}`;
  const rows = quote.lines
    .map(
      (line) =>
        `<tr><td><strong>${escapeHtml(line.label)}</strong>${line.details?.length ? `<br><span class="muted">${line.details.map(escapeHtml).join("<br>")}</span>` : ""}</td><td>${line.quantity}</td><td>${money(line.unitPriceCents)}</td><td>${line.vatRate} %</td><td>${money(Math.round(line.quantity * line.unitPriceCents * (1 + line.vatRate / 100)))}</td></tr>`,
    )
    .join("");
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
