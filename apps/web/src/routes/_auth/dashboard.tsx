import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CircleAlert, Euro, FileText, TrendingUp } from "lucide-react";
import { useState } from "react";

import { requestStatusConfig } from "@/domain/request-status";
import { useLocalCrm } from "@/lib/local-crm";

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const date = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardContent,
});

function DashboardContent() {
  const { dashboard, completeFollowUp } = useLocalCrm();
  const [monthOffset, setMonthOffset] = useState(0);

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[#7d6f67] uppercase">Pilotage commercial</p>
          <h1 className="mt-1 font-serif text-4xl font-bold">Vue d&apos;ensemble</h1>
          <p className="mt-2 text-sm text-stone-600">Les demandes, relances et prochains événements à suivre.</p>
        </div>
        <Link
          to="/requests"
          className="rounded-md bg-[#650d1c] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#4e0613]"
        >
          Gérer les demandes
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Demandes actives" value={dashboard.metrics.activeRequests} icon={CircleAlert} />
        <MetricCard label="Devis à préparer" value={dashboard.metrics.quotesToPrepare} icon={FileText} />
        <MetricCard label="Valeur du pipeline" value={euro.format(dashboard.metrics.pipelineCents / 100)} icon={Euro} />
        <MetricCard
          label="Taux de transformation"
          value={dashboard.metrics.conversionRate === null ? "—" : `${dashboard.metrics.conversionRate} %`}
          icon={TrendingUp}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
        <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-2xl font-bold">Priorités commerciales</h2>
              <p className="text-sm text-stone-500">Relances et prochaines actions</p>
            </div>
            <Link to="/requests" className="flex items-center gap-1 text-sm font-bold text-[#8b1629]">
              Voir les demandes <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="mt-5 divide-y divide-stone-100">
            {dashboard.priorities.length === 0 ? (
              <EmptyState label="Aucune relance à échéance dans les sept prochains jours." />
            ) : (
              dashboard.priorities.map((task) => (
                <div key={task._id} className="flex items-center justify-between gap-4 py-4">
                  <Link to="/requests/$requestId" params={{ requestId: task.requestId }} className="min-w-0">
                    <p className="font-semibold hover:text-[#8b1629]">{task.title}</p>
                    <p className="text-sm text-stone-500">Relance planifiée</p>
                  </Link>
                  <div className="flex items-center gap-3"><time className="text-right text-sm font-bold text-[#8b1629]" dateTime={new Date(task.dueAt).toISOString()}>{date.format(task.dueAt)}</time><button onClick={() => completeFollowUp(task.requestId, task._id)} aria-label={`Terminer ${task.title}`} className="rounded-full bg-emerald-50 p-2 text-emerald-700"><Check className="size-4" /></button></div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-2xl font-bold">Prochaines prestations</h2>
              <p className="text-sm text-stone-500">Planning à venir</p>
            </div>
            <CalendarDays className="size-5 text-[#8b1629]" />
          </div>
          <div className="mt-5 space-y-4">
            {dashboard.upcomingEvents.length === 0 ? (
              <EmptyState label="Aucun événement à venir." />
            ) : (
              dashboard.upcomingEvents.map((request) => (
                <div key={request._id} className="border-l-2 border-[#c7a75d] pl-3">
                  <p className="font-semibold">{request.eventType ?? "Prestation à préciser"}</p>
                  <p className="text-sm text-stone-600">{request.contactName}</p>
                  <p className="mt-1 text-xs font-bold tracking-wide text-[#8b1629] uppercase">
                    {request.eventDate ? date.format(request.eventDate) : "Date à confirmer"}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <MonthCalendar requests={dashboard.monthRequests} monthOffset={monthOffset} onPrevious={() => setMonthOffset((value) => value - 1)} onNext={() => setMonthOffset((value) => value + 1)} />

      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="font-serif text-2xl font-bold">Pipeline actif</h2>
        <p className="text-sm text-stone-500">Répartition des dossiers en cours</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {dashboard.pipeline.map((item) => (
            <div key={item.status} className="border-t-4 border-[#d9c7cb] pt-3">
              <p className="text-3xl font-bold">{item.count}</p>
              <p className="mt-1 text-xs font-bold tracking-wide text-stone-500 uppercase">
                {requestStatusConfig[item.status].label}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MonthCalendar({ requests, monthOffset, onPrevious, onNext }: { requests: ReturnType<typeof useLocalCrm>["dashboard"]["monthRequests"]; monthOffset: number; onPrevious: () => void; onNext: () => void }) {
  const month = new Date(); month.setDate(1); month.setMonth(month.getMonth() + monthOffset); const year = month.getFullYear(), monthIndex = month.getMonth();
  const firstDay = (month.getDay() + 6) % 7, daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, index) => index - firstDay + 1);
  const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(month);
  return <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-serif text-2xl font-bold">Vision du mois</h2><p className="capitalize text-sm text-stone-500">{label}</p></div><div className="flex gap-2"><button onClick={onPrevious} aria-label="Mois précédent" className="rounded-md border border-stone-200 p-2"><ArrowLeft className="size-4" /></button><button onClick={onNext} aria-label="Mois suivant" className="rounded-md border border-stone-200 p-2"><ArrowRight className="size-4" /></button></div></div><div className="mt-5 grid grid-cols-7 text-center text-xs font-bold text-stone-400">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => <div key={day} className="py-2">{day}</div>)}</div><div className="grid grid-cols-7 border-l border-t border-stone-100">{cells.map((day, index) => { const dayRequests = day > 0 && day <= daysInMonth ? requests.filter((request) => { const event = request.eventDate ? new Date(request.eventDate) : null; return event?.getFullYear() === year && event.getMonth() === monthIndex && event.getDate() === day; }) : []; return <div key={index} className="min-h-24 border-b border-r border-stone-100 p-2 text-left">{day > 0 && day <= daysInMonth && <><p className="text-xs font-bold text-stone-500">{day}</p>{dayRequests.slice(0, 2).map((request) => <Link key={request._id} to="/requests/$requestId" params={{ requestId: request._id }} className="mt-1 block truncate rounded bg-[#f5ecee] px-1.5 py-1 text-[11px] font-semibold text-[#8b1629]" title={`${request.contactName} — ${request.eventType ?? "Prestation"}`}>{request.contactName}</Link>)}{dayRequests.length > 2 && <p className="mt-1 text-[10px] text-stone-500">+ {dayRequests.length - 2} dossier(s)</p>}</>}</div>; })}</div><p className="mt-3 text-xs text-stone-500">Chaque étiquette ouvre le dossier correspondant. Les dates affichées incluent les demandes et prestations non archivées.</p></section>;
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof CircleAlert;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between text-sm font-semibold text-stone-500">
        {label}
        <Icon className="size-5 text-[#8b1629]" />
      </div>
      <p className="mt-4 font-serif text-4xl font-bold">{value}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="py-6 text-sm text-stone-500">{label}</p>;
}
