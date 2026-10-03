import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_auth/services/$requestId")({ beforeLoad: ({ params }) => { throw redirect({ to: "/requests/$requestId", params, hash: "preparation" }); } });
