import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => handleOAuthCallback(request),
    },
  },
});

async function handleOAuthCallback(request: Request): Promise<Response> {
  const { consumeState, exchangeCode, saveTokens } = await import(
    "@/lib/oauth.server"
  );
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const origin = url.origin;

  if (err) return redirectTo(origin, `/integrations?oauth_error=${encodeURIComponent(err)}`);
  if (!code || !state) return redirectTo(origin, "/integrations?oauth_error=missing_params");

  const stateRow = await consumeState(state);
  if (!stateRow || stateRow.provider !== "google_calendar") {
    return redirectTo(origin, "/integrations?oauth_error=invalid_state");
  }
  try {
    const tokens = await exchangeCode({ provider: "google_calendar", code, origin });
    await saveTokens({ userId: stateRow.user_id, provider: "google_calendar", tokens });
  } catch (e) {
    console.error("[oauth/google]", e);
    return redirectTo(
      origin,
      `/integrations?oauth_error=${encodeURIComponent(e instanceof Error ? e.message : "exchange_failed")}`,
    );
  }
  return redirectTo(origin, "/integrations?connected=google_calendar");
}

function redirectTo(origin: string, path: string) {
  return new Response(null, { status: 302, headers: { Location: `${origin}${path}` } });
}
