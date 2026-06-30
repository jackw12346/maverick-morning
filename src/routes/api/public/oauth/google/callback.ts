import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => handleOAuthCallback(request, "google_calendar"),
    },
  },
});

async function handleOAuthCallback(
  request: Request,
  provider: "google_calendar" | "whoop",
) {
  const { consumeState, exchangeCode, saveTokens } = await import(
    "@/lib/oauth.server"
  );
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  const origin = url.origin;

  if (err) throw redirectTo(`/integrations?oauth_error=${encodeURIComponent(err)}`);
  if (!code || !state) throw redirectTo("/integrations?oauth_error=missing_params");

  const stateRow = await consumeState(state);
  if (!stateRow || stateRow.provider !== provider) {
    throw redirectTo("/integrations?oauth_error=invalid_state");
  }
  try {
    const tokens = await exchangeCode({ provider, code, origin });
    await saveTokens({ userId: stateRow.user_id, provider, tokens });
  } catch (e) {
    console.error("[oauth/google]", e);
    throw redirectTo(
      `/integrations?oauth_error=${encodeURIComponent(e instanceof Error ? e.message : "exchange_failed")}`,
    );
  }
  throw redirectTo("/integrations?connected=google_calendar");
}

function redirectTo(to: string) {
  return redirect({ to });
}
