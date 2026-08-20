import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Check } from "lucide-react";

import { openManualReminders } from "@/domain/request-reminders";
import { normalizeRequestStatus } from "@/domain/request-status";
import { RequestSourceBadge } from "@/components/crm/request-source-badge";
import { useConvexCrm } from "@/lib/convex-crm";

export const Route = createFileRoute("/_auth/dashboard")({ component: DashboardContent });

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

function DashboardContent() {
  const { requests, completeFollowUp } = useConvexCrm();
  const today = startOfToday();
  const reminders = openManualReminders(requests).slice(0, 8);
  const newRequests = requests.filter((request) => normalizeRequestStatus(request.status) === "nouveau").sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const upcoming = requests
    .filter((request) => {
      const status = normalizeRequestStatus(request.status);
      return Boolean(request.eventDate && request.eventDate >= today && !["termine", "refuse", "annule"].includes(status));
    })
    .sort((left, right) => (left.eventDate ?? 0) - (right.eventDate ?? 0))
    .slice(0, 6);

  return <div className="space-y-7">
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold tracking-[0.16em] text-[#7d6f67] uppercase">Bouillon Comptoir</p><h1 className="mt-1 font-serif text-4xl font-bold">Accueil</h1><p className="mt-2 text-sm text-stone-600">Votre journée chez Bouillon Comptoir</p></div>
      <Link to="/requests" className="rounded-md bg-[#650d1c] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#4e0613]">Voir les demandes</Link>
    </section>
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div><h2 className="font-serif text-2xl font-bold">À faire</h2><p className="mt-1 text-sm text-stone-500">Vos rappels manuels ouverts.</p></div>
      {reminders.length === 0 ? <EmptyState label="Aucun rappel à faire." /> : <div className="mt-4 divide-y divide-stone-100">{reminders.map((reminder) => <div key={reminder.followUpId} className="flex items-center justify-between gap-4 py-4"><Link to="/requests/$requestId" params={{ requestId: reminder.requestId }} className="min-w-0 transition hover:text-[#8b1629]"><p className="font-semibold">{reminder.title}</p><p className="mt-1 truncate text-sm text-stone-500">{reminder.requestName} · {dateFormat.format(reminder.dueAt)}</p></Link><button type="button" onClick={() => void completeFollowUp(reminder.requestId, reminder.followUpId)} aria-label={`Terminer : ${reminder.title}`} className="shrink-0 rounded-md border border-stone-200 p-2 text-stone-600 hover:border-[#8b1629] hover:text-[#8b1629]"><Check className="size-4" /></button></div>)}</div>}
    </section>
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center justify-between gap-3"><div><h2 className="font-serif text-2xl font-bold">Nouvelles demandes</h2><p className="mt-1 text-sm text-stone-500">Les dernières entrées à traiter.</p></div><Link to="/requests" className="text-sm font-bold text-[#8b1629]">Voir toutes</Link></div>{newRequests.length === 0 ? <EmptyState label="Aucune nouvelle demande." /> : <div className="mt-4 divide-y divide-stone-100">{newRequests.map((request) => <Link key={request._id} to="/requests/$requestId" params={{ requestId: request._id }} className="flex items-center justify-between gap-3 py-3 hover:text-[#8b1629]"><div><p className="font-semibold">{request.contactName}</p><p className="mt-1 text-sm text-stone-500">{request.eventType || "Événement à préciser"}{request.eventDate ? ` · ${dateFormat.format(request.eventDate)}` : ""}</p></div><RequestSourceBadge source={request.source} /></Link>)}</div>}</section>
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-serif text-2xl font-bold">À venir</h2><p className="mt-1 text-sm text-stone-500">Les prochaines dates utiles.</p></div><Link to="/calendar" className="inline-flex items-center gap-1 text-sm font-bold text-[#8b1629]">Planning <CalendarDays className="size-4" /></Link></div>
      {upcoming.length === 0 ? <EmptyState label="Aucun événement à venir." /> : <div className="mt-4 divide-y divide-stone-100">{upcoming.map((request) => { const confirmed = normalizeRequestStatus(request.status) === "accepte"; return <Link key={request._id} to="/requests/$requestId" params={{ requestId: request._id }} className="flex items-center justify-between gap-4 py-4 transition hover:text-[#8b1629]"><div><p className="font-semibold">{request.contactName}</p><p className="mt-1 text-sm text-stone-500">{request.eventType || "Événement à préciser"}{request.guestCount ? ` · ${request.guestCount} pers.` : ""}</p></div><div className="shrink-0 text-right"><time className="block text-sm font-bold">{request.eventDate ? dateFormat.format(request.eventDate) : "—"}</time><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${confirmed ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{confirmed ? "Confirmée" : "Provisoire"}</span></div></Link>; })}</div>}
    </section>
  </div>;
}

function EmptyState({ label }: { label: string }) { return <p className="py-6 text-sm text-stone-500">{label}</p>; }
function startOfToday() { const date = new Date(); date.setHours(0, 0, 0, 0); return date.getTime(); }
