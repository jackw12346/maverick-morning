import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  token: z.string().uuid(),
  devices: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        level: z.number().int().min(0).max(100),
        charging: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(20),
});

export const Route = createFileRoute("/api/public/ingest/batteries")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        let parsed;
        try {
          parsed = Body.parse(await request.json());
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : "bad input" },
            { status: 400 },
          );
        }
        const { data: profile, error } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("ingest_token", parsed.token)
          .maybeSingle();
        if (error || !profile) {
          return Response.json({ ok: false, error: "invalid token" }, { status: 401 });
        }
        const rows = parsed.devices.map((d) => ({
          user_id: profile.id,
          device_name: d.name,
          level: d.level,
          is_charging: d.charging ?? null,
          updated_at: new Date().toISOString(),
        }));
        const { error: upErr } = await supabaseAdmin
          .from("device_batteries")
          .upsert(rows, { onConflict: "user_id,device_name" });
        if (upErr) {
          return Response.json({ ok: false, error: upErr.message }, { status: 500 });
        }
        return Response.json({ ok: true, count: rows.length });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
    },
  },
});
