import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { api } from "@ERPTrisThom/backend/convex/_generated/api";
import { TimeSelect } from "@/components/time-select";
import { RequestSourceBadge } from "@/components/crm/request-source-badge";
import { RequestStatusSelect } from "@/components/crm/request-status-select";

import { commercialStatusValues, normalizeRequestStatus, requestStatusConfig, type CommercialStatus } from "@/domain/request-status";
import { matchesRequestFilters, matchesRequestSearch, matchesRequestView, sortRequests, type RequestListView } from "@/domain/request-list";
import { useConvexCrm } from "@/lib/convex-crm";
import type { LocalRequest } from "@/lib/local-crm";

const sources = ["manuel", "telephone", "1001traiteur"] as const;
type Source = (typeof sources)[number];

const sourceLabels: Record<string, string> = {
  manuel: "Saisie manuelle",
  telephone: "Téléphone",
  "1001traiteur": "1001traiteur",
  directus: "Site",
  email: "E-mail",
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

export const Route = createFileRoute("/_auth/requests")({
  validateSearch: z.object({
    nouveau: z.boolean().optional().catch(false),
  }),
  component: RequestsPage,
});

function RequestsPage() {
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const { requests, archivedRequests, quotes, createRequest, deleteRequest, updateStatus } = useConvexCrm();
  const import1001Pdf = useAction(api.pdfImport.import1001Pdf);
  const createImportedRequest = useMutation(api.crm.createRequest);
  const [isCreating, setIsCreating] = useState(Boolean(searchParams.nouveau));
  const [isSaving, setIsSaving] = useState(false);
  const [creationMode, setCreationMode] = useState<"manual" | "pdf">("manual");
  const [pdfAnalysis, setPdfAnalysis] = useState<PdfAnalysis | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<RequestListView>("active");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<CommercialStatus>>(new Set());
  const [selectedSources, setSelectedSources] = useState<Set<LocalRequest["source"]>>(new Set());
  const [requestToDelete, setRequestToDelete] = useState<LocalRequest | null>(null);
  const [sort, setSort] = useState<"eventDate" | "eventDateDesc" | "receivedAt" | "receivedAtAsc">("eventDate");
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
        eventStartTime: optionalValue(data, "eventStartTime"),
        eventAddress: optionalValue(data, "eventAddress"),
        guestCount: guestCount ? Number(guestCount) : undefined,
        budgetPerPersonCents: budget ? Math.round(Number(budget) * 100) : undefined,
        specialNeeds: optionalValue(data, "specialNeeds"),
        message: optionalValue(data, "message"),
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

  const allRequests = useMemo(() => [...(requests ?? []), ...(archivedRequests ?? [])], [archivedRequests, requests]);
  const displayedRequests = view === "history" ? allRequests : requests;
  const filteredRequests = useMemo(() => (displayedRequests ?? []).filter((request) => matchesRequestView(request, view) && matchesRequestFilters(request, selectedStatuses, selectedSources) && matchesRequestSearch(request, search, quotes.find((quote) => quote.requestId === request._id))), [displayedRequests, quotes, search, selectedSources, selectedStatuses, view]);
  const visibleStatuses = view === "history" ? commercialStatusValues.filter((status) => ["termine", "refuse", "annule"].includes(status)) : commercialStatusValues.filter((status) => !["termine", "refuse", "annule"].includes(status));
  const toggleStatus = (status: CommercialStatus) => setSelectedStatuses((current) => { const next = new Set(current); next.has(status) ? next.delete(status) : next.add(status); return next; });
  const toggleSource = (source: LocalRequest["source"]) => setSelectedSources((current) => { const next = new Set(current); next.has(source) ? next.delete(source) : next.add(source); return next; });
  const sortedRequests = useMemo(() => sortRequests(filteredRequests, sort), [filteredRequests, sort]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-4xl font-bold">Demandes</h1>
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

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-5 py-4 sm:px-6">
          <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><input aria-label="Rechercher une demande" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un client, un événement…" className="input min-w-0 flex-1 sm:min-w-72" /><details className="relative"><summary className="cursor-pointer list-none rounded-md border border-stone-200 px-3 py-2 text-sm font-bold">Sources{selectedSources.size ? ` · ${selectedSources.size}` : ""} ▾</summary><div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-stone-200 bg-white p-2 shadow-lg">{Object.entries(sourceLabels).map(([source, label]) => <label key={source} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-stone-50"><input type="checkbox" checked={selectedSources.has(source as LocalRequest["source"])} onChange={() => toggleSource(source as LocalRequest["source"])} />{label}</label>)}</div></details><select aria-label="Trier" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="input w-auto"><option value="eventDate">Date événement ↑</option><option value="eventDateDesc">Date événement ↓</option><option value="receivedAt">Plus récentes</option><option value="receivedAtAsc">Plus anciennes</option></select></div><div className="flex gap-2 overflow-x-auto pb-1">{(["active", "week", "without_date", "history"] as RequestListView[]).map((value) => <button key={value} type="button" onClick={() => setView(value)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${view === value ? "bg-[#650d1c] text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}>{({ active: "Tous les actifs", week: "Cette semaine", without_date: "Sans date", history: "Historique" })[value]}</button>)}</div><div className="flex flex-wrap items-center gap-2">{visibleStatuses.map((status) => <button key={status} type="button" onClick={() => toggleStatus(status)} className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${requestStatusConfig[status].badgeClassName} ${selectedStatuses.has(status) ? "ring-2 ring-[#650d1c]" : "opacity-75"}`}>{requestStatusConfig[status].label} {(displayedRequests ?? []).filter((request) => matchesRequestView(request, view) && normalizeRequestStatus(request.status) === status).length}</button>)}{selectedStatuses.size ? <button type="button" onClick={() => setSelectedStatuses(new Set())} className="px-2 text-xs font-bold text-[#8b1629]">Effacer</button> : null}</div></div>
        </div>
        {!displayedRequests ? (
          <p className="px-6 py-10 text-sm text-stone-500">Chargement des demandes…</p>
        ) : displayedRequests.length === 0 ? (
          <p className="px-6 py-10 text-sm text-stone-500">Aucune demande pour le moment. Créez la première pour démarrer le suivi.</p>
        ) : filteredRequests.length === 0 ? (
          <p className="px-6 py-10 text-sm text-stone-500">Aucune demande ne correspond à votre recherche.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {sortedRequests.map((request) => <RequestRow key={request._id} request={request} onOpen={() => navigate({ to: "/requests/$requestId", params: { requestId: request._id } })} onDelete={() => setRequestToDelete(request)} onStatusChange={(status) => void updateStatus({ requestId: request._id, status })} />)}
          </div>
        )}
      </section>
      {requestToDelete ? <DeleteRequestDialog request={requestToDelete} onClose={() => setRequestToDelete(null)} onConfirm={async () => { try { await deleteRequest(requestToDelete._id); setRequestToDelete(null); toast.success("Demande supprimée"); } catch (error) { toast.error(error instanceof Error ? error.message : "Impossible de supprimer la demande"); } }} /> : null}
    </div>
  );
}

function RequestRow({ request, onOpen, onDelete, onStatusChange }: { request: LocalRequest; onOpen: () => void; onDelete: () => void; onStatusChange: (status: CommercialStatus) => void }) {
  return <article onClick={onOpen} className="grid cursor-pointer gap-3 px-5 py-3.5 transition hover:bg-[#fffaf4] sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><h3 className="truncate font-semibold">{request.contactName}</h3><p className="mt-1 truncate text-sm text-stone-600">{request.eventType || "Événement à préciser"}</p><div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-stone-500"><strong className="text-stone-800">{request.eventDate ? dateFormat.format(request.eventDate) : "Date à préciser"}</strong>{request.guestCount ? <span>· {request.guestCount} pers.</span> : null}<RequestSourceBadge source={request.source} /></div></div><div className="flex items-center justify-end gap-2"><RequestStatusSelect status={request.status} label={`Statut de ${request.contactName}`} onChange={onStatusChange} /><details onClick={(event) => event.stopPropagation()} className="relative"><summary aria-label={`Actions pour ${request.contactName}`} className="list-none rounded-md p-2 text-stone-500 hover:bg-stone-100"><MoreHorizontal className="size-5" /></summary><div className="absolute right-0 z-20 mt-1 min-w-32 rounded-md border border-stone-200 bg-white p-1 shadow-lg"><button type="button" onClick={onDelete} className="w-full rounded px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50">Supprimer</button></div></details><ChevronRight className="size-5 text-stone-300" /></div></article>;
}

function DeleteRequestDialog({ request, onClose, onConfirm }: { request: LocalRequest; onClose: () => void; onConfirm: () => Promise<void> }) {
  const eventDate = request.eventDate ? dateFormat.format(request.eventDate) : "date à préciser";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"><section role="dialog" aria-modal="true" aria-labelledby="delete-request-title" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"><h2 id="delete-request-title" className="font-serif text-2xl font-bold">Supprimer la demande ?</h2><p className="mt-3 text-sm text-stone-600">Supprimer la demande de <strong>{request.contactName}</strong> du <strong>{eventDate}</strong> ?</p><p className="mt-2 text-xs text-stone-500">Elle ne sera plus affichée dans TrisThom.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm font-bold text-stone-700">Annuler</button><button type="button" onClick={() => void onConfirm()} className="rounded-md bg-red-700 px-3 py-2 text-sm font-bold text-white">Supprimer</button></div></section></div>;
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
      <FormField label="Début du créneau"><TimeSelect name="eventStartTime" /></FormField>
      <FormField label="Fin du créneau"><TimeSelect name="eventEndTime" /></FormField>
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
    budgetPerPersonCents?: number; specialNeeds?: string; eventStartTime?: string; message?: string;
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
      <FormField label="Début du créneau"><input name="eventStartTime" type="time" step="1800" defaultValue={parsed.eventStartTime ?? ""} className="input" /></FormField>
      <FormField label="Budget par personne (€)"><input name="budgetPerPerson" type="number" min="0" step="0.01" defaultValue={parsed.budgetPerPersonCents ? (parsed.budgetPerPersonCents / 100).toString() : ""} className="input" /></FormField>
      <FormField label="Lieu / adresse" className="md:col-span-2"><input name="eventAddress" defaultValue={parsed.eventAddress ?? ""} className="input" /></FormField>
      <FormField label="Contraintes / informations complémentaires" className="md:col-span-2"><textarea name="specialNeeds" defaultValue={parsed.specialNeeds ?? ""} className="input min-h-20" /></FormField>
      <FormField label="Message du client" className="md:col-span-2"><textarea name="message" defaultValue={parsed.message ?? ""} className="input min-h-32" /></FormField>
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
