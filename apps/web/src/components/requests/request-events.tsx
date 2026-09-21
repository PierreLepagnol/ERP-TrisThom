import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { api } from "@ERPTrisThom/backend/convex/_generated/api";
import type { Id } from "@ERPTrisThom/backend/convex/_generated/dataModel";

type EventRow = FunctionReturnType<typeof api.requestEvents.list>[number];
type Fields = FunctionArgs<typeof api.requestEvents.create>["fields"];
const statuses: Record<Fields["status"], string> = {
  demandee: "Demandée", potentielle: "Potentielle", confirmee: "Confirmée", annulee: "Annulée",
};
const button = "rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold disabled:opacity-50";

export function RequestEvents({ requestId, events }: { requestId: Id<"requests">; events: EventRow[] | undefined }) {
  const create = useMutation(api.requestEvents.create);
  const update = useMutation(api.requestEvents.update);
  const remove = useMutation(api.requestEvents.remove);
  const [editor, setEditor] = useState<{ event?: EventRow }>();
  const [deleting, setDeleting] = useState<EventRow>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(fields: Fields) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (editor?.event) {
        await update({ requestId, eventId: editor.event._id ?? undefined, fields });
      } else {
        await create({ requestId, fields });
      }
      setEditor(undefined);
      toast.success("Prestation enregistrée");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enregistrement impossible.");
    } finally { setBusy(false); }
  }

  return <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-serif text-2xl font-bold">Prestations / dates</h2>
      <button type="button" disabled={!events || busy} className={button} onClick={() => { setError(""); setEditor({}); }}>+ Ajouter une prestation</button>
    </div>
    {!events ? <p className="mt-4 text-sm text-stone-500">Chargement des prestations…</p> : <div className="mt-4 space-y-3">
      {events.map(event => <article key={event._id ?? "historical"} className="rounded-lg border border-stone-200 bg-[#fffaf4] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{event.label}</p>
            <p className="mt-1 text-sm text-stone-700">
              {event.date != null ? new Date(event.date).toLocaleDateString("fr-FR") : "Date à préciser"}
              {[event.startTime, event.endTime].some(Boolean) ? " · " + [event.startTime || "?", event.endTime || "?"].join(" – ") : ""}
              {event.guestCount != null ? " · " + event.guestCount + " pers." : ""}
            </p>
            <p className="mt-1 break-words text-sm text-stone-600">{event.address || "Lieu à préciser"}</p>
            <p className="mt-1 text-xs text-stone-500">{[event.serviceType, event.format, statuses[event.status]].filter(Boolean).join(" · ")}</p>
            {event.notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-stone-600">{event.notes}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} className={button} onClick={() => { setError(""); setEditor({ event }); }}>Modifier</button>
            {events.length > 1 && event._id && <button type="button" disabled={busy} className={button + " text-red-700"} onClick={() => { setError(""); setDeleting(event); }}>Supprimer</button>}
          </div>
        </div>
      </article>)}
    </div>}
    {editor && <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="event-editor-title" className="mx-auto my-6 max-w-xl rounded-xl bg-white p-6 shadow-xl">
        <h3 id="event-editor-title" className="font-serif text-2xl font-bold">{editor.event ? "Modifier la prestation" : "Ajouter une prestation"}</h3>
        <EventForm initial={editor.event} busy={busy} error={error} save={save} close={() => setEditor(undefined)} />
      </section>
    </div>}
    {deleting && <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <section role="alertdialog" aria-modal="true" aria-labelledby="event-delete-title" aria-describedby="event-delete-description" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 id="event-delete-title" className="font-serif text-2xl font-bold">Supprimer la prestation ?</h3>
        <p id="event-delete-description" className="mt-3 text-sm">{deleting.label}{deleting.date != null ? " · " + new Date(deleting.date).toLocaleDateString("fr-FR") : ""}</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={busy} className={button} onClick={() => setDeleting(undefined)}>Annuler</button>
          <button type="button" disabled={busy} className={button + " bg-red-700 text-white"} onClick={async () => {
            if (busy || !deleting._id) return;
            setBusy(true); setError("");
            try {
              await remove({ requestId, eventId: deleting._id });
              setDeleting(undefined); toast.success("Prestation supprimée");
            } catch (cause) { setError(cause instanceof Error ? cause.message : "Suppression impossible."); }
            finally { setBusy(false); }
          }}>{busy ? "Suppression…" : "Supprimer"}</button>
        </div>
      </section>
    </div>}
  </section>;
}

function dateInput(timestamp?: number) {
  if (timestamp == null) return "";
  const date = new Date(timestamp);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function EventForm({ initial, busy, error, save, close }: {
  initial?: EventRow; busy: boolean; error: string; save: (fields: Fields) => Promise<void>; close: () => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim() || undefined;
    const date = text("date");
    await save({
      label: text("label") || "",
      date: date === dateInput(initial?.date) ? initial?.date : date ? new Date(date + "T12:00:00").getTime() : undefined,
      startTime: text("startTime"), endTime: text("endTime"), address: text("address"),
      guestCount: text("guestCount") !== undefined ? Number(text("guestCount")) : undefined,
      serviceType: text("serviceType"), format: text("format"), notes: text("notes"),
      status: text("status") as Fields["status"],
    });
  }
  return <form onSubmit={submit} className="mt-5">
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Libellé<input autoFocus required name="label" defaultValue={initial?.label ?? ""} className="input" /></label>
      <label className="grid gap-1 text-sm font-semibold">Date<input type="date" name="date" defaultValue={dateInput(initial?.date)} className="input" /></label>
      <label className="grid gap-1 text-sm font-semibold">Nombre de personnes<input type="number" min="0" step="1" name="guestCount" defaultValue={initial?.guestCount ?? ""} className="input" /></label>
      <label className="grid gap-1 text-sm font-semibold">Heure début<input type="time" name="startTime" defaultValue={initial?.startTime ?? ""} className="input" /></label>
      <label className="grid gap-1 text-sm font-semibold">Heure fin<input type="time" name="endTime" defaultValue={initial?.endTime ?? ""} className="input" /></label>
      <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Adresse<input name="address" defaultValue={initial?.address ?? ""} className="input" /></label>
      <label className="grid gap-1 text-sm font-semibold">Type de prestation<input name="serviceType" defaultValue={initial?.serviceType ?? ""} className="input" /></label>
      <label className="grid gap-1 text-sm font-semibold">Format<input name="format" defaultValue={initial?.format ?? ""} className="input" /></label>
      <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Notes<textarea name="notes" defaultValue={initial?.notes ?? ""} className="input min-h-24" /></label>
      <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Statut<select name="status" defaultValue={initial?.status ?? "demandee"} className="input">{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" className={button} onClick={close}>Annuler</button>
        <button type="submit" className={button + " bg-[#650d1c] text-white"}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </fieldset>
  </form>;
}
