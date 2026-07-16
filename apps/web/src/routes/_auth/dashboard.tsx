import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, CircleAlert, Euro, FileText, TrendingUp } from "lucide-react";

import { useLocalCrm } from "@/lib/local-crm";

const statusLabels: Record<string, string> = {
  nouveau: "Nouvelles",
  a_qualifier: "À qualifier",
  devis_a_preparer: "À chiffrer",
  devis_envoye: "Envoyées",
  relance: "Relances",
};

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
  const { dashboard } = useLocalCrm();

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
                  <div>
                    <p className="font-semibold">{task.title}</p>
                    <p className="text-sm text-stone-500">Relance planifiée</p>
                  </div>
                  <time className="text-right text-sm font-bold text-[#8b1629]" dateTime={new Date(task.dueAt).toISOString()}>
                    {date.format(task.dueAt)}
                  </time>
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

      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="font-serif text-2xl font-bold">Pipeline actif</h2>
        <p className="text-sm text-stone-500">Répartition des dossiers en cours</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {dashboard.pipeline.map((item) => (
            <div key={item.status} className="border-t-4 border-[#d9c7cb] pt-3">
              <p className="text-3xl font-bold">{item.count}</p>
              <p className="mt-1 text-xs font-bold tracking-wide text-stone-500 uppercase">
                {statusLabels[item.status]}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
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
