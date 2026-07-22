import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, Users } from "lucide-react";

import { getOperationalServices } from "@/domain/service";
import { useConvexCrm } from "@/lib/convex-crm";
import type { LocalRequest } from "@/lib/local-crm";

export const Route = createFileRoute("/_auth/services")({ component: ServicesPage });

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function ServicesPage() {
  const { requests, archivedRequests } = useConvexCrm();
  const { upcoming, recentlyCompleted } = getOperationalServices([...requests, ...archivedRequests]);

  return <div className="space-y-7">
    <section>
      <p className="text-xs font-bold tracking-[.16em] text-[#7d6f67] uppercase">Suivi opérationnel</p>
      <h1 className="mt-1 font-serif text-4xl font-bold">Prestations</h1>
      <p className="mt-2 text-sm text-stone-600">Les dossiers confirmés à préparer et les prestations récemment terminées.</p>
    </section>
    <ServiceSection title="Prestations confirmées à venir" description="À préparer avant le jour J" requests={upcoming} empty="Aucune prestation confirmée à venir." />
    <ServiceSection title="Prestations terminées récemment" description="Les 30 derniers jours" requests={recentlyCompleted} empty="Aucune prestation terminée récemment." />
  </div>;
}

function ServiceSection({ title, description, requests, empty }: { title: string; description: string; requests: LocalRequest[]; empty: string }) {
  return <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 px-5 py-5 sm:px-6"><div><h2 className="font-serif text-2xl font-bold">{title}</h2><p className="mt-1 text-sm text-stone-500">{description}</p></div><span className="rounded-full bg-[#f5ecee] px-3 py-1 text-xs font-bold text-[#8b1629]">{requests.length}</span></header>
    {requests.length === 0 ? <p className="px-6 py-8 text-sm text-stone-500">{empty}</p> : <div className="divide-y divide-stone-100">{requests.map((request) => <Link key={request._id} to="/services/$requestId" params={{ requestId: request._id }} className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-[#fffaf4] sm:px-6"><div className="min-w-0"><p className="truncate font-bold">{request.eventType || "Prestation à préciser"}</p><p className="mt-1 truncate text-sm text-stone-500">{request.contactName}{request.organizationName ? ` · ${request.organizationName}` : ""}</p><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500"><span className="inline-flex items-center gap-1"><CalendarDays className="size-3.5" />{request.eventDate ? dateFormat.format(request.eventDate) : "Date à confirmer"}</span>{request.guestCount ? <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{request.guestCount} personnes</span> : null}</div></div><ChevronRight className="size-5 shrink-0 text-stone-300" /></Link>)}</div>}
  </section>;
}
