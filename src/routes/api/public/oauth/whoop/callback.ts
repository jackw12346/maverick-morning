import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/whoop/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { consumeState, exchangeCode, saveTokens } = await import(
          "@/lib/oauth.server"
        );
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const err = url.searchParams.get("error");
        if (err)
          throw redirect({
            to: `/integrations?oauth_error=${encodeURIComponent(err)}`,
          });
        if (!code || !state)
          throw redirect({ to: "/integrations?oauth_error=missing_params" });
        const row = await consumeState(state);
        if (!row || row.provider !== "whoop")
          throw redirect({ to: "/integrations?oauth_error=invalid_state" });
        try {
          const tokens = await exchangeCode({
            provider: "whoop",
            code,
            origin: url.origin,
          });
          await saveTokens({
            userId: row.user_id,
            provider: "whoop",
            tokens,
          });
        } catch (e) {
          console.error("[oauth/whoop]", e);
          throw redirect({
            to: `/integrations?oauth_error=${encodeURIComponent(e instanceof Error ? e.message : "exchange_failed")}`,
          });
        }
        throw redirect({ to: "/integrations?connected=whoop" });
      },
    },
  },
});
