import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, MapPin, Users } from "lucide-react";

import { type LocalRequest, useLocalCrm } from "@/lib/local-crm";

export const Route = createFileRoute("/_auth/calendar")({ component: CalendarPage });

const formatDate = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function CalendarPage() {
  const { requests } = useLocalCrm();
  const now = Date.now();
  const upcoming = requests?.filter((request) => (request.eventDate ?? 0) >= now) ?? [];
  const past = requests?.filter((request) => (request.eventDate ?? 0) < now).reverse().slice(0, 8) ?? [];

  return (
    <div className="space-y-7">
      <section>
        <p className="text-xs font-bold tracking-[0.16em] text-[#7d6f67] uppercase">Planning</p>
        <h1 className="mt-1 font-serif text-4xl font-bold">Calendrier</h1>
        <p className="mt-2 text-sm text-stone-600">Les prestations datées, confirmées ou encore en préparation.</p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
        <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="font-serif text-2xl font-bold">À venir</h2>
          {!requests ? (
            <p className="py-8 text-sm text-stone-500">Chargement du planning…</p>
          ) : upcoming.length === 0 ? (
            <p className="py-8 text-sm text-stone-500">Aucune prestation à venir.</p>
          ) : (
            <div className="mt-4 divide-y divide-stone-100">
              {upcoming.map((request) => <EventCard key={request._id} request={request} />)}
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-stone-200 bg-[#4e0613] p-6 text-white shadow-sm">
          <CalendarDays className="size-7 text-[#e4c982]" />
          <p className="mt-5 text-5xl font-bold">{upcoming.length}</p>
          <p className="mt-1 text-sm text-white/70">prestation{upcoming.length > 1 ? "s" : ""} à venir</p>
          <div className="mt-8 border-t border-white/15 pt-5">
            <h2 className="font-serif text-xl font-bold">Dernières prestations</h2>
            {past.length === 0 ? (
              <p className="mt-3 text-sm text-white/60">Aucun historique.</p>
            ) : past.map((request) => (
              <div key={request._id} className="mt-3 text-sm">
                <p className="font-semibold">{request.contactName}</p>
                <p className="text-white/60">{formatDate.format(request.eventDate)}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

function EventCard({ request }: { request: LocalRequest }) {
  return (
    <article className="grid gap-3 py-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <time className="text-sm font-bold capitalize text-[#8b1629]">{formatDate.format(request.eventDate)}</time>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{request.contactName}</h3>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold">{request.status.replaceAll("_", " ")}</span>
        </div>
        <p className="mt-1 text-sm text-stone-600">{request.eventType ?? "Prestation à préciser"}</p>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-stone-500">
          {request.guestCount ? <span className="flex items-center gap-1"><Users className="size-3.5" />{request.guestCount} personnes</span> : null}
          {request.eventAddress ? <span className="flex items-center gap-1"><MapPin className="size-3.5" />{request.eventAddress}</span> : null}
        </div>
      </div>
    </article>
  );
}
