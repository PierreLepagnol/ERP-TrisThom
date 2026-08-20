import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { normalizeRequestStatus } from "@/domain/request-status";
import { useConvexCrm } from "@/lib/convex-crm";
import type { LocalRequest } from "@/lib/local-crm";

export const Route = createFileRoute("/_auth/calendar")({ component: CalendarPage });

const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const weekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function CalendarPage() {
  const { requests } = useConvexCrm();
  const [monthOffset, setMonthOffset] = useState(0);
  const [dayOpen, setDayOpen] = useState<Date | null>(null);
  const selectedMonth = useMemo(() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth() + monthOffset, 1); }, [monthOffset]);
  const scheduled = requests.filter((request) => request.eventDate && !["termine", "refuse", "annule"].includes(normalizeRequestStatus(request.status)));
  const dayRequests = dayOpen ? scheduled.filter((request) => request.eventDate && isSameDay(request.eventDate, dayOpen)) : [];
  return <div className="space-y-6"><section className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.16em] text-[#7d6f67] uppercase">Bouillon Comptoir</p><h1 className="mt-1 font-serif text-4xl font-bold">Planning</h1><p className="mt-2 text-sm text-stone-600">Les prestations confirmées et les dates provisoires.</p></div><div className="rounded-lg border border-stone-200 bg-white p-1 shadow-sm"><button type="button" onClick={() => setMonthOffset((value) => value - 1)} aria-label="Mois précédent" className="rounded-md p-2 text-stone-500 hover:bg-stone-100"><ChevronLeft className="size-5" /></button><button type="button" onClick={() => setMonthOffset(0)} className="rounded-md px-3 py-2 text-sm font-bold hover:bg-stone-100">Aujourd&apos;hui</button><button type="button" onClick={() => setMonthOffset((value) => value + 1)} aria-label="Mois suivant" className="rounded-md p-2 text-stone-500 hover:bg-stone-100"><ChevronRight className="size-5" /></button></div></section><section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-5 sm:px-6"><h2 className="font-serif text-2xl font-bold capitalize">{monthFormat.format(selectedMonth)}</h2><div className="flex gap-3 text-xs font-bold"><span className="text-emerald-800">● Confirmée</span><span className="text-amber-800">● Provisoire</span></div></div><div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50">{weekDays.map((day) => <p key={day} className="px-2 py-3 text-center text-xs font-bold uppercase tracking-wide text-stone-400">{day}</p>)}</div><div className="grid grid-cols-7">{buildCalendarDays(selectedMonth).map((date) => <CalendarDay key={date.toISOString()} date={date} currentMonth={selectedMonth.getMonth()} requests={scheduled.filter((request) => request.eventDate && isSameDay(request.eventDate, date))} onOpen={() => setDayOpen(date)} />)}</div></section>{dayOpen ? <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><h2 className="font-serif text-xl font-bold">{dayOpen.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} — {dayRequests.length} dossiers</h2><button onClick={() => setDayOpen(null)} className="text-sm font-bold text-[#8b1629]">Fermer</button></div><div className="mt-4 divide-y divide-stone-100">{dayRequests.map((request) => <Link key={request._id} to="/requests/$requestId" params={{ requestId: request._id }} className="block py-3 hover:text-[#8b1629]"><strong>{request.contactName}</strong> · {normalizeRequestStatus(request.status) === "accepte" ? "Confirmé" : "Provisoire"}{request.guestCount ? ` · ${request.guestCount} pers.` : ""}</Link>)}</div></section> : null}</div>;
}

function CalendarDay({ date, currentMonth, requests, onOpen }: { date: Date; currentMonth: number; requests: LocalRequest[]; onOpen: () => void }) {
  const inMonth = date.getMonth() === currentMonth;
  const today = isSameDay(date.getTime(), new Date());
  return <div onClick={onOpen} className={`min-h-28 cursor-pointer border-b border-r border-stone-100 p-1.5 transition hover:bg-[#fffaf4] sm:min-h-32 sm:p-2 ${inMonth ? "bg-white" : "bg-stone-50/70"}`}><p className={`mb-1 grid size-6 place-items-center rounded-full text-xs font-bold ${today ? "bg-[#650d1c] text-white" : inMonth ? "text-stone-700" : "text-stone-300"}`}>{date.getDate()}</p><div className="space-y-1">{requests.slice(0, 2).map((request) => { const confirmed = normalizeRequestStatus(request.status) === "accepte"; return <Link onClick={(event) => event.stopPropagation()} key={request._id} to="/requests/$requestId" params={{ requestId: request._id }} title={`${request.contactName} — ${confirmed ? "Confirmée" : "Provisoire"}`} className={`block truncate rounded px-1.5 py-1 text-[10px] font-bold leading-tight transition sm:text-xs ${confirmed ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "bg-amber-50 text-amber-800 hover:bg-amber-100"}`}>{request.contactName}</Link>; })}{requests.length > 2 ? <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(); }} className="rounded px-1 text-[10px] font-bold text-[#8b1629] hover:bg-stone-100">+ {requests.length - 2} autres</button> : null}</div></div>;
}

function isSameDay(timestamp: number, date: Date) { const current = new Date(timestamp); return current.getFullYear() === date.getFullYear() && current.getMonth() === date.getMonth() && current.getDate() === date.getDate(); }
function buildCalendarDays(month: Date) { const first = new Date(month.getFullYear(), month.getMonth(), 1); const mondayOffset = (first.getDay() + 6) % 7; const start = new Date(first); start.setDate(first.getDate() - mondayOffset); return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; }); }
