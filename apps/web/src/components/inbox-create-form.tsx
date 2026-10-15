import { useRef, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@ERPTrisThom/backend/convex/_generated/api";
import type { Id } from "@ERPTrisThom/backend/convex/_generated/dataModel";
import { toast } from "sonner";
import { siteEntryDefaults } from "@/domain/site-entry-defaults";
import { parse1001Request } from "@/domain/inbox-display";

type Entry = FunctionReturnType<typeof api.inboxEntries.list>[number];
type Candidate = FunctionReturnType<typeof api.inboxEntries.candidates>["page"][number];
type Row = {
  key: string; date: string; start: string; end: string; address: string; guests: string; type: string;
  existingRequestId?: Id<"requests">; existingName?: string; confirmDistinct: boolean;
};
function dateInput(value?: number) {
  return value === undefined ? "" : new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
function timestamp(value: string) { return value ? new Date(value + "T12:00:00").getTime() : undefined; }
const emptyRow = (): Row => ({ key: crypto.randomUUID(), date: "", start: "", end: "", address: "", guests: "", type: "", confirmDistinct: false });

export function InboxCreateForm({ entry, close }: { entry: Entry; close: () => void }) {
  const site = siteEntryDefaults(entry);
  const parsed = site ?? parse1001Request(entry.senderEmail, entry.subject, entry.body);
  const [common, setCommon] = useState({
    name: parsed?.name ?? entry.senderName ?? "", email: parsed?.email ?? entry.senderEmail ?? "",
    phone: parsed?.phone ?? "", organization: "", budget: parsed?.budgetPerPerson?.toString() ?? "",
    notes: site?.notes ?? [parsed?.cateringMode, ...(parsed?.options ?? []), parsed?.customerMessage].filter(Boolean).join(" · "),
    adminNotes: site?.adminNotes ?? "",
  });
  const [rows, setRows] = useState<Row[]>(() => [{
    ...emptyRow(), date: site?.eventDate ?? parsed?.eventDate?.split("/").reverse().join("-") ?? "",
    start: parsed?.startTime ?? "", address: parsed?.venue ?? "", guests: parsed?.guests?.toString() ?? "", type: parsed?.eventType ?? "",
  }]);
  const [token] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");
  const save = useMutation(api.inboxEntries.createRequests);
  const duplicates = useQuery(api.inboxEntries.duplicateCandidates, {
    contactName: common.name, contactEmail: common.email || undefined,
    dates: rows.map(row => timestamp(row.date) ?? null),
  });
  const patch = (key: string, values: Partial<Row>) => setRows(current => current.map(row => row.key === key ? { ...row, ...values } : row));
  const createdCount = rows.filter(row => !row.existingRequestId).length;
  const attachedCount = rows.length - createdCount;
  return <form className="space-y-5" onSubmit={async event => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setSaving(true); setError("");
    try {
      await save({
        inboxMessageId: entry._id, token, contactName: common.name, contactEmail: common.email || undefined,
        contactPhone: common.phone || undefined, organizationName: common.organization || undefined,
        budgetPerPersonCents: common.budget ? Math.round(Number(common.budget) * 100) : undefined,
        specialNeeds: common.notes || undefined, adminNotes: common.adminNotes || undefined,
        rows: rows.map(row => ({
          key: row.key, eventDate: timestamp(row.date), eventStartTime: row.start || undefined, eventEndTime: row.end || undefined,
          eventAddress: row.address || undefined, guestCount: row.guests ? Number(row.guests) : undefined,
          eventType: row.type || undefined, existingRequestId: row.existingRequestId, confirmDistinct: row.confirmDistinct,
        })),
      });
      toast.success(`${createdCount} dossier(s) créé(s), ${attachedCount} rattaché(s)`); close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Enregistrement impossible. Vous pouvez réessayer."); }
    finally { submitting.current = false; setSaving(false); }
  }}>
    <fieldset disabled={saving} className="space-y-5">
      <section className="grid gap-3">
        <h3 className="text-lg font-semibold">Informations communes du client</h3>
        {([["name", "Nom"], ["email", "E-mail"], ["phone", "Téléphone"], ["organization", "Société"], ["budget", "Budget / personne"]] as const).map(([name, label]) =>
          <label key={name} className="grid gap-1 text-sm font-semibold">{label}<input className="input" required={name === "name"} type={name === "budget" ? "number" : "text"} min={name === "budget" ? 0 : undefined} step={name === "budget" ? "0.01" : undefined} value={common[name]} onChange={event => { setCommon({ ...common, [name]: event.target.value }); if (name === "name" || name === "email") setRows(current => current.map(row => ({ ...row, confirmDistinct: false }))); }} /></label>)}
        <label className="grid gap-1 text-sm font-semibold">Format / informations complémentaires<textarea className="input min-h-24" value={common.notes} onChange={event => setCommon({ ...common, notes: event.target.value })} /></label>
        {site && <label className="grid gap-1 text-sm font-semibold">Notes administratives<textarea className="input" value={common.adminNotes} onChange={event => setCommon({ ...common, adminNotes: event.target.value })} /></label>}
        <p className="text-sm text-stone-600">Le message client original est conservé pour chaque dossier. Les nouveaux dossiers restent « À qualifier ».</p>
      </section>
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Prestations / Dates</h3>
        {rows.map((row, index) => {
          const repeated = row.date !== "" && rows.some(other => other.key !== row.key && other.date === row.date);
          const matches = duplicates?.[index] ?? [];
          return <div key={row.key} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>Prestation {index + 1}</strong><div className="flex gap-2">
              <button type="button" className="text-sm underline" disabled={rows.length >= 50} onClick={() => setRows(current => [...current, { ...row, key: crypto.randomUUID(), existingRequestId: undefined, existingName: undefined, confirmDistinct: false }])}>Dupliquer</button>
              <button type="button" className="text-sm underline" disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}>Supprimer</button>
            </div></div>
            {row.existingRequestId && <div className="rounded bg-stone-100 p-2 text-sm">Rattachement à {row.existingName}. Le dossier existant garde ses informations et son statut.<button type="button" className="ml-2 underline" onClick={() => patch(row.key, { existingRequestId: undefined, existingName: undefined, confirmDistinct: false })}>Créer un nouveau dossier à la place</button></div>}
            <fieldset disabled={Boolean(row.existingRequestId)} className="grid gap-3 sm:grid-cols-2">
              {([["date", "Date", "date"], ["start", "Début", "time"], ["end", "Fin", "time"], ["address", "Lieu", "text"], ["guests", "Personnes", "number"], ["type", "Prestation", "text"]] as const).map(([name, label, type]) => <label key={name} className="grid gap-1 text-sm font-semibold">{label}<input className="input" type={type} value={row[name]} min={name === "guests" ? 0 : undefined} step={name === "guests" ? 1 : undefined} required={name === "date" && rows.length > 1} onChange={event => patch(row.key, { [name]: event.target.value, confirmDistinct: false })} /></label>)}
            </fieldset>
            {!row.existingRequestId && <>
              {(matches.length > 0 || repeated) && <div className="space-y-2 rounded bg-amber-50 p-2 text-sm"><p>Doublon potentiel : même client et même date, ou date répétée dans ce formulaire.</p>
                {matches.map(candidate => <button key={candidate._id} type="button" className="block text-left underline" onClick={() => patch(row.key, targetRow(candidate))}>Rattacher : {candidate.contactName} · {candidate.eventType ?? "Prestation"} · {candidate.eventStartTime ?? "Sans horaire"} · {candidate.eventAddress ?? "Lieu non renseigné"}</button>)}
                <label className="flex items-start gap-2"><input type="checkbox" checked={row.confirmDistinct} onChange={event => patch(row.key, { confirmDistinct: event.target.checked })} />Je confirme qu’il s’agit d’une prestation distincte à cette date.</label>
              </div>}
              <ExistingRequestPicker select={candidate => patch(row.key, targetRow(candidate))} />
            </>}
          </div>;
        })}
        <button type="button" className="rounded-lg border px-3 py-2 text-sm font-semibold" disabled={rows.length >= 50} onClick={() => setRows(current => [...current, emptyRow()])}>Ajouter une date</button>
      </section>
      <p className="font-semibold">{createdCount} dossier(s) à créer{attachedCount ? ` et ${attachedCount} à rattacher` : ""}.</p>
      {error && <p role="alert" className="whitespace-pre-wrap text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" onClick={close}>Annuler</button><button type="submit" className="rounded bg-[#650d1c] px-3 py-2 font-bold text-white disabled:opacity-50" disabled={duplicates === undefined}>{saving ? "Enregistrement…" : createdCount ? `Créer ${createdCount} dossier${createdCount > 1 ? "s" : ""}${attachedCount ? ` et rattacher ${attachedCount}` : ""}` : `Rattacher ${attachedCount} dossier(s)`}</button></div>
    </fieldset>
  </form>;
}
function targetRow(candidate: Pick<Candidate, "_id" | "contactName" | "eventDate" | "eventStartTime" | "eventEndTime" | "eventAddress" | "guestCount" | "eventType">): Partial<Row> {
  return { existingRequestId: candidate._id, existingName: candidate.contactName, date: dateInput(candidate.eventDate), start: candidate.eventStartTime ?? "", end: candidate.eventEndTime ?? "", address: candidate.eventAddress ?? "", guests: candidate.guestCount?.toString() ?? "", type: candidate.eventType ?? "", confirmDistinct: false };
}
function ExistingRequestPicker({ select }: { select: (candidate: Candidate) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { results, status, loadMore } = usePaginatedQuery(api.inboxEntries.candidates, open ? { search, history: false } : "skip", { initialNumItems: 100 });
  return <div className="space-y-2 text-sm">
    <button type="button" className="underline" onClick={() => setOpen(!open)}>{open ? "Fermer la recherche" : "Rattacher cette date à un dossier existant"}</button>
    {open && <><input className="input w-full" aria-label="Rechercher un dossier existant" placeholder="Nom, e-mail, société…" value={search} onChange={event => setSearch(event.target.value)} />
      <div className="max-h-48 space-y-1 overflow-y-auto">{results.filter(candidate => candidate.eventDate !== undefined).map(candidate => <button key={candidate._id} type="button" className="block w-full rounded border p-2 text-left" onClick={() => select(candidate)}>{candidate.contactName} · {dateInput(candidate.eventDate)} · {candidate.eventType ?? "Prestation"} · {candidate.eventAddress ?? "Lieu non renseigné"}</button>)}</div>
      {status === "CanLoadMore" && <button type="button" className="underline" onClick={() => loadMore(100)}>Afficher davantage</button>}
      {status === "Exhausted" && results.length === 0 && <p>Aucun dossier trouvé.</p>}
    </>}
  </div>;
}
