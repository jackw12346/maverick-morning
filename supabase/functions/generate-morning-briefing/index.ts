// Placeholder Supabase Edge Function scaffold.
//
// The production briefing pipeline runs as a TanStack server function
// (`generateMorningBriefing` in src/lib/briefing.functions.ts) so it can share
// types and Supabase clients with the rest of the app. This Edge Function is
// kept as a deployment target for scheduled cron triggers (e.g. wake-time
// invocation from pg_cron / external scheduler) that need a public HTTP entry.
//
// Deploy with:  supabase functions deploy generate-morning-briefing
//
// Expected request:
//   POST /functions/v1/generate-morning-briefing
//   Authorization: Bearer <user JWT>
//
// Eventual responsibilities:
//   1. Resolve user from JWT.
//   2. Load briefing_settings + integration_tokens + smart_home_webhooks.
//   3. Fetch live data (Google Calendar, Whoop, batteries, Roca news).
//   4. Compose prompt -> Lovable AI Gateway chat completion.
//   5. Optionally synthesize speech and upload MP3 to `briefings` bucket.
//   6. Insert into briefing_logs and fan out to smart_home_webhooks.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — runs under Deno, not the project's TS config.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // TODO: 1) load settings  2) collect data  3) LLM  4) TTS  5) insert log  6) fire webhooks.
    return new Response(
      JSON.stringify({
        ok: true,
        message: "generate-morning-briefing scaffold reached",
        user_id: userRes.user.id,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? "internal_error" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
