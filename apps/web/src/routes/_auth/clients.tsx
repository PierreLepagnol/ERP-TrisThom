import { createFileRoute } from "@tanstack/react-router";
import { Building2, Mail, Phone, Search, Users } from "lucide-react";
import { useState } from "react";

import { useConvexCrm } from "@/lib/convex-crm";

export const Route = createFileRoute("/_auth/clients")({ component: ClientsPage });

const formatDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });

function ClientsPage() {
  const { clients } = useConvexCrm();
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filteredClients = clients?.filter((client) =>
    !query || [client.name, client.email, client.phone, client.organization]
      .some((value) => value?.toLowerCase().includes(query)),
  );

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[#7d6f67] uppercase">Carnet commercial</p>
          <h1 className="mt-1 font-serif text-4xl font-bold">Clients</h1>
          <p className="mt-2 text-sm text-stone-600">Les contacts regroupés automatiquement depuis vos demandes.</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 shadow-sm">
          <Search className="size-4 text-stone-400" />
          <input aria-label="Rechercher un client" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, e-mail, société…" className="w-64 bg-transparent py-2.5 text-sm outline-none" />
        </div>
      </section>

      {!clients ? (
        <p className="rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500">Chargement des clients…</p>
      ) : filteredClients?.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white p-8 text-sm text-stone-500">Aucun client trouvé.</p>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredClients?.map((client) => (
            <article key={client.email ?? client.phone ?? client.name} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-[#f5ecee] font-serif text-lg font-bold text-[#8b1629]">{client.name.slice(0, 2).toUpperCase()}</span>
                <span className="flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-600"><Users className="size-3" />{client.requestCount} dossier{client.requestCount > 1 ? "s" : ""}</span>
              </div>
              <h2 className="mt-4 font-serif text-xl font-bold">{client.name}</h2>
              {client.organization ? <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-500"><Building2 className="size-4" />{client.organization}</p> : null}
              <div className="mt-4 space-y-2 text-sm">
                {client.email ? <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-[#8b1629] hover:underline"><Mail className="size-4" />{client.email}</a> : null}
                {client.phone ? <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-stone-700 hover:underline"><Phone className="size-4" />{client.phone}</a> : null}
              </div>
              <p className="mt-5 border-t border-stone-100 pt-3 text-xs text-stone-400">Dernière demande : {formatDate.format(client.lastRequestAt)}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
