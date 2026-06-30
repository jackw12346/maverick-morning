import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/whoop/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { consumeState, exchangeCode, saveTokens } = await import(
          "@/lib/oauth.server"
        );
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        const redirectTo = (path: string) =>
          new Response(null, { status: 302, headers: { Location: `${origin}${path}` } });

        if (err) return redirectTo(`/integrations?oauth_error=${encodeURIComponent(err)}`);
        if (!code || !state) return redirectTo("/integrations?oauth_error=missing_params");
        const row = await consumeState(state);
        if (!row || row.provider !== "whoop")
          return redirectTo("/integrations?oauth_error=invalid_state");
        try {
          const tokens = await exchangeCode({ provider: "whoop", code, origin });
          await saveTokens({ userId: row.user_id, provider: "whoop", tokens });
        } catch (e) {
          console.error("[oauth/whoop]", e);
          return redirectTo(
            `/integrations?oauth_error=${encodeURIComponent(e instanceof Error ? e.message : "exchange_failed")}`,
          );
        }
        return redirectTo("/integrations?connected=whoop");
      },
    },
  },
});
