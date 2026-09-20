import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
  const candidates = useQuery(api.inboxEntries.candidates, {});
  const ignore = useMutation(api.inboxEntries.ignore); const attachEntry = useMutation(api.inboxEntries.attach); const createRequest = useMutation(api.inboxEntries.createRequest);
  const date = useMemo(() => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }), []);
  const ignoreRow = async (entry: Entry) => { await ignore({ inboxMessageId: entry._id as Id<"inboxMessages"> }); toast.success("Entrée ignorée"); };
  return <div className="space-y-5"><div><h1 className="font-serif text-4xl font-bold">Entrées</h1><p className="text-sm text-stone-600">Les e-mails reçus à traiter et à rattacher à vos dossiers.</p></div>
    <div className="flex gap-2"><button onClick={() => setProcessed(false)} className={!processed ? "rounded-full bg-[#650d1c] px-3 py-1.5 text-sm font-bold text-white" : "rounded-full bg-stone-100 px-3 py-1.5 text-sm font-bold"}>À traiter</button><button onClick={() => setProcessed(true)} className={processed ? "rounded-full bg-[#650d1c] px-3 py-1.5 text-sm font-bold text-white" : "rounded-full bg-stone-100 px-3 py-1.5 text-sm font-bold"}>Historique</button></div>
    {rows?.length === 0 ? <p>Tout est traité ✓</p> : <section className="overflow-hidden rounded-xl border bg-white">{rows?.map(entry => <article key={entry._id} className="space-y-3 border-b p-5"><div><strong>{entry.senderName || entry.senderEmail || "Expéditeur inconnu"}</strong><p className="text-sm text-stone-500">{entry.subject || "Sans objet"} · {date.format(entry.receivedAt ?? entry.createdAt)}</p><p id={`mail-${entry._id}`} className={`mt-2 whitespace-pre-wrap break-words text-sm ${expanded === entry._id ? "" : "line-clamp-5"}`}>{cleanInboxBody(entry.body)}</p></div><button onClick={() => setExpanded(expanded === entry._id ? undefined : entry._id)} aria-expanded={expanded === entry._id} aria-controls={`mail-${entry._id}`} className="text-sm font-semibold text-[#8b1629]">{expanded === entry._id ? "Réduire" : "Voir le mail"}</button>{!processed && <>
      <div className="flex flex-wrap gap-2"><button onClick={() => setCreate(entry)} className="rounded-lg bg-[#650d1c] px-3 py-2 text-sm font-bold text-white">Créer un dossier</button><button onClick={() => setAttach(entry)} className={button}>Rattacher à un dossier</button><button onClick={() => void ignoreRow(entry)} className={button}>Ignorer</button></div></>}
      </article>)}</section>}
    {create && <CreateForm entry={create} close={() => setCreate(undefined)} save={createRequest} />}{attach && <AttachForm entry={attach} candidates={candidates ?? []} close={() => setAttach(undefined)} save={attachEntry} />}
  </div>;
}

function CreateForm({ entry, close, save }: { entry: Entry; close: () => void; save: ReturnType<typeof useMutation> }) { const p = parse1001Request(entry.senderEmail, entry.subject, entry.body); return <Modal title="Créer le dossier" entry={entry} close={close}><form onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); await save({ inboxMessageId: entry._id as Id<"inboxMessages">, contactName: String(data.get("name")), contactEmail: String(data.get("email")) || undefined, contactPhone: String(data.get("phone")) || undefined, eventType: String(data.get("type")) || undefined, eventDate: data.get("date") ? new Date(`${data.get("date")}T12:00:00`).getTime() : undefined, eventAddress: String(data.get("address")) || undefined, guestCount: data.get("guests") ? Number(data.get("guests")) : undefined, budgetPerPersonCents: data.get("budget") ? Number(data.get("budget")) * 100 : undefined, specialNeeds: String(data.get("notes")) || undefined }); toast.success("Dossier créé"); close(); }} className="grid gap-3">{[["name", "Nom", p?.name || entry.senderName || ""], ["email", "E-mail", p?.email || entry.senderEmail || ""], ["phone", "Téléphone", p?.phone || ""], ["type", "Prestation", p?.eventType || ""], ["date", "Date", p?.eventDate?.split("/").reverse().join("-") || ""], ["address", "Lieu", p?.venue || ""], ["guests", "Personnes", p?.guests || ""], ["budget", "Budget / personne", p?.budgetPerPerson || ""], ["notes", "Format / notes", [p?.cateringMode, ...(p?.options || []), p?.customerMessage].filter(Boolean).join(" · ")]].map(([name, label, value]) => <label key={String(name)} className="grid gap-1 text-sm font-semibold">{label}<input className="input" name={String(name)} defaultValue={String(value)} type={name === "date" ? "date" : name === "guests" || name === "budget" ? "number" : "text"} /></label>)}<div className="flex justify-end gap-2"><button type="button" onClick={close}>Annuler</button><button className="rounded bg-[#650d1c] px-3 py-2 font-bold text-white">Créer le dossier</button></div></form></Modal>; }
function AttachForm({ entry, candidates, close, save }: { entry: Entry; candidates: Array<{ _id: string; label: string }>; close: () => void; save: ReturnType<typeof useMutation> }) { return <Modal title="Rattacher à un dossier" entry={entry} close={close}><form onSubmit={async event => { event.preventDefault(); const requestId = String(new FormData(event.currentTarget).get("requestId")); if (!requestId) return; await save({ inboxMessageId: entry._id as Id<"inboxMessages">, requestId: requestId as Id<"requests"> }); toast.success("E-mail rattaché"); close(); }} className="grid gap-4"><select className="input" name="requestId" defaultValue=""><option value="" disabled>Choisir un dossier</option>{candidates.map(candidate => <option key={candidate._id} value={candidate._id}>{candidate.label}</option>)}</select><div className="flex justify-end gap-2"><button type="button" onClick={close}>Annuler</button><button className="rounded bg-[#650d1c] px-3 py-2 font-bold text-white">Rattacher</button></div></form></Modal>; }
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
