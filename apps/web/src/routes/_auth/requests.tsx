import { createFileRoute } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { useLocalCrm } from "@/lib/local-crm";

const sources = ["manuel", "telephone", "1001traiteur"] as const;
const statuses = [
  "nouveau",
  "a_qualifier",
  "devis_a_preparer",
  "devis_envoye",
  "relance",
  "accepte",
  "refuse",
  "annule",
] as const;

type Source = (typeof sources)[number];
type Status = (typeof statuses)[number];

const sourceLabels: Record<Source, string> = {
  manuel: "Saisie manuelle",
  telephone: "Téléphone",
  "1001traiteur": "1001traiteur",
};

const statusLabels: Record<Status, string> = {
  nouveau: "Nouveau",
  a_qualifier: "À qualifier",
  devis_a_preparer: "Devis à préparer",
  devis_envoye: "Devis envoyé",
  relance: "Relance",
  accepte: "Accepté",
  refuse: "Refusé",
  annule: "Annulé",
};

export const Route = createFileRoute("/_auth/requests")({
  validateSearch: z.object({
    nouveau: z.boolean().optional().catch(false),
  }),
  component: RequestsPage,
});

function RequestsPage() {
  const searchParams = Route.useSearch();
  const { requests, createRequest, updateStatus } = useLocalCrm();
  const [isCreating, setIsCreating] = useState(Boolean(searchParams.nouveau));
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "tous">("tous");

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

  const filteredRequests = requests?.filter((request) => {
    const matchesStatus = statusFilter === "tous" || request.status === statusFilter;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [request.contactName, request.contactEmail, request.eventType]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });

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

      {isCreating ? <RequestForm isSaving={isSaving} onSubmit={handleSubmit} /> : null}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 px-6 py-4">
          <h2 className="font-serif text-2xl font-bold">Tous les dossiers</h2>
          <div className="flex flex-1 flex-wrap justify-end gap-2">
            <input aria-label="Rechercher une demande" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un client…" className="input max-w-xs" />
            <select aria-label="Filtrer par statut" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Status | "tous")} className="input max-w-52">
              <option value="tous">Tous les statuts</option>
              {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </select>
          </div>
        </div>
        {!requests ? (
          <p className="px-6 py-10 text-sm text-stone-500">Chargement des demandes…</p>
        ) : requests.length === 0 ? (
          <p className="px-6 py-10 text-sm text-stone-500">Aucune demande pour le moment. Créez la première pour démarrer le suivi.</p>
        ) : filteredRequests?.length === 0 ? (
          <p className="px-6 py-10 text-sm text-stone-500">Aucune demande ne correspond à votre recherche.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {filteredRequests?.map((request) => (
              <article key={request._id} className="grid gap-4 px-6 py-5 md:grid-cols-[minmax(0,1fr)_11rem] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="font-semibold">{request.contactName}</h3>
                    <span className="rounded-full bg-[#f5ecee] px-2 py-0.5 text-xs font-bold text-[#8b1629]">
                      {request.source}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">
                    {request.eventType ?? "Format à préciser"} · {request.guestCount ? `${request.guestCount} pers.` : "Invités à préciser"}
                  </p>
                  {request.missingInformation.length > 0 ? (
                    <p className="mt-2 text-xs font-semibold text-amber-700">
                      À compléter : {request.missingInformation.join(", ")}
                    </p>
                  ) : null}
                </div>
                <label className="grid gap-1 text-xs font-bold tracking-wide text-stone-500 uppercase">
                  Statut
                  <select
                    value={request.status}
                    onChange={(event) => handleStatusChange(request, event.target.value as Status)}
                    className="rounded-md border border-stone-200 bg-white px-2 py-2 text-sm font-semibold normal-case text-stone-900"
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RequestForm({
  isSaving,
  onSubmit,
}: {
  isSaving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:grid-cols-2">
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

function FormField({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={`grid gap-1.5 text-sm font-semibold ${className ?? ""}`}><span>{label}</span>{children}</label>;
}

function optionalValue(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || undefined;
}
