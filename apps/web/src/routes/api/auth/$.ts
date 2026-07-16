import { createFileRoute } from "@tanstack/react-router";

import { handler } from "@/lib/auth-server";

async function handleAuthRequest(request: Request) {
  const response = await handler(request);
  const signedSessionToken = response.headers.get("set-auth-token");

  if (!signedSessionToken) {
    return response;
  }

  const headers = new Headers(response.headers);
  const cookieAttributes = "Path=/; HttpOnly; SameSite=Lax; Max-Age=604800";

  // Convex runs on HTTPS while the local application runs on HTTP. Depending
  // on which SITE_URL configuration is currently deployed, Better Auth may
  // expect either cookie name. Setting both keeps local development usable;
  // browsers that reject the secure variant still retain the local one.
  headers.append(
    "Set-Cookie",
    `better-auth.session_token=${signedSessionToken}; ${cookieAttributes}`,
  );
  headers.append(
    "Set-Cookie",
    `__Secure-better-auth.session_token=${signedSessionToken}; ${cookieAttributes}; Secure`,
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleAuthRequest(request),
      POST: ({ request }) => handleAuthRequest(request),
    },
  },
});
