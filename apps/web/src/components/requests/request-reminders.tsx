import { Check, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { openManualReminders } from "@/domain/request-reminders";
import type { LocalRequest } from "@/lib/local-crm";

export function RequestReminders({ request, onAdd, onComplete, onDelete }: {
  request: LocalRequest;
  onAdd: (title: string, dueAt: number) => Promise<void>;
  onComplete: (followUpId: string) => Promise<void>;
  onDelete: (followUpId: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const reminders = useMemo(() => openManualReminders([request]), [request]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dueAt = new Date(`${date}T12:00:00`).getTime();
    if (!Number.isFinite(dueAt)) return;
    await onAdd(title, dueAt);
    setTitle("");
    setDate("");
    setAdding(false);
  }

  return <section className="mt-5 border-t border-stone-100 pt-5">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-serif text-xl font-bold">Rappels</h3><p className="mt-1 text-sm text-stone-500">{reminders.length ? "" : "Aucun rappel."}</p></div><button type="button" onClick={() => setAdding((open) => !open)} className="text-sm font-bold text-[#8b1629]">{adding ? "Annuler" : "+ Ajouter"}</button></div>
    {adding ? <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 rounded-lg bg-stone-50 p-4 sm:grid-cols-[1fr_auto_auto]"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Action à faire" className="input" required maxLength={200} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="input" required /><button className="rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white">Ajouter</button></form> : null}
    {reminders.length ? <div className="mt-4 divide-y divide-stone-100">{reminders.map((reminder) => <div key={reminder.followUpId} className="flex items-center justify-between gap-3 py-3"><div><p className="font-semibold">{reminder.title}</p><time className="mt-1 block text-sm text-stone-500">{new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(reminder.dueAt)}</time></div><div className="flex gap-1"><button type="button" onClick={() => void onComplete(reminder.followUpId)} aria-label={`Terminer : ${reminder.title}`} className="rounded-md border border-stone-200 p-2 text-stone-600 hover:text-[#8b1629]"><Check className="size-4" /></button><button type="button" onClick={() => { if (window.confirm(`Supprimer le rappel « ${reminder.title} » ?`)) void onDelete(reminder.followUpId); }} aria-label={`Supprimer : ${reminder.title}`} className="rounded-md border border-stone-200 p-2 text-stone-500 hover:text-red-700"><Trash2 className="size-4" /></button></div></div>)}</div> : null}
  </section>;
}
