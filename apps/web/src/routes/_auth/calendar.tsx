import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { requestStatusConfig } from "@/domain/request-status";
import { useConvexCrm } from "@/lib/convex-crm";
import type { LocalRequest } from "@/lib/local-crm";

export const Route = createFileRoute("/_auth/calendar")({ component: CalendarPage });

const fullDate = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function CalendarPage() {
  const { requests } = useConvexCrm();
  const [monthOffset, setMonthOffset] = useState(0);
  const selectedMonth = useMemo(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth() + monthOffset, 1);
  }, [monthOffset]);
  const monthRequests = requests.filter((request) => request.eventDate && isSameMonth(request.eventDate, selectedMonth));
  const upcoming = requests.filter((request) => (request.eventDate ?? 0) >= startOfToday()).sort(byEventDate);
  const calendarDays = buildCalendarDays(selectedMonth);

  return <div className="space-y-7">
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold tracking-[0.16em] text-[#7d6f67] uppercase">Planning commercial</p><h1 className="mt-1 font-serif text-4xl font-bold">Calendrier</h1><p className="mt-2 text-sm text-stone-600">Demandes datées, relances et prestations réunies dans une seule vue.</p></div>
      <div className="rounded-lg border border-stone-200 bg-white p-1 shadow-sm"><button type="button" onClick={() => setMonthOffset((value) => value - 1)} aria-label="Mois précédent" className="rounded-md p-2 text-stone-500 hover:bg-stone-100"><ChevronLeft className="size-5" /></button><button type="button" onClick={() => setMonthOffset(0)} className="rounded-md px-3 py-2 text-sm font-bold hover:bg-stone-100">Aujourd’hui</button><button type="button" onClick={() => setMonthOffset((value) => value + 1)} aria-label="Mois suivant" className="rounded-md p-2 text-stone-500 hover:bg-stone-100"><ChevronRight className="size-5" /></button></div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(19rem,.6fr)]">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-5 sm:px-6"><div><h2 className="font-serif text-2xl font-bold capitalize">{monthFormat.format(selectedMonth)}</h2><p className="mt-1 text-sm text-stone-500">{monthRequests.length} dossier{monthRequests.length > 1 ? "s" : ""} planifié{monthRequests.length > 1 ? "s" : ""} ce mois-ci</p></div><span className="rounded-full bg-[#f5ecee] px-3 py-1 text-xs font-bold text-[#8b1629]">Cliquez sur un dossier pour l’ouvrir</span></div>
        <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50">{weekDays.map((day) => <p key={day} className="px-2 py-3 text-center text-xs font-bold uppercase tracking-wide text-stone-400">{day}</p>)}</div>
        <div className="grid grid-cols-7">{calendarDays.map((date) => <CalendarDay key={date.toISOString()} date={date} currentMonth={selectedMonth.getMonth()} requests={requests.filter((request) => request.eventDate && isSameDay(request.eventDate, date))} />)}</div>
      </div>

      <aside className="space-y-5"><section className="rounded-xl bg-[#650d1c] p-6 text-white shadow-sm"><CalendarDays className="size-7 text-[#e4c982]" /><p className="mt-5 text-5xl font-bold">{upcoming.length}</p><p className="mt-1 text-sm text-white/70">prestation{upcoming.length > 1 ? "s" : ""} à venir</p><p className="mt-5 border-t border-white/15 pt-4 text-sm text-white/70">Les demandes non confirmées restent visibles : cela aide à anticiper la charge et les conflits possibles.</p></section><section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-serif text-xl font-bold">Prochainement</h2><p className="text-xs text-stone-500">Les cinq prochaines dates</p></div><CalendarDays className="size-5 text-[#8b1629]" /></div><div className="mt-3 divide-y divide-stone-100">{upcoming.length === 0 ? <p className="py-5 text-sm text-stone-500">Aucune date à venir.</p> : upcoming.slice(0, 5).map((request) => <EventCard key={request._id} request={request} />)}</div></section></aside>
    </section>
  </div>;
}

function CalendarDay({ date, currentMonth, requests }: { date: Date; currentMonth: number; requests: LocalRequest[] }) {
  const inMonth = date.getMonth() === currentMonth;
  const today = isSameDay(date.getTime(), new Date());
  return <div className={`min-h-28 border-b border-r border-stone-100 p-1.5 sm:min-h-32 sm:p-2 ${inMonth ? "bg-white" : "bg-stone-50/70"}`}><p className={`mb-1 grid size-6 place-items-center rounded-full text-xs font-bold ${today ? "bg-[#650d1c] text-white" : inMonth ? "text-stone-700" : "text-stone-300"}`}>{date.getDate()}</p><div className="space-y-1">{requests.slice(0, 2).map((request) => <Link key={request._id} to="/requests/$requestId" params={{ requestId: request._id }} title={`${request.contactName} — ${request.eventType ?? "Prestation à préciser"}`} className={`block truncate rounded px-1.5 py-1 text-[10px] font-bold leading-tight sm:text-xs ${requestStatusConfig[request.status].calendarClassName}`}>{request.contactName}</Link>)}{requests.length > 2 ? <p className="px-1 text-[10px] font-bold text-stone-500">+ {requests.length - 2} autres</p> : null}</div></div>;
}

function EventCard({ request }: { request: LocalRequest }) {
  return <Link to="/requests/$requestId" params={{ requestId: request._id }} className="block py-3 transition hover:text-[#8b1629]"><div className="flex items-start gap-3"><time className="w-11 shrink-0 pt-0.5 text-center text-xs font-bold capitalize text-[#8b1629]">{request.eventDate ? fullDate.format(request.eventDate).split(" ").slice(0, 2).join(" ") : "—"}</time><div className="min-w-0"><p className="truncate text-sm font-bold">{request.contactName}</p><p className="truncate text-xs text-stone-500">{request.eventType ?? "Prestation à préciser"}</p><div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-stone-500">{request.guestCount ? <span className="inline-flex items-center gap-1"><Users className="size-3" />{request.guestCount}</span> : null}{request.eventAddress ? <span className="inline-flex items-center gap-1"><MapPin className="size-3" />Lieu renseigné</span> : null}</div></div></div></Link>;
}

function startOfToday() { const date = new Date(); date.setHours(0, 0, 0, 0); return date.getTime(); }
function isSameMonth(timestamp: number, date: Date) { const current = new Date(timestamp); return current.getFullYear() === date.getFullYear() && current.getMonth() === date.getMonth(); }
function isSameDay(timestamp: number, date: Date) { const current = new Date(timestamp); return current.getFullYear() === date.getFullYear() && current.getMonth() === date.getMonth() && current.getDate() === date.getDate(); }
function byEventDate(a: LocalRequest, b: LocalRequest) { return (a.eventDate ?? 0) - (b.eventDate ?? 0); }
function buildCalendarDays(month: Date) { const first = new Date(month.getFullYear(), month.getMonth(), 1); const mondayOffset = (first.getDay() + 6) % 7; const start = new Date(first); start.setDate(first.getDate() - mondayOffset); return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; }); }
