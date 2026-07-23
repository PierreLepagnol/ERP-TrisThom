import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, ClipboardList, MapPin, Pencil, Plus, Trash2, Users } from "lucide-react";
import { FormEvent, useState } from "react";

import { api } from "@ERPTrisThom/backend/convex/_generated/api";
import type { Doc, Id } from "@ERPTrisThom/backend/convex/_generated/dataModel";
import { getRequestStage } from "@/domain/request-stage";
import { getCurrentQuoteVersion } from "@/domain/service";
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
    <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-serif text-2xl font-bold">Préparation</h2><div className="mt-4 grid gap-3"><Fact label="Besoins particuliers" value={request.specialNeeds || "Aucun besoin particulier renseigné"} /><Fact label="Contraintes alimentaires" value={request.dietaryRequirements || "Aucune contrainte renseignée"} /><Fact label="Personnel ou matériel" value={request.staffingNeeds || "Aucun besoin renseigné"} /></div><Purchases requestId={request._id as Id<"requests">} /></div><div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="font-serif text-2xl font-bold">Livraison</h2><p className="mt-4 inline-flex items-center gap-2 text-sm text-stone-600"><MapPin className="size-4 text-[#8b1629]" />{request.eventAddress || request.venue || "Adresse à confirmer"}</p><p className="mt-2 inline-flex items-center gap-2 text-sm text-stone-600"><Users className="size-4 text-[#8b1629]" />{request.guestCount ? `${request.guestCount} personnes` : "Nombre de personnes à confirmer"}</p><EmptyState text="Les éléments de livraison et la logistique seront ajoutés dans une prochaine passe." /></div></section>
  </div>;
}

function Purchases({ requestId }: { requestId: Id<"requests"> }) {
  const purchases = useQuery(api.crm.listServicePurchases, { requestId });
  const createPurchase = useMutation(api.crm.createServicePurchase);
  const updatePurchase = useMutation(api.crm.updateServicePurchase);
  const deletePurchase = useMutation(api.crm.deleteServicePurchase);
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("unité");
  const [supplier, setSupplier] = useState("");

  async function addPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createPurchase({ requestId, product, quantity: Number(quantity), unit, supplier: supplier || undefined });
    setProduct(""); setQuantity("1"); setUnit("unité"); setSupplier("");
  }

  return <section className="mt-6 border-t border-stone-100 pt-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-serif text-xl font-bold">Achats</h3><p className="text-sm text-stone-500">Produits à commander ou déjà achetés.</p></div><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-600">{purchases?.length ?? 0}</span></div>
    {purchases === undefined ? <p className="mt-4 text-sm text-stone-500">Chargement des achats…</p> : purchases.length === 0 ? <EmptyState text="Aucun achat ajouté. Ajoutez les produits nécessaires à cette prestation." /> : <div className="mt-4 space-y-2">{purchases.map((purchase) => <PurchaseRow key={purchase._id} purchase={purchase} onSave={(values) => updatePurchase({ requestId, purchaseId: purchase._id, ...values })} onDelete={() => deletePurchase({ requestId, purchaseId: purchase._id })} />)}</div>}
    <form onSubmit={(event) => void addPurchase(event)} className="mt-4 grid gap-2 rounded-lg bg-stone-50 p-3 sm:grid-cols-2"><input required value={product} onChange={(event) => setProduct(event.target.value)} placeholder="Produit" className="input" /><div className="grid grid-cols-[1fr_1.2fr] gap-2"><input required min="0.01" step="0.01" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label="Quantité" className="input" /><input required value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="Unité" className="input" /></div><input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Fournisseur (facultatif)" className="input" /><button className="inline-flex items-center justify-center gap-2 rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white"><Plus className="size-4" />Ajouter</button></form>
  </section>;
}

function PurchaseRow({ purchase, onSave, onDelete }: { purchase: Doc<"servicePurchases">; onSave: (values: { product: string; quantity: number; unit: string; supplier?: string; purchased: boolean }) => Promise<unknown>; onDelete: () => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [product, setProduct] = useState(purchase.product);
  const [quantity, setQuantity] = useState(String(purchase.quantity));
  const [unit, setUnit] = useState(purchase.unit);
  const [supplier, setSupplier] = useState(purchase.supplier ?? "");
  const save = async () => { await onSave({ product, quantity: Number(quantity), unit, supplier: supplier || undefined, purchased: purchase.purchased }); setEditing(false); };
  const togglePurchased = async () => { await onSave({ product: purchase.product, quantity: purchase.quantity, unit: purchase.unit, supplier: purchase.supplier, purchased: !purchase.purchased }); };

  return <article className="rounded-lg border border-stone-200 bg-white p-3">{editing ? <div className="grid gap-2 sm:grid-cols-2"><input value={product} onChange={(event) => setProduct(event.target.value)} className="input" /><div className="grid grid-cols-[1fr_1.2fr] gap-2"><input min="0.01" step="0.01" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="input" /><input value={unit} onChange={(event) => setUnit(event.target.value)} className="input" /></div><input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Fournisseur" className="input" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="px-3 py-2 text-sm font-bold">Annuler</button><button type="button" onClick={() => void save()} className="rounded-md bg-[#650d1c] px-3 py-2 text-sm font-bold text-white">Enregistrer</button></div></div> : <div className="flex items-start gap-3"><input type="checkbox" checked={purchase.purchased} onChange={() => void togglePurchased()} aria-label={`Marquer ${purchase.product} comme acheté`} className="mt-1 size-4 accent-[#650d1c]" /><div className="min-w-0 flex-1"><p className={`font-semibold ${purchase.purchased ? "text-stone-400 line-through" : ""}`}>{purchase.product} <span className="font-normal">· {purchase.quantity} {purchase.unit}</span></p><p className="mt-1 text-xs text-stone-500">{purchase.supplier || "Fournisseur à définir"} · {purchase.purchased ? "Acheté" : "À acheter"}</p></div><button type="button" onClick={() => setEditing(true)} aria-label={`Modifier ${purchase.product}`} className="p-1.5 text-stone-500 hover:text-[#8b1629]"><Pencil className="size-4" /></button><button type="button" onClick={() => void onDelete()} aria-label={`Supprimer ${purchase.product}`} className="p-1.5 text-stone-500 hover:text-red-700"><Trash2 className="size-4" /></button></div>}</article>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-bold tracking-wide text-stone-400 uppercase">{label}</p><p className="mt-1 text-sm font-semibold text-stone-700">{value}</p></div>; }
function EmptyState({ text }: { text: string }) { return <p className="mt-5 rounded-lg border border-dashed border-stone-200 bg-stone-50 p-4 text-sm text-stone-500">{text}</p>; }
function MissingService() { return <div className="rounded-xl border border-stone-200 bg-white p-8"><ClipboardList className="size-7 text-[#8b1629]" /><h1 className="mt-4 font-serif text-3xl font-bold">Prestation introuvable</h1><p className="mt-2 text-sm text-stone-600">Ce dossier n’est pas une prestation confirmée.</p><Link to="/services" className="mt-4 inline-block font-bold text-[#8b1629]">Retour aux prestations</Link></div>; }
