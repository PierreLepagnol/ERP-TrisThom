import { Link } from "@tanstack/react-router";
import { CalendarDays, ClipboardList, LayoutDashboard, Package, Plus, RotateCcw, Users } from "lucide-react";
import { toast } from "sonner";

import { useConvexCrm } from "@/lib/convex-crm";

export default function Header() {
  const { resetDemoData } = useConvexCrm();
  const links = [
    { to: "/dashboard", label: "Vue d'ensemble", icon: LayoutDashboard },
    { to: "/requests", label: "Demandes", icon: ClipboardList },
    { to: "/calendar", label: "Calendrier", icon: CalendarDays },
    { to: "/clients", label: "Clients", icon: Users },
    { to: "/catalog", label: "Catalogue", icon: Package },
  ] as const;

  async function resetDemo() {
    if (!window.confirm("Réinitialiser les demandes, devis, relances et catalogue avec les données de démonstration ?")) return;
    try {
      await resetDemoData();
      toast.success("Les données de démonstration ont été réinitialisées.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Impossible de réinitialiser les données de démonstration.",
      );
    }
  }

  return (
    <header className="border-b border-stone-200 bg-[#4e0613] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/dashboard" className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-[#fff8ef] font-serif text-xl font-bold text-[#650d1c]">
            Bc
          </span>
          <span className="hidden font-serif text-xl font-bold sm:inline">Bouillon Comptoir</span>
        </Link>
        <nav className="order-3 flex w-full items-center justify-between gap-1 overflow-x-auto text-sm font-semibold md:order-none md:w-auto md:justify-start">
          {links.map(({ to, label, icon: Icon }) => {
            return (
              <Link
                key={label}
                to={to}
                activeProps={{ className: "bg-white/15 text-white" }}
                className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/requests"
            search={{ nouveau: true }}
            className="flex items-center gap-2 rounded-md bg-[#f6e7be] px-3 py-2 text-sm font-bold text-[#650d1c]"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Nouvelle demande</span>
          </Link>
          <button type="button" onClick={() => void resetDemo()} className="hidden items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white lg:inline-flex" title="Réinitialiser les données de démonstration"><RotateCcw className="size-3" />Réinitialiser la démo</button>
          <span className="hidden rounded-full border border-white/20 px-2.5 py-1 text-xs font-semibold text-white/70 xl:inline">Convex connecté</span>
        </div>
      </div>
    </header>
  );
}
