import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CalendarDays } from "lucide-react";

import { requestPrimaryAction } from "@/domain/request-detail";
import { getRequestStage } from "@/domain/request-stage";
import { useConvexCrm } from "@/lib/convex-crm";

export const Route = createFileRoute("/_auth/dashboard")({ component: DashboardContent });

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

function DashboardContent() {
  const { requests } = useConvexCrm();
  const today = startOfToday();
  const actionRequests = requests
    .filter((request) => !["perdu", "termine"].includes(getRequestStage(request)))
    .sort((left, right) => (left.followUps.find((item) => !item.completedAt)?.dueAt ?? left.createdAt) - (right.followUps.find((item) => !item.completedAt)?.dueAt ?? right.createdAt))
    .slice(0, 6);
  const upcoming = requests
    .filter((request) => request.eventDate && request.eventDate >= today && !["perdu", "termine"].includes(getRequestStage(request)))
    .sort((left, right) => (left.eventDate ?? 0) - (right.eventDate ?? 0))
    .slice(0, 6);

  return <div className="space-y-7">
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold tracking-[0.16em] text-[#7d6f67] uppercase">Bouillon Comptoir</p><h1 className="mt-1 font-serif text-4xl font-bold">Accueil</h1><p className="mt-2 text-sm text-stone-600">Qu&apos;est-ce que je dois gérer maintenant ?</p></div>
      <Link to="/requests" className="rounded-md bg-[#650d1c] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#4e0613]">Voir les demandes</Link>
    </section>
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-serif text-2xl font-bold">À faire</h2><p className="mt-1 text-sm text-stone-500">Les dossiers qui demandent une action.</p></div><Link to="/requests" className="inline-flex items-center gap-1 text-sm font-bold text-[#8b1629]">Toutes les demandes <ArrowRight className="size-4" /></Link></div>
      {actionRequests.length === 0 ? <EmptyState label="Aucune action à traiter pour le moment." /> : <div className="mt-4 divide-y divide-stone-100">{actionRequests.map((request) => { const action = requestPrimaryAction(request); return <Link key={request._id} to="/requests/$requestId" params={{ requestId: request._id }} className="flex items-center justify-between gap-4 py-4 transition hover:text-[#8b1629]"><div className="min-w-0"><p className="font-semibold">{request.contactName}</p><p className="mt-1 truncate text-sm text-stone-500">{request.eventType || "Événement à préciser"}{request.eventDate ? ` · ${dateFormat.format(request.eventDate)}` : ""}{request.guestCount ? ` · ${request.guestCount} pers.` : ""}</p></div><p className="shrink-0 text-right text-sm font-bold text-[#8b1629]">→ {action.title}</p></Link>; })}</div>}
    </section>
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3"><div><h2 className="font-serif text-2xl font-bold">À venir</h2><p className="mt-1 text-sm text-stone-500">Les prochaines dates utiles.</p></div><Link to="/calendar" className="inline-flex items-center gap-1 text-sm font-bold text-[#8b1629]">Planning <CalendarDays className="size-4" /></Link></div>
      {upcoming.length === 0 ? <EmptyState label="Aucun événement à venir." /> : <div className="mt-4 divide-y divide-stone-100">{upcoming.map((request) => { const stage = getRequestStage(request); return <Link key={request._id} to="/requests/$requestId" params={{ requestId: request._id }} className="flex items-center justify-between gap-4 py-4 transition hover:text-[#8b1629]"><div><p className="font-semibold">{request.contactName}</p><p className="mt-1 text-sm text-stone-500">{request.eventType || "Événement à préciser"}{request.guestCount ? ` · ${request.guestCount} pers.` : ""}</p></div><div className="shrink-0 text-right"><time className="block text-sm font-bold">{request.eventDate ? dateFormat.format(request.eventDate) : "—"}</time><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${stage === "confirme" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{stage === "confirme" ? "Confirmée" : "Provisoire"}</span></div></Link>; })}</div>}
    </section>
  </div>;
}

function EmptyState({ label }: { label: string }) { return <p className="py-6 text-sm text-stone-500">{label}</p>; }
function startOfToday() { const date = new Date(); date.setHours(0, 0, 0, 0); return date.getTime(); }
