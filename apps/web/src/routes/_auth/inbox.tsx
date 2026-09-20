import { createFileRoute } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { requestStatusConfig } from "@/domain/request-status";
import { api } from "@ERPTrisThom/backend/convex/_generated/api";
import type { Id } from "@ERPTrisThom/backend/convex/_generated/dataModel";
import { cleanInboxBody, parse1001Request } from "@/domain/inbox-display";
import { useBouillonSiteTools } from "@/lib/bouillon-site-tools";

export const Route = createFileRoute("/_auth/inbox")({ component: InboxPage });
type Entry = { _id: string; senderName?: string; senderEmail?: string; subject?: string; body?: string; receivedAt?: number; createdAt: number };
const button = "rounded-lg border px-3 py-2 text-sm font-semibold";

function InboxPage() {
  useBouillonSiteTools();
  const [processed, setProcessed] = useState(false); const [expanded, setExpanded] = useState<string>(); const [create, setCreate] = useState<Entry>(); const [attach, setAttach] = useState<Entry>();
  const rows = useQuery(api.inboxEntries.list, { processed }) as Entry[] | undefined;
  const ignore = useMutation(api.inboxEntries.ignore); const attachEntry = useMutation(api.inboxEntries.attach); const createRequest = useMutation(api.inboxEntries.createRequest);
  const date = useMemo(() => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }), []);
  const ignoreRow = async (entry: Entry) => { await ignore({ inboxMessageId: entry._id as Id<"inboxMessages"> }); toast.success("Entrée ignorée"); };
  return <div className="space-y-5"><div><h1 className="font-serif text-4xl font-bold">Entrées</h1><p className="text-sm text-stone-600">Les e-mails reçus à traiter et à rattacher à vos dossiers.</p></div>
    <div className="flex gap-2"><button onClick={() => setProcessed(false)} className={!processed ? "rounded-full bg-[#650d1c] px-3 py-1.5 text-sm font-bold text-white" : "rounded-full bg-stone-100 px-3 py-1.5 text-sm font-bold"}>À traiter</button><button onClick={() => setProcessed(true)} className={processed ? "rounded-full bg-[#650d1c] px-3 py-1.5 text-sm font-bold text-white" : "rounded-full bg-stone-100 px-3 py-1.5 text-sm font-bold"}>Historique</button></div>
    {rows?.length === 0 ? <p>Tout est traité ✓</p> : <section className="overflow-hidden rounded-xl border bg-white">{rows?.map(entry => <article key={entry._id} className="space-y-3 border-b p-5"><div><strong>{entry.senderName || entry.senderEmail || "Expéditeur inconnu"}</strong><p className="text-sm text-stone-500">{entry.subject || "Sans objet"} · {date.format(entry.receivedAt ?? entry.createdAt)}</p><p id={`mail-${entry._id}`} className={`mt-2 whitespace-pre-wrap break-words text-sm ${expanded === entry._id ? "" : "line-clamp-5"}`}>{cleanInboxBody(entry.body)}</p></div><button onClick={() => setExpanded(expanded === entry._id ? undefined : entry._id)} aria-expanded={expanded === entry._id} aria-controls={`mail-${entry._id}`} className="text-sm font-semibold text-[#8b1629]">{expanded === entry._id ? "Réduire" : "Voir le mail"}</button>{!processed && <>
      <div className="flex flex-wrap gap-2"><button onClick={() => setCreate(entry)} className="rounded-lg bg-[#650d1c] px-3 py-2 text-sm font-bold text-white">Créer un dossier</button><button onClick={() => setAttach(entry)} className={button}>Rattacher à un dossier</button><button onClick={() => void ignoreRow(entry)} className={button}>Ignorer</button></div></>}
      </article>)}</section>}
    {create && <CreateForm entry={create} close={() => setCreate(undefined)} save={createRequest} />}{attach && <AttachForm entry={attach} close={() => setAttach(undefined)} save={attachEntry} />}
  </div>;
}

function CreateForm({ entry, close, save }: { entry: Entry; close: () => void; save: ReturnType<typeof useMutation> }) { const p = parse1001Request(entry.senderEmail, entry.subject, entry.body); return <Modal title="Créer le dossier" entry={entry} close={close}><form onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); await save({ inboxMessageId: entry._id as Id<"inboxMessages">, contactName: String(data.get("name")), contactEmail: String(data.get("email")) || undefined, contactPhone: String(data.get("phone")) || undefined, eventType: String(data.get("type")) || undefined, eventDate: data.get("date") ? new Date(`${data.get("date")}T12:00:00`).getTime() : undefined, eventAddress: String(data.get("address")) || undefined, guestCount: data.get("guests") ? Number(data.get("guests")) : undefined, budgetPerPersonCents: data.get("budget") ? Number(data.get("budget")) * 100 : undefined, specialNeeds: String(data.get("notes")) || undefined }); toast.success("Dossier créé"); close(); }} className="grid gap-3">{[["name", "Nom", p?.name || entry.senderName || ""], ["email", "E-mail", p?.email || entry.senderEmail || ""], ["phone", "Téléphone", p?.phone || ""], ["type", "Prestation", p?.eventType || ""], ["date", "Date", p?.eventDate?.split("/").reverse().join("-") || ""], ["address", "Lieu", p?.venue || ""], ["guests", "Personnes", p?.guests || ""], ["budget", "Budget / personne", p?.budgetPerPerson || ""], ["notes", "Format / notes", [p?.cateringMode, ...(p?.options || []), p?.customerMessage].filter(Boolean).join(" · ")]].map(([name, label, value]) => <label key={String(name)} className="grid gap-1 text-sm font-semibold">{label}<input className="input" name={String(name)} defaultValue={String(value)} type={name === "date" ? "date" : name === "guests" || name === "budget" ? "number" : "text"} /></label>)}<div className="flex justify-end gap-2"><button type="button" onClick={close}>Annuler</button><button className="rounded bg-[#650d1c] px-3 py-2 font-bold text-white">Créer le dossier</button></div></form></Modal>; }
type Candidate = FunctionReturnType<typeof api.inboxEntries.candidates>["page"][number];

function AttachForm({ entry, close, save }: { entry: Entry; close: () => void; save: ReturnType<typeof useMutation<typeof api.inboxEntries.attach>> }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [history, setHistory] = useState(false);
  const [selected, setSelected] = useState<Candidate>();
  const [wanted, setWanted] = useState(20);
  const [saving, setSaving] = useState(false);
  const { results, status, loadMore } = usePaginatedQuery(
    api.inboxEntries.candidates,
    { search: debouncedSearch, history },
    { initialNumItems: 100 },
  );
  useEffect(() => {
    const timeout = setTimeout(() => { setDebouncedSearch(search); setWanted(20); }, 250);
    return () => clearTimeout(timeout);
  }, [search]);
  // Continue through empty pages so a match beyond the first 300 dossiers is found.
  useEffect(() => {
    if (!selected && search === debouncedSearch && results.length < wanted && status === "CanLoadMore") loadMore(100);
  }, [selected, search, debouncedSearch, results.length, wanted, status, loadMore]);
  const searching = search !== debouncedSearch || status === "LoadingFirstPage" || status === "LoadingMore" || (results.length < wanted && status === "CanLoadMore");

  return <Modal title="Rattacher à un dossier" entry={entry} close={() => { if (!saving) close(); }}>
    {selected ? <AttachEditor key={selected._id} candidate={selected} entry={entry} save={save} saving={saving} setSaving={setSaving} back={() => setSelected(undefined)} close={close} /> : <div className="space-y-4">
      <label className="grid gap-1 text-sm font-semibold">Rechercher un dossier
        <input className="input" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Contact, société, e-mail, événement…" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{history ? "Anciens dossiers" : "Dossiers actifs"}</p>
        <button type="button" className="text-sm font-semibold text-[#8b1629]" onClick={() => { setHistory(!history); setWanted(20); }}>
          {history ? "Afficher les dossiers actifs" : "Afficher les anciens dossiers"}
        </button>
      </div>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto" aria-busy={searching}>
        {search === debouncedSearch && results.slice(0, wanted).map(candidate => <button type="button" key={candidate._id} onClick={() => setSelected(candidate)} className="block w-full rounded-lg border p-3 text-left text-sm hover:border-[#650d1c] hover:bg-stone-50">
          {candidate.organizationName && <p className="font-bold">{candidate.organizationName}</p>}
          <p className="font-semibold">{candidate.contactName}</p>
          <p className="text-stone-600">{candidate.eventType || "Événement non renseigné"}</p>
          <p className="text-stone-600">{[candidate.eventDate != null ? new Date(candidate.eventDate).toLocaleDateString("fr-FR") : undefined, candidate.guestCount != null ? candidate.guestCount + " personnes" : undefined].filter(Boolean).join(" · ")}</p>
          <span className={"mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold " + requestStatusConfig[candidate.status].badgeClassName}>
            {requestStatusConfig[candidate.status].label}{candidate.archivedAt != null ? " · Archivé" : ""}
          </span>
        </button>)}
        {searching && <p role="status" className="text-sm text-stone-500">Recherche en cours…</p>}
        {!searching && results.length === 0 && <p className="text-sm text-stone-600">Aucun dossier trouvé.{!history && " Essayez les anciens dossiers."}</p>}
      </div>
      {!searching && (results.length > wanted || status === "CanLoadMore") && <button type="button" className={button} onClick={() => setWanted(wanted + 20)}>Afficher plus de dossiers</button>}
    </div>}
  </Modal>;
}

const attachFields = [
  { name: "contactName", label: "Contact", type: "text" },
  { name: "contactEmail", label: "E-mail", type: "email" },
  { name: "contactPhone", label: "Téléphone", type: "tel" },
  { name: "organizationName", label: "Société", type: "text" },
  { name: "eventType", label: "Type d’événement", type: "text" },
  { name: "eventDate", label: "Date", type: "date" },
  { name: "eventStartTime", label: "Heure de début", type: "time" },
  { name: "eventEndTime", label: "Heure de fin", type: "time" },
  { name: "eventAddress", label: "Adresse", type: "text" },
  { name: "guestCount", label: "Nombre de personnes", type: "number" },
  { name: "budgetCents", label: "Budget total (€)", type: "number" },
  { name: "budgetPerPersonCents", label: "Budget par personne (€)", type: "number" },
  { name: "specialNeeds", label: "Besoins particuliers", type: "textarea" },
] as const;

function attachFieldValue(candidate: Candidate, name: typeof attachFields[number]["name"]) {
  const value = candidate[name];
  if (value == null) return "";
  if (name === "eventDate") {
    const date = new Date(Number(value));
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }
  if (name === "budgetCents" || name === "budgetPerPersonCents") return String(Number(value) / 100);
  return String(value);
}

function AttachEditor({ candidate, entry, save, saving, setSaving, back, close }: {
  candidate: Candidate; entry: Entry; save: ReturnType<typeof useMutation<typeof api.inboxEntries.attach>>;
  saving: boolean; setSaving: (value: boolean) => void; back: () => void; close: () => void;
}) {
  const updateRequest = useMutation(api.crm.updateRequest);
  const [error, setError] = useState("");
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const changes: FunctionArgs<typeof api.crm.updateRequest>["changes"] = {};
    for (const field of attachFields) {
      const value = String(data.get(field.name) ?? "");
      if (value === attachFieldValue(candidate, field.name)) continue;
      const parsed = value === "" ? null : field.type === "date" ? new Date(value + "T12:00:00").getTime()
        : field.type === "number" ? (field.name === "guestCount" ? Number(value) : Math.round(Number(value) * 100)) : value;
      Object.assign(changes, { [field.name]: parsed });
    }
    setSaving(true); setError("");
    let updated = false;
    try {
      if (Object.keys(changes).length) {
        await updateRequest({ requestId: candidate._id, changes });
        updated = true;
      }
      await save({ inboxMessageId: entry._id as Id<"inboxMessages">, requestId: candidate._id });
      toast.success("E-mail rattaché et dossier enregistré");
      close();
    } catch (cause) {
      setError((updated ? "Les modifications du dossier sont enregistrées, mais le rattachement a échoué. " : "") + (cause instanceof Error ? cause.message : "Enregistrement impossible."));
    } finally { setSaving(false); }
  }}>
    <fieldset disabled={saving} className="space-y-3">
      <button type="button" className="text-sm font-semibold text-[#8b1629]" onClick={back}>Changer de dossier</button>
      <p className="text-sm text-stone-600">Corrigez les informations nécessaires avant de rattacher le mail.</p>
      {attachFields.map(field => <label key={field.name} className="grid gap-1 text-sm font-semibold">
        {field.label}
        {field.type === "textarea"
          ? <textarea className="input min-h-24" name={field.name} defaultValue={attachFieldValue(candidate, field.name)} />
          : <input className="input" name={field.name} type={field.type} required={field.name === "contactName"} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? field.name === "guestCount" ? 1 : "0.01" : undefined} defaultValue={attachFieldValue(candidate, field.name)} />}
      </label>)}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={close}>Annuler</button>
        <button type="submit" className="rounded bg-[#650d1c] px-3 py-2 font-bold text-white disabled:opacity-50">{saving ? "Enregistrement…" : "Rattacher le mail et enregistrer"}</button>
      </div>
    </fieldset>
  </form>;
}

function Modal({ title, entry, close, children }: { title: string; entry: Entry; close: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-50 overflow-auto bg-black/30 p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="inbox-dialog-title" className="mx-auto my-4 max-w-6xl rounded-xl bg-white p-6 md:my-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id="inbox-dialog-title" className="font-serif text-2xl font-bold">{title}</h2>
        <button onClick={close}>Fermer</button>
      </div>
      <div className="grid items-start gap-6 md:grid-cols-2">
        <section className="min-w-0 rounded-lg border bg-stone-50 p-4 md:sticky md:top-4">
          <h3 className="font-serif text-xl font-bold">E-mail reçu</h3>
          <div className="mt-3 select-text break-words text-sm">
            <p className="font-semibold">{entry.senderName || entry.senderEmail || "Expéditeur inconnu"}</p>
            {entry.senderName && entry.senderEmail && <p className="text-stone-600">{entry.senderEmail}</p>}
            <p className="mt-1 font-semibold">{entry.subject || "Sans objet"}</p>
          </div>
          <div tabIndex={0} aria-label="Contenu de l’e-mail" className="mt-4 max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words select-text text-sm leading-relaxed md:max-h-[65vh]">
            {cleanInboxBody(entry.body)}
          </div>
        </section>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  </div>;
}
