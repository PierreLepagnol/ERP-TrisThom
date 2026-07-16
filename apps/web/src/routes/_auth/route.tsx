import { Outlet, createFileRoute } from "@tanstack/react-router";

import Header from "@/components/header";
import { LocalCrmProvider } from "@/lib/local-crm";

export const Route = createFileRoute("/_auth")({ component: AppLayout });

function AppLayout() {
  return (
    <LocalCrmProvider>
      <Header />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </LocalCrmProvider>
  );
}
