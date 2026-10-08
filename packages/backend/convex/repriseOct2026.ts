import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

type Entry = {
  key: string;
  day: number;
  contactName: string;
  organizationName?: string;
  guestCount?: number;
  eventAddress?: string;
  eventStartTime?: string;
  eventEndTime?: string;
  eventType?: string;
  status: Doc<"requests">["status"];
  note?: string;
};

const pointsCommuns = (day: number, guestCount: number, eventAddress?: string, note?: string): Entry => ({
  key: "points-communs", day, guestCount, contactName: "Marine Monbelli", organizationName: "Points communs",
  eventType: "Plateaux repas", status: "accepte",
  ...(eventAddress ? { eventAddress, eventStartTime: "15:00", eventEndTime: "17:00" } : {}),
  ...(note ? { note } : {}),
});
const entries: Entry[] = [
  { key: "barry-gaelle-j2", day: 7, contactName: "Barry / Gaëlle J2", guestCount: 15, eventAddress: "Hardricourt", eventStartTime: "09:00", eventEndTime: "11:00", status: "accepte", eventType: "Buffet / livraison", note: "Confirmé et payé" },
  pointsCommuns(8, 25, "Théâtre des Louvrais, place de la Paix, Pontoise"),
  pointsCommuns(9, 31, "Théâtre des Louvrais, place de la Paix, Pontoise"),
  pointsCommuns(10, 12, "T95, 1 place du Théâtre, Cergy"),
  { key: "saint-gratien", day: 10, contactName: "Saint-Gratien", guestCount: 20, eventAddress: "Théâtre Jean Marais, Saint-Gratien", eventStartTime: "18:45", status: "accepte", eventType: "Plateaux repas", note: "Livraison à 18:45" },
  pointsCommuns(12, 15, "T95, 1 place du Théâtre, Cergy", "15 repas consommés le 12. Livraison comprenant également 13 repas destinés au 13/10."),
  pointsCommuns(13, 13, undefined, "Repas déjà livrés le 12/10"),
  { key: "loxam-grande-table", day: 13, contactName: "Solène Boulmont", organizationName: "LOXAM / Grande Table", guestCount: 75, eventAddress: "8 rue Félix Pyat, Puteaux", eventStartTime: "19:30", status: "accepte", eventType: "Grande Table / prestation avec personnel", note: "Arrivée équipe 18:00 ; service 19:30" },
  { key: "barry-enora-codir", day: 14, contactName: "Enora Marquez", organizationName: "Barry / Enora + CODIR", guestCount: 30, eventAddress: "5 boulevard Michelet, Hardricourt", eventStartTime: "09:00", eventEndTime: "11:00", status: "accepte", eventType: "Buffet / livraison" },
  pointsCommuns(15, 12, "Théâtre des Louvrais, Pontoise"),
  pointsCommuns(16, 11, "Théâtre des Louvrais, Pontoise", "11 repas consommés le 16. Livraison comprenant également 12 repas destinés au 17/10."),
  pointsCommuns(17, 12, undefined, "Repas déjà livrés le 16/10"),
  { key: "david-vatin-anniversaire", day: 17, contactName: "David Vatin", guestCount: 20, eventAddress: "Ermont", eventStartTime: "17:30", eventEndTime: "18:00", status: "devis_a_preparer", eventType: "Cocktail", note: "Anniversaire. Livraison visée 17:30–18:00. 12 pièces par personne, environ 240 pièces. Adresse exacte et téléphone à demander." },
  { key: "monastere", day: 18, contactName: "Monastère", status: "refuse", note: "Perdu / retiré" },
  { key: "fehap-olivier-limoges", day: 20, contactName: "Olivier Limoges", organizationName: "FEHAP", guestCount: 30, eventAddress: "179 rue de Lourmel, Paris 15e", eventStartTime: "11:30", eventEndTime: "11:45", status: "devis_envoye", eventType: "Buffet chaud / livraison", note: "À verrouiller avant production ; répartition des plats, allergies, accès et reprise matériel à confirmer" },
  { key: "mas", day: 23, contactName: "MAS", guestCount: 60, status: "devis_envoye", note: "Attente client" },
  { key: "bouvier", day: 24, contactName: "Bouvier", status: "devis_envoye", note: "Attente client" },
  { key: "lydia", day: 25, contactName: "Lydia", status: "devis_envoye", note: "Attente client" },
  pointsCommuns(29, 12, "Théâtre des Louvrais, Pontoise", "12 repas consommés le 29. Livraison comprenant également 11 repas destinés au 30/10."),
  pointsCommuns(30, 11, undefined, "Repas déjà livrés le 29/10"),
  { key: "benoit-etienne", day: 31, contactName: "Benoît Etienne", guestCount: 20, eventAddress: "rue des Callais, Eaubonne", status: "devis_envoye", eventType: "Buffet / livraison", note: "Déjeuner. À verrouiller, ne pas produire avant validation" },
];

function fields(entry: Entry) {
  const { key, day, note, ...request } = entry;
  const date = `2026-10-${String(day).padStart(2, "0")}`;
  // Midi Europe/Paris : passage à UTC+1 le 25 octobre 2026.
  const eventDate = Date.parse(`${date}T12:00:00${day < 25 ? "+02:00" : "+01:00"}`);
  const missingInformation = ["Coordonnées du client", "Budget", "Besoins particuliers"];
  if (!request.eventAddress) missingInformation.push("Lieu ou adresse");
  if (!request.guestCount) missingInformation.push("Nombre de personnes");
  if (!request.eventType) missingInformation.push("Type de prestation");
  if (!request.eventStartTime || !request.eventEndTime) missingInformation.push("Horaires");
  return { ...request, source: "manuel" as const, externalSourceId: `reprise-oct-2026:${date}:${key}`, eventDate, missingInformation };
}

async function plan(ctx: QueryCtx) {
  return await Promise.all(entries.map(async entry => {
    const request = fields(entry);
    const existing = await ctx.db.query("requests")
      .withIndex("by_source_and_externalSourceId", q => q.eq("source", "manuel").eq("externalSourceId", request.externalSourceId))
      .first();
    return { entry, request, existing };
  }));
}

// Aperçu en lecture seule, sans créer de dossier ni d'historique.
export const preview = internalQuery({
  args: {},
  handler: async ctx => {
    const rows = await plan(ctx);
    return {
      total: rows.length,
      toCreate: rows.filter(row => !row.existing).length,
      skipped: rows.filter(row => row.existing).length,
      dossiers: rows.map(({ request, existing }) => ({ ...request, requestId: existing?._id ?? null, action: existing ? "ignorer" : "créer" })),
    };
  },
});

// Appel explicite seulement, après lecture de preview. Les 21 entrées sont atomiques.
export const apply = internalMutation({
  args: { expectedToCreate: v.number() },
  handler: async (ctx, args) => {
    const rows = await plan(ctx);
    const pending = rows.filter(row => !row.existing);
    if (pending.length !== args.expectedToCreate) throw new Error("Le nombre à créer a changé. Relancez preview avant l'import.");
    const now = Date.now();
    const requestIds = [];
    for (const { entry, request } of pending) {
      const requestId = await ctx.db.insert("requests", { ...request, createdAt: now, updatedAt: now });
      await ctx.db.insert("requestHistory", { requestId, label: "Dossier repris depuis le planning production octobre 2026", createdAt: now });
      if (entry.note) await ctx.db.insert("requestNotes", { requestId, content: entry.note, createdAt: now });
      requestIds.push(requestId);
    }
    return { created: pending.length, skipped: rows.length - pending.length, requestIds };
  },
});
