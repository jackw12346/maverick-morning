import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const unwrapShortcutValue = (value: unknown) => {
  if (Array.isArray(value) && value.length === 1) return value[0];
  return value;
};

const ShortcutString = z.preprocess(
  unwrapShortcutValue,
  z.string().trim().min(1).max(60),
);

const ShortcutNumber = z.preprocess(
  unwrapShortcutValue,
  z.coerce.number().int().min(0).max(100),
);

const ShortcutBoolean = z
  .preprocess(
    unwrapShortcutValue,
    z.union([z.boolean(), z.enum(["true", "false", "1", "0"])]),
  )
  .optional()
  .transform((v) =>
    typeof v === "string" ? v === "true" || v === "1" : v,
  );

const Device = z.object({
  name: ShortcutString,
  level: ShortcutNumber,
  charging: ShortcutBoolean,
});

// Accept either:
//   { token, devices: [{ name, level, charging }, ...] }
// or a flat single-device shape from iOS Shortcuts:
//   { token, name, level, charging }
const Body = z
  .object({
    token: z.string().trim().min(8).max(100),
    devices: z.array(Device).min(1).max(20).optional(),
    name: ShortcutString.optional(),
    level: ShortcutNumber.optional(),
    charging: ShortcutBoolean,
  })
  .transform((b) => {
    if (b.devices && b.devices.length) return { token: b.token, devices: b.devices };
    if (b.name && typeof b.level === "number") {
      return {
        token: b.token,
        devices: [{ name: b.name, level: b.level, charging: b.charging }],
      };
    }
    throw new Error("Provide either devices[] or name+level");
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
