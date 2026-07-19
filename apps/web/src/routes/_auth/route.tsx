import { Outlet, createFileRoute } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";

import Header from "@/components/header";
import Loader from "@/components/loader";
import SignInForm from "@/components/sign-in-form";
import { ConvexCrmProvider } from "@/lib/convex-crm";

export const Route = createFileRoute("/_auth")({ component: AppLayout });

function AppLayout() {
  return (
    <>
      <AuthLoading>
        <Loader />
      </AuthLoading>
      <Unauthenticated>
        <AuthenticationPage />
      </Unauthenticated>
      <Authenticated>
        <ConvexCrmProvider>
          <Header />
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            <Outlet />
          </main>
        </ConvexCrmProvider>
      </Authenticated>
    </>
  );
}

function AuthenticationPage() {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-10">
      <SignInForm />
    </main>
  );
}
