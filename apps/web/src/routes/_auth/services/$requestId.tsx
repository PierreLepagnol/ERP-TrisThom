import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ClipboardList, MapPin, Users } from "lucide-react";

import { getCurrentQuoteVersion } from "@/domain/service";
import { getRequestStage } from "@/domain/request-stage";
import { useConvexCrm } from "@/lib/convex-crm";

export const Route = createFileRoute("/_auth/services/$requestId")({ component: ServiceDetailPage });

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const moneyFormat = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

function ServiceDetailPage() {
  const { requestId } = Route.useParams();
  const { requests, archivedRequests, quotes } = useConvexCrm();
  const request = [...requests, ...archivedRequests].find((item) => item._id === requestId);
  const quote = quotes.find((item) => item.requestId === requestId);
  const version = getCurrentQuoteVersion(quote);

  if (!request || !["confirme", "termine"].includes(getRequestStage(request))) return <MissingService />;
  const followUp = request.followUps.filter((item) => !item.completedAt).sort((left, right) => left.dueAt - right.dueAt)[0];
  const nextAction = followUp?.title ?? (request.nextActionAt ? `Action prévue le ${dateFormat.format(request.nextActionAt)}` : "Aucune prochaine action planifiée");

  return <div className="space-y-5">
    <Link to="/services" className="inline-flex items-center gap-1 text-sm font-bold text-[#8b1629]"><ChevronLeft className="size-4" />Retour aux prestations</Link>
    <section className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-[.16em] text-[#7d6f67] uppercase">Dossier prestation</p><h1 className="mt-1 font-serif text-4xl font-bold">{request.eventType || "Prestation"}</h1><p className="mt-2 text-sm text-stone-600">{request.contactName}{request.organizationName ? ` · ${request.organizationName}` : ""}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800">{getRequestStage(request) === "termine" ? "Terminée" : "Confirmée"}</span></section>
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-serif text-2xl font-bold">Résumé</h2><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Fact label="Client" value={request.contactName} /><Fact label="Entreprise" value={request.organizationName || "Particulier"} /><Fact label="Date et horaires" value={`${request.eventDate ? dateFormat.format(request.eventDate) : "À confirmer"}${request.eventStartTime ? ` · ${request.eventStartTime}${request.eventEndTime ? ` – ${request.eventEndTime}` : ""}` : ""}`} /><Fact label="Adresse" value={request.eventAddress || request.venue || "À confirmer"} /><Fact label="Personnes" value={request.guestCount ? `${request.guestCount} personnes` : "À confirmer"} /><Fact label="Prochaine action" value={nextAction} /><Fact label="Devis" value={quote ? `${quote.quoteNumber} · ${moneyFormat.format(quote.totalTtcCents / 100)}` : "Aucun devis"} /></div></section>
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-serif text-2xl font-bold">Menu et quantités</h2>{version?.lines.length ? <div className="mt-4 divide-y divide-stone-100">{version.lines.map((line) => <div key={line.id} className="flex items-start justify-between gap-4 py-3"><div><p className="font-semibold">{line.label}</p>{line.details?.length ? <p className="mt-1 text-sm text-stone-500">{line.details.join(" · ")}</p> : null}</div><p className="shrink-0 text-sm font-bold">{line.quantity} {line.unit || "unité"}{line.unitPriceCents ? ` · ${moneyFormat.format(line.unitPriceCents / 100)}` : ""}</p></div>)}</div> : <EmptyState text="Le devis actuel ne contient pas encore de ligne à préparer." />}</section>
    <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-serif text-2xl font-bold">Préparation</h2><div className="mt-4 grid gap-3"><Fact label="Besoins particuliers" value={request.specialNeeds || "Aucun besoin particulier renseigné"} /><Fact label="Contraintes alimentaires" value={request.dietaryRequirements || "Aucune contrainte renseignée"} /><Fact label="Personnel ou matériel" value={request.staffingNeeds || "Aucun besoin renseigné"} /></div><EmptyState text="Les tâches de préparation et les achats seront ajoutés dans une prochaine passe." /></div><div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-serif text-2xl font-bold">Livraison</h2><p className="mt-4 inline-flex items-center gap-2 text-sm text-stone-600"><MapPin className="size-4 text-[#8b1629]" />{request.eventAddress || request.venue || "Adresse à confirmer"}</p><p className="mt-2 inline-flex items-center gap-2 text-sm text-stone-600"><Users className="size-4 text-[#8b1629]" />{request.guestCount ? `${request.guestCount} personnes` : "Nombre de personnes à confirmer"}</p><EmptyState text="Les éléments de livraison et la logistique seront ajoutés dans une prochaine passe." /></div></section>
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-bold tracking-wide text-stone-400 uppercase">{label}</p><p className="mt-1 text-sm font-semibold text-stone-700">{value}</p></div>; }
function EmptyState({ text }: { text: string }) { return <p className="mt-5 rounded-lg border border-dashed border-stone-200 bg-stone-50 p-4 text-sm text-stone-500">{text}</p>; }
function MissingService() { return <div className="rounded-xl border border-stone-200 bg-white p-8"><ClipboardList className="size-7 text-[#8b1629]" /><h1 className="mt-4 font-serif text-3xl font-bold">Prestation introuvable</h1><p className="mt-2 text-sm text-stone-600">Ce dossier n’est pas une prestation confirmée.</p><Link to="/services" className="mt-4 inline-block font-bold text-[#8b1629]">Retour aux prestations</Link></div>; }
