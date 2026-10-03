import { useMutation, useQuery } from "convex/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { api } from "@ERPTrisThom/backend/convex/_generated/api";
import type { Doc, Id } from "@ERPTrisThom/backend/convex/_generated/dataModel";
export function Purchases({ requestId }: { requestId: Id<"requests"> }) {
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
    {purchases === undefined ? <p className="mt-4 text-sm text-stone-500">Chargement des achats…</p> : purchases.length === 0 ? <EmptyState text="Aucun achat ajouté. Ajoutez les produits nécessaires à cette prestation." /> : <div className="mt-4 space-y-2">{purchases.map((purchase: Doc<"servicePurchases">) => <PurchaseRow key={purchase._id} purchase={purchase} onSave={(values) => updatePurchase({ requestId, purchaseId: purchase._id, ...values })} onDelete={() => deletePurchase({ requestId, purchaseId: purchase._id })} />)}</div>}
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

function EmptyState({ text }: { text: string }) { return <p className="mt-4 text-sm text-stone-500">{text}</p>; }
