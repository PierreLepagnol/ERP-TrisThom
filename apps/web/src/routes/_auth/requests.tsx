import { Link, Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { CalendarDays, ChevronRight, CircleAlert, Columns3, FileText, Filter, LayoutList, Users } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { api } from "@ERPTrisThom/backend/convex/_generated/api";

import { getAllowedRequestStatuses, pipelineRequestStatuses, requestStatusConfig, requestStatusValues, type RequestStatus } from "@/domain/request-status";
import { filterOperationalRequests, matchesRequestSearch, sortRequests } from "@/domain/request-list";
import { useConvexCrm } from "@/lib/convex-crm";
import type { LocalRequest } from "@/lib/local-crm";

const sources = ["manuel", "telephone", "1001traiteur"] as const;
const statuses = requestStatusValues;

type Source = (typeof sources)[number];
type Status = RequestStatus;

const sourceLabels: Record<string, string> = {
  manuel: "Saisie manuelle",
  telephone: "Téléphone",
  "1001traiteur": "1001traiteur",
  directus: "Site",
  email: "E-mail",
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
type QuickFilter = "tous" | "a_traiter" | "devis_relances" | "archivees" | "nouvelles" | "qualifier" | "devis_preparer" | "acceptees";

export const Route = createFileRoute("/_auth/requests")({
  validateSearch: z.object({
    nouveau: z.boolean().optional().catch(false),
  }),
  component: RequestsPage,
});

function RequestsPage() {
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const { requests, archivedRequests, quotes, createRequest, updateStatus, markHandled, scheduleFollowUp, startQuotePreparation } = useConvexCrm();
  const import1001Pdf = useAction(api.pdfImport.import1001Pdf);
  const createImportedRequest = useMutation(api.crm.createRequest);
  const [isCreating, setIsCreating] = useState(Boolean(searchParams.nouveau));
  const [isSaving, setIsSaving] = useState(false);
  const [creationMode, setCreationMode] = useState<"manual" | "pdf">("manual");
  const [pdfAnalysis, setPdfAnalysis] = useState<PdfAnalysis | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "tous">("tous");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("tous");
  const [view, setView] = useState<"list" | "board">("list");
  const [draggedRequestId, setDraggedRequestId] = useState<string | null>(null);
  const [sort, setSort] = useState<"priority" | "nextAction" | "eventDate" | "receivedAt" | "amount">("priority");
  void setSort;
  const location = useLocation();

  if (location.pathname !== "/requests") return <Outlet />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const eventDateValue = String(formData.get("eventDate") ?? "");
    const guestCountValue = String(formData.get("guestCount") ?? "");
    const budgetValue = String(formData.get("budget") ?? "");

    setIsSaving(true);
    try {
      await createRequest({
        source: String(formData.get("source")) as Source,
        contactName: String(formData.get("contactName") ?? ""),
        contactEmail: optionalValue(formData, "contactEmail"),
        contactPhone: optionalValue(formData, "contactPhone"),
        eventType: optionalValue(formData, "eventType"),
        eventDate: eventDateValue ? new Date(`${eventDateValue}T12:00:00`).getTime() : undefined,
        eventStartTime: optionalValue(formData, "eventStartTime"),
        eventEndTime: optionalValue(formData, "eventEndTime"),
        eventAddress: optionalValue(formData, "eventAddress"),
        guestCount: guestCountValue ? Number(guestCountValue) : undefined,
        budgetCents: budgetValue ? Math.round(Number(budgetValue) * 100) : undefined,
        message: optionalValue(formData, "message"),
      });
      form.reset();
      setIsCreating(false);
      toast.success("Demande créée");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de créer la demande");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(
    request: NonNullable<typeof requests>[number],
    status: Status,
  ) {
    try {
      await updateStatus({
        requestId: request._id,
        status,
        eventStartTime: request.eventStartTime,
        eventEndTime: request.eventEndTime,
      });
      toast.success("Statut mis à jour");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de changer le statut");
    }
  }

  async function handlePdfImport(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Le PDF doit faire moins de 5 Mo.");
      return;
    }
    setIsSaving(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const result = await import1001Pdf({
        filename: file.name,
        contentBase64: dataUrl.slice(dataUrl.indexOf(",") + 1),
      });
      setPdfAnalysis(result);
      toast.success("PDF analysé : vérifiez les informations avant de créer le dossier.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d’importer ce PDF.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePdfCreation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pdfAnalysis) return;
    const data = new FormData(event.currentTarget);
    setIsSaving(true);
    try {
      const date = String(data.get("eventDate") ?? "");
      const guestCount = String(data.get("guestCount") ?? "");
      const budget = String(data.get("budgetPerPerson") ?? "");
      const requestId = await createImportedRequest({
        source: "1001traiteur",
        externalSourceId: `pdf:${pdfAnalysis.filename}`,
        historyLabel: "Demande importée depuis un PDF 1001 Traiteur",
        contactName: String(data.get("contactName") ?? "").trim() || "Contact à identifier",
        contactEmail: optionalValue(data, "contactEmail"),
        contactPhone: optionalValue(data, "contactPhone"),
        organizationName: optionalValue(data, "organizationName"),
        eventType: optionalValue(data, "eventType"),
        eventDate: date ? new Date(`${date}T12:00:00`).getTime() : undefined,
        eventAddress: optionalValue(data, "eventAddress"),
        guestCount: guestCount ? Number(guestCount) : undefined,
        budgetPerPersonCents: budget ? Math.round(Number(budget) * 100) : undefined,
        specialNeeds: optionalValue(data, "specialNeeds"),
        message: `PDF source : ${pdfAnalysis.filename}\n\n${pdfAnalysis.text}`.slice(0, 20_000),
      });
      setPdfAnalysis(null);
      setIsCreating(false);
      toast.success("Demande 1001 Traiteur créée");
      await navigate({ to: "/requests/$requestId", params: { requestId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de créer la demande.");
    } finally {
      setIsSaving(false);
    }
  }

  async function moveRequest(requestId: string, status: Status) {
    const request = requests.find((item) => item._id === requestId);
    if (!request || request.status === status || !getAllowedRequestStatuses(request.status).includes(status)) return;
    await handleStatusChange(request, status);
  }

  const displayedRequests = quickFilter === "archivees" ? archivedRequests : requests;
  const filteredRequests = useMemo(() => filterOperationalRequests(displayedRequests.filter((request) => {
    const matchesStatus = statusFilter === "tous" || request.status === statusFilter;
    const matchesSearch = matchesRequestSearch(request, search, quotes.find((quote) => quote.requestId === request._id));
    return matchesStatus && matchesSearch;
  }), quickFilter === "archivees" ? "tous" : quickFilter), [displayedRequests, quickFilter, quotes, search, statusFilter]);
  const sortedRequests = useMemo(() => sortRequests(filteredRequests, sort), [filteredRequests, sort]);
  const newCount = requests?.filter((request) => request.status === "nouveau").length ?? 0;
  const qualifyingCount = requests?.filter((request) => request.status === "a_qualifier").length ?? 0;
  const quoteAndFollowUpCount = requests?.filter((request) => ["devis_a_preparer", "devis_envoye", "relance"].includes(request.status)).length ?? 0;

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[#7d6f67] uppercase">Suivi commercial</p>
          <h1 className="mt-1 font-serif text-4xl font-bold">Demandes</h1>
          <p className="mt-2 text-sm text-stone-600">Centralisez les demandes et faites progresser chaque dossier.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreating((current) => !current)}
          className="rounded-md bg-[#650d1c] px-4 py-2.5 text-sm font-bold text-white"
        >
          {isCreating ? "Fermer" : "Nouvelle demande"}
        </button>
      </section>

      {isCreating ? <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-stone-100 pb-4">
          <button type="button" onClick={() => setCreationMode("manual")} className={`rounded-md px-3 py-2 text-sm font-bold ${creationMode === "manual" ? "bg-[#650d1c] text-white" : "bg-stone-100 text-stone-700"}`}>Saisie manuelle</button>
          <button type="button" onClick={() => setCreationMode("pdf")} className={`rounded-md px-3 py-2 text-sm font-bold ${creationMode === "pdf" ? "bg-[#650d1c] text-white" : "bg-stone-100 text-stone-700"}`}>Importer un PDF 1001 Traiteur</button>
        </div>
        {creationMode === "manual" ? <RequestForm isSaving={isSaving} onSubmit={handleSubmit} /> : <PdfImportForm isSaving={isSaving} analysis={pdfAnalysis} onImport={handlePdfImport} onCancel={() => setPdfAnalysis(null)} onCreate={handlePdfCreation} />}
      </section> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={CircleAlert} label="Nouvelles demandes" value={newCount} hint="À prendre en charge" onClick={() => { setQuickFilter("tous"); setStatusFilter("nouveau"); }} />
        <SummaryCard icon={Users} label="À qualifier" value={qualifyingCount} hint="Informations à compléter" onClick={() => { setQuickFilter("tous"); setStatusFilter("a_qualifier"); }} emphasis />
        <SummaryCard icon={FileText} label="Devis et relances" value={quoteAndFollowUpCount} hint="Dossiers commerciaux en cours" onClick={() => { setQuickFilter("devis_relances"); setStatusFilter("tous"); }} />
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-serif text-2xl font-bold">Le suivi des dossiers</h2><p className="mt-1 text-sm text-stone-500">Commencez par les dossiers qui demandent une action.</p></div>
          <div className="flex flex-1 flex-wrap justify-end gap-2">
            <div className="flex rounded-md border border-stone-200 bg-white p-1"><button type="button" onClick={() => setView("list")} aria-label="Vue liste" className={`rounded p-2 ${view === "list" ? "bg-[#f5ecee] text-[#8b1629]" : "text-stone-400"}`}><LayoutList className="size-4" /></button><button type="button" onClick={() => setView("board")} aria-label="Vue pipeline" className={`rounded p-2 ${view === "board" ? "bg-[#f5ecee] text-[#8b1629]" : "text-stone-400"}`}><Columns3 className="size-4" /></button></div>
            <input aria-label="Rechercher une demande" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un client…" className="input max-w-xs" />
            <select aria-label="Filtrer par statut" value={statusFilter} onChange={(event) => { setQuickFilter("tous"); setStatusFilter(event.target.value as Status | "tous"); }} className="input max-w-52">
              <option value="tous">Tous les statuts</option>
              {statuses.map((status) => <option key={status} value={status}>{requestStatusConfig[status].label}</option>)}
            </select>
          </div></div>
          <div className="mt-4 flex flex-wrap items-center gap-2"><Filter className="size-4 text-stone-400" />{([ ["a_traiter", "À traiter aujourd’hui"], ["nouvelles", "Nouvelles"], ["qualifier", "À qualifier"], ["devis_preparer", "Devis à préparer"], ["devis_relances", "Devis envoyés à relancer"], ["acceptees", "Prestations acceptées"], ["tous", "Tous les dossiers"] ] as const).map(([filter, label]) => <QuickFilterButton key={filter} active={quickFilter === filter} onClick={() => { setQuickFilter(filter); setStatusFilter("tous"); }}>{label} ({filterOperationalRequests(requests, filter).length})</QuickFilterButton>)}</div>
        </div>
        {!displayedRequests ? (
          <p className="px-6 py-10 text-sm text-stone-500">Chargement des demandes…</p>
        ) : displayedRequests.length === 0 ? (
          <p className="px-6 py-10 text-sm text-stone-500">Aucune demande pour le moment. Créez la première pour démarrer le suivi.</p>
        ) : filteredRequests.length === 0 ? (
          <p className="px-6 py-10 text-sm text-stone-500">Aucune demande ne correspond à votre recherche.</p>
        ) : (
          view === "board" && quickFilter !== "archivees" ? <PipelineBoard requests={filteredRequests} onMove={moveRequest} draggedRequestId={draggedRequestId} setDraggedRequestId={setDraggedRequestId} /> : <div className="divide-y divide-stone-100">
            <div className="hidden grid-cols-[1.15fr_1.2fr_.9fr_1fr_auto] gap-5 px-6 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-stone-400 xl:grid"><span>Client</span><span>Événement</span><span>Qualification</span><span>Suivi</span><span>Action</span></div>
            {sortedRequests.map((request) => <RequestRow key={request._id} request={request} quote={quotes.find((quote) => quote.requestId === request._id)} onOpen={() => navigate({ to: "/requests/$requestId", params: { requestId: request._id } })} onStatusChange={handleStatusChange} onPrepareQuote={() => void startQuotePreparation(request._id).then(() => navigate({ to: "/requests/$requestId/quote", params: { requestId: request._id } }))} onMarkHandled={() => void markHandled(request._id)} onPostpone={(days) => void scheduleFollowUp(request._id, Date.now() + days * 86400000)} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, hint, emphasis = false, onClick }: { icon: typeof CircleAlert; label: string; value: number; hint: string; emphasis?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${emphasis ? "border-[#e6c7cd] bg-[#fff8f8]" : "border-stone-200 bg-white"}`}><div className="flex items-center justify-between"><p className="text-sm font-semibold text-stone-600">{label}</p><Icon className={`size-5 ${emphasis ? "text-[#8b1629]" : "text-stone-400"}`} /></div><p className="mt-2 font-serif text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-stone-500">{hint}</p></button>;
}

function QuickFilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${active ? "bg-[#650d1c] text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>{children}</button>;
}

function RequestRow({ request, onOpen, onStatusChange, quote, onPrepareQuote, onMarkHandled, onPostpone }: { request: LocalRequest; quote?: { quoteNumber: string }; onOpen: () => void; onStatusChange: (request: LocalRequest, status: Status) => Promise<void>; onPrepareQuote: () => void; onMarkHandled: () => void; onPostpone: (days: number) => void }) {
  void quote; void onPrepareQuote; void onMarkHandled; void onPostpone;
  const missingCount = request.missingInformation.length;
  const followUp = request.followUps.find((item) => !item.completedAt);
  const budget = request.budgetCents ? `Budget ${(request.budgetCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}` : request.budgetPerPersonCents ? `${(request.budgetPerPersonCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} / pers.` : "Budget à préciser";
  const nextAction = followUp?.title ?? (missingCount ? "Qualifier le dossier" : request.status === "nouveau" ? "Prendre contact" : request.status === "devis_a_preparer" ? "Préparer le devis" : request.status === "devis_envoye" ? "Attendre le retour client" : request.status === "relance" ? "Relancer le client" : request.status === "accepte" ? "Prestation confirmée" : "Suivre le dossier");
  const shortAddress = request.eventAddress?.split(",")[0];
  return <article onClick={onOpen} className="grid cursor-pointer gap-4 px-5 py-5 transition hover:bg-[#fffaf4] sm:px-6 md:grid-cols-2 xl:grid-cols-[1.15fr_1.2fr_.9fr_1fr_auto] xl:items-center xl:gap-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{request.contactName}</h3><span className="rounded-full bg-[#f5ecee] px-2 py-0.5 text-[11px] font-bold text-[#8b1629]">{sourceLabels[request.source] ?? request.source}</span></div><p className="mt-1 truncate text-sm text-stone-500">{request.organizationName || "Particulier"}</p></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{request.eventType || "Format à préciser"}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{request.eventDate ? dateFormat.format(request.eventDate) : "Date à préciser"}</span><span className="inline-flex items-center gap-1"><Users className="size-3.5" />{request.guestCount ? `${request.guestCount} pers.` : "Convives à préciser"}</span></div>{shortAddress ? <p className="mt-1 truncate text-xs text-stone-500">{shortAddress}</p> : null}</div><div><p className="text-sm font-semibold">{budget}</p><p className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${missingCount ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{missingCount ? `${missingCount} information${missingCount > 1 ? "s" : ""} manquante${missingCount > 1 ? "s" : ""}` : "Dossier complet"}</p></div><div><span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${requestStatusConfig[request.status].badgeClassName}`}>{requestStatusConfig[request.status].label}</span><p className="mt-2 text-sm font-semibold text-stone-700">{nextAction}</p>{followUp ? <time className="mt-1 block text-xs text-[#8b1629]">Échéance : {dateFormat.format(followUp.dueAt)}</time> : null}</div><div className="flex items-center justify-end gap-2"><label className="sr-only" htmlFor={`status-${request._id}`}>Modifier le statut</label><select id={`status-${request._id}`} value={request.status} onClick={(event) => event.stopPropagation()} onChange={(event) => void onStatusChange(request, event.target.value as Status)} className="rounded-md border border-stone-200 bg-white px-2 py-2 text-xs font-bold text-stone-700"><option disabled>Statut</option>{getAllowedRequestStatuses(request.status).map((status) => <option key={status} value={status}>{requestStatusConfig[status].label}</option>)}</select><ChevronRight className="size-5 text-stone-300" /></div></article>;
}

function PipelineBoard({ requests, onMove, draggedRequestId, setDraggedRequestId }: { requests: LocalRequest[] | undefined; onMove: (requestId: string, status: Status) => Promise<void>; draggedRequestId: string | null; setDraggedRequestId: (value: string | null) => void }) {
  return <div className="overflow-x-auto bg-stone-50 p-4"><div className="grid min-w-[110rem] grid-cols-7 gap-3">{pipelineRequestStatuses.map((status) => { const columnRequests = requests?.filter((request) => request.status === status) ?? []; return <section key={status} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedRequestId) void onMove(draggedRequestId, status); setDraggedRequestId(null); }} className="min-h-[24rem] rounded-xl border border-stone-200 bg-white p-3"><header className="mb-3 flex items-center justify-between"><span className={`rounded-full px-2 py-1 text-xs font-bold ring-1 ${requestStatusConfig[status].badgeClassName}`}>{requestStatusConfig[status].label}</span><span className="text-sm font-bold text-stone-400">{columnRequests.length}</span></header><div className="space-y-2">{columnRequests.length === 0 ? <p className="rounded-lg border border-dashed border-stone-200 p-3 text-xs text-stone-400">Déposez un dossier ici</p> : columnRequests.map((request) => <article key={request._id} draggable onDragStart={() => setDraggedRequestId(request._id)} onDragEnd={() => setDraggedRequestId(null)} className="cursor-grab rounded-lg border border-stone-200 bg-white p-3 shadow-sm transition hover:border-[#d9b8bf] hover:shadow active:cursor-grabbing"><Link to="/requests/$requestId" params={{ requestId: request._id }} className="block"><p className="truncate text-sm font-bold">{request.contactName}</p><p className="mt-1 truncate text-xs text-stone-500">{request.eventType ?? "Format à préciser"}</p>{request.eventDate ? <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#8b1629]"><CalendarDays className="size-3" />{dateFormat.format(request.eventDate)}</p> : null}</Link>{request.missingInformation.length > 0 ? <p className="mt-2 text-[11px] font-bold text-amber-700">{request.missingInformation.length} info{request.missingInformation.length > 1 ? "s" : ""} à compléter</p> : null}<select aria-label={`Déplacer ${request.contactName}`} value={request.status} onClick={(event) => event.stopPropagation()} onChange={(event) => void onMove(request._id, event.target.value as Status)} className="mt-3 w-full rounded border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs font-semibold text-stone-600">{getAllowedRequestStatuses(request.status).map((value) => <option key={value} value={value}>{requestStatusConfig[value].label}</option>)}</select></article>)}</div></section>; })}</div></div>;
}

function RequestForm({
  isSaving,
  onSubmit,
}: {
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      <FormField label="Source">
        <select name="source" defaultValue="manuel" className="input">
          {sources.map((source) => (
            <option key={source} value={source}>{sourceLabels[source]}</option>
          ))}
        </select>
      </FormField>
      <FormField label="Nom du contact">
        <input name="contactName" required className="input" placeholder="Nom ou entreprise" />
      </FormField>
      <FormField label="E-mail"><input name="contactEmail" type="email" className="input" /></FormField>
      <FormField label="Téléphone"><input name="contactPhone" type="tel" className="input" /></FormField>
      <FormField label="Format souhaité"><input name="eventType" className="input" placeholder="Buffet, cocktail, mariage…" /></FormField>
      <FormField label="Nombre de personnes"><input name="guestCount" type="number" min="1" className="input" /></FormField>
      <FormField label="Date souhaitée"><input name="eventDate" type="date" className="input" /></FormField>
      <FormField label="Budget estimé (€)"><input name="budget" type="number" min="0" step="0.01" className="input" /></FormField>
      <FormField label="Début"><input name="eventStartTime" type="time" className="input" /></FormField>
      <FormField label="Fin"><input name="eventEndTime" type="time" className="input" /></FormField>
      <FormField label="Adresse de l'événement" className="md:col-span-2"><input name="eventAddress" className="input" /></FormField>
      <FormField label="Message / notes" className="md:col-span-2"><textarea name="message" className="input min-h-24" /></FormField>
      <div className="md:col-span-2 flex justify-end">
        <button disabled={isSaving} className="rounded-md bg-[#650d1c] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {isSaving ? "Enregistrement…" : "Créer la demande"}
        </button>
      </div>
    </form>
  );
}

type PdfAnalysis = {
  filename: string;
  text: string;
  parsed: {
    contactName?: string; contactEmail?: string; contactPhone?: string; organizationName?: string;
    eventType?: string; eventDate?: number; eventAddress?: string; guestCount?: number;
    budgetPerPersonCents?: number; specialNeeds?: string;
  };
};

function PdfImportForm({ isSaving, analysis, onImport, onCancel, onCreate }: { isSaving: boolean; analysis: PdfAnalysis | null; onImport: (file: File) => Promise<void>; onCancel: () => void; onCreate: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  if (analysis) {
    const { parsed } = analysis;
    return <form onSubmit={(event) => void onCreate(event)} className="grid max-w-3xl gap-4 md:grid-cols-2">
      <div className="md:col-span-2 rounded-md bg-[#fff8ef] p-4 text-sm"><strong>PDF analysé : {analysis.filename}</strong><p className="mt-1 text-stone-600">Vérifiez et corrigez les informations avant de créer le dossier. Les champs vides resteront à confirmer.</p></div>
      <FormField label="Nom du contact"><input name="contactName" defaultValue={parsed.contactName ?? ""} className="input" /></FormField>
      <FormField label="Entreprise"><input name="organizationName" defaultValue={parsed.organizationName ?? ""} className="input" /></FormField>
      <FormField label="E-mail"><input name="contactEmail" type="email" defaultValue={parsed.contactEmail ?? ""} className="input" /></FormField>
      <FormField label="Téléphone"><input name="contactPhone" defaultValue={parsed.contactPhone ?? ""} className="input" /></FormField>
      <FormField label="Type d’événement"><input name="eventType" defaultValue={parsed.eventType ?? ""} className="input" /></FormField>
      <FormField label="Nombre de convives"><input name="guestCount" type="number" min="1" defaultValue={parsed.guestCount?.toString() ?? ""} className="input" /></FormField>
      <FormField label="Date"><input name="eventDate" type="date" defaultValue={parsed.eventDate ? new Date(parsed.eventDate).toISOString().slice(0, 10) : ""} className="input" /></FormField>
      <FormField label="Budget par personne (€)"><input name="budgetPerPerson" type="number" min="0" step="0.01" defaultValue={parsed.budgetPerPersonCents ? (parsed.budgetPerPersonCents / 100).toString() : ""} className="input" /></FormField>
      <FormField label="Lieu / adresse" className="md:col-span-2"><input name="eventAddress" defaultValue={parsed.eventAddress ?? ""} className="input" /></FormField>
      <FormField label="Contraintes / informations complémentaires" className="md:col-span-2"><textarea name="specialNeeds" defaultValue={parsed.specialNeeds ?? ""} className="input min-h-20" /></FormField>
      <details className="md:col-span-2 rounded-md border border-stone-200 p-3 text-sm"><summary className="cursor-pointer font-bold">Voir le texte lu dans le PDF</summary><p className="mt-3 whitespace-pre-wrap text-stone-600">{analysis.text}</p></details>
      <div className="md:col-span-2 flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={isSaving} className="px-4 py-2.5 text-sm font-bold">Annuler l’import</button><button disabled={isSaving} className="rounded-md bg-[#650d1c] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{isSaving ? "Création…" : "Créer la demande"}</button></div>
    </form>;
  }
  return <form onSubmit={(event) => { event.preventDefault(); if (file) void onImport(file); }} className="max-w-xl space-y-4">
    <div>
      <h2 className="font-serif text-2xl font-bold">Importer une demande 1001 Traiteur</h2>
      <p className="mt-1 text-sm text-stone-600">Choisis le PDF reçu de 1001 Traiteur. Le contact, la date, le lieu, le nombre de personnes et le budget seront repris automatiquement dans le dossier.</p>
    </div>
    <label className="grid gap-1.5 text-sm font-semibold">PDF de la demande<input type="file" accept="application/pdf,.pdf" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="input" /></label>
    {file ? <p className="rounded-md bg-[#fff8ef] p-3 text-sm">Fichier sélectionné : <strong>{file.name}</strong></p> : null}
    <button disabled={!file || isSaving} className="rounded-md bg-[#650d1c] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{isSaving ? "Analyse du PDF…" : "Analyser le PDF"}</button>
  </form>;
}

function FormField({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`grid gap-1.5 text-sm font-semibold ${className ?? ""}`}><span>{label}</span>{children}</label>;
}

function optionalValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Impossible de lire le PDF."));
    reader.readAsDataURL(file);
  });
}
