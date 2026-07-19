import { createFileRoute } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useConvexCrm } from "@/lib/convex-crm";
import type { CatalogItem } from "@/lib/local-crm";

export const Route = createFileRoute("/_auth/catalog")({ component: CatalogPage });

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const list = (value?: string[]) => value?.join(", ") ?? "";

function CatalogPage() {
  const { catalog, saveCatalogItem, deleteCatalogItem } = useConvexCrm();
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [creating, setCreating] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = (name: string) => String(data.get(name) ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const foodCost = String(data.get("foodCost") ?? "").trim();
    const item: CatalogItem = {
      id: editing?.id ?? crypto.randomUUID(),
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
      details: String(data.get("details") ?? "").split("\n").map((value) => value.trim()).filter(Boolean),
      category: String(data.get("category") ?? "Prestation").trim(),
      unit: String(data.get("unit") ?? "forfait").trim(),
      unitPriceCents: Math.round(Number(data.get("price") ?? 0) * 100),
      foodCostCents: foodCost ? Math.round(Number(foodCost) * 100) : undefined,
      vatRate: Number(data.get("vatRate") ?? 10),
      active: true,
      seasonality: values("seasonality"),
      dietary: values("dietary"),
      allergens: values("allergens"),
      minimumQuantity: Number(data.get("minimumQuantity") ?? 1),
      productionMinutes: Number(data.get("productionMinutes") ?? 0),
      capacityPerDay: Number(data.get("capacityPerDay") ?? 0),
      recommendedFor: values("recommendedFor"),
    };
    if (!item.name) return;
    await saveCatalogItem(item);
    setEditing(null);
    setCreating(false);
    toast.success("Article enregistré");
  };

  return <div className="space-y-6">
    <section className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold tracking-[.16em] text-[#7d6f67] uppercase">Base de chiffrage & production</p>
        <h1 className="mt-1 font-serif text-4xl font-bold">Catalogue enrichi</h1>
        <p className="mt-2 text-sm text-stone-600">Vente, coût matière provisoire, saisonnalité, régimes, allergènes et capacité.</p>
      </div>
      <button onClick={() => { setEditing(null); setCreating(true); }} className="inline-flex items-center gap-2 rounded-md bg-[#650d1c] px-4 py-2.5 text-sm font-bold text-white"><Plus className="size-4" />Ajouter un article</button>
    </section>
    {(creating || editing) && <CatalogForm item={editing} onCancel={() => { setEditing(null); setCreating(false); }} onSubmit={submit} />}
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="divide-y divide-stone-100">{catalog.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="max-w-3xl">
          <div className="flex flex-wrap gap-2"><Tag>{item.category}</Tag><Tag>{item.unit}</Tag>{item.seasonality.map((value) => <Tag key={value}>{value}</Tag>)}{item.dietary.map((value) => <Tag key={value}>{value}</Tag>)}</div>
          <h2 className="mt-2 font-semibold">{item.name}</h2>
          <p className="mt-1 text-sm text-stone-500">{item.description || "Sans description"}</p>
          <p className="mt-2 text-xs text-stone-500">Min. {item.minimumQuantity} · {item.productionMinutes} min de production · capacité {item.capacityPerDay}/jour{item.allergens.length ? ` · Allergènes : ${item.allergens.join(", ")}` : ""}</p>
        </div>
        <div className="flex items-center gap-4"><div className="text-right"><p className="font-serif text-xl font-bold">{euro.format(item.unitPriceCents / 100)} <span className="text-xs font-sans font-normal text-stone-500">HT · TVA {item.vatRate} %</span></p><p className="text-xs text-stone-500">{item.foodCostCents === undefined ? "Coût matière à renseigner" : `Matière provisoire : ${euro.format(item.foodCostCents / 100)} HT`}</p></div><button onClick={() => setEditing(item)} aria-label={`Modifier ${item.name}`} className="text-[#8b1629]"><Pencil className="size-4" /></button><button onClick={() => deleteCatalogItem(item.id)} aria-label={`Supprimer ${item.name}`} className="text-stone-400 hover:text-[#8b1629]"><Trash2 className="size-4" /></button></div>
      </article>)}</div>
    </section>
  </div>;
}

function Tag({ children }: { children: ReactNode }) { return <span className="rounded-full bg-[#f5ecee] px-2 py-0.5 text-xs font-bold text-[#8b1629]">{children}</span>; }

function CatalogForm({ item, onCancel, onSubmit }: { item: CatalogItem | null; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="grid gap-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm md:grid-cols-2">
    <Field label="Nom"><input required name="name" defaultValue={item?.name} className="input" /></Field>
    <Field label="Catégorie"><input name="category" defaultValue={item?.category ?? "Prestation"} className="input" /></Field>
    <Field label="Description"><textarea name="description" defaultValue={item?.description} className="input min-h-20" /></Field>
    <Field label="Composition détaillée (une ligne par élément)"><textarea name="details" defaultValue={item?.details?.join("\n")} className="input min-h-20" /></Field>
    <div className="grid grid-cols-4 gap-3 md:col-span-2"><Field label="Unité"><input name="unit" defaultValue={item?.unit ?? "forfait"} className="input" /></Field><Field label="Prix HT"><input required min="0" step="0.01" name="price" type="number" defaultValue={item ? item.unitPriceCents / 100 : ""} className="input" /></Field><Field label="Coût matière HT"><input min="0" step="0.01" name="foodCost" type="number" defaultValue={item?.foodCostCents === undefined ? "" : item.foodCostCents / 100} className="input" /></Field><Field label="TVA"><select name="vatRate" defaultValue={item?.vatRate ?? 10} className="input"><option value="0">0 %</option><option value="5.5">5,5 %</option><option value="10">10 %</option><option value="20">20 %</option></select></Field></div>
    <div className="grid grid-cols-3 gap-3 md:col-span-2"><Field label="Quantité minimum"><input name="minimumQuantity" type="number" min="1" defaultValue={item?.minimumQuantity ?? 1} className="input" /></Field><Field label="Production (min)"><input name="productionMinutes" type="number" min="0" defaultValue={item?.productionMinutes ?? 0} className="input" /></Field><Field label="Capacité / jour"><input name="capacityPerDay" type="number" min="1" defaultValue={item?.capacityPerDay ?? 1} className="input" /></Field></div>
    <Field label="Saisonnalité (séparée par des virgules)"><input name="seasonality" defaultValue={list(item?.seasonality)} placeholder="Toute l'année, Été" className="input" /></Field>
    <Field label="Régimes possibles (séparés par des virgules)"><input name="dietary" defaultValue={list(item?.dietary)} placeholder="Végétarien, Vegan possible" className="input" /></Field>
    <Field label="Allergènes (séparés par des virgules)"><input name="allergens" defaultValue={list(item?.allergens)} placeholder="Gluten, Lait, Œufs" className="input" /></Field>
    <Field label="Recommandé pour (séparé par des virgules)"><input name="recommendedFor" defaultValue={list(item?.recommendedFor)} placeholder="Anniversaire, Afterwork" className="input" /></Field>
    <p className="text-xs text-stone-500 md:col-span-2">Les coûts matière importés restent provisoires jusqu’à vérification avec les factures fournisseurs.</p>
    <div className="flex justify-end gap-2 md:col-span-2"><button type="button" onClick={onCancel} className="px-3 py-2 text-sm font-bold">Annuler</button><button className="rounded-md bg-[#650d1c] px-4 py-2 text-sm font-bold text-white">Enregistrer l’article</button></div>
  </form>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-1 text-sm font-semibold"><span>{label}</span>{children}</label>; }
