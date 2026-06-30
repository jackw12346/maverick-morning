import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Profile ----------

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        display_name: z.string().trim().max(80).optional(),
        timezone: z.string().trim().max(64).optional(),
        wake_time: z
          .string()
          .regex(/^\d{2}:\d{2}(:\d{2})?$/)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("profiles").update(data).eq("id", userId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Settings ----------

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("briefing_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        include_calendar: z.boolean().optional(),
        include_whoop: z.boolean().optional(),
        include_batteries: z.boolean().optional(),
        include_roca_news: z.boolean().optional(),
        news_topics: z.string().max(500).optional(),
        text_to_speech_enabled: z.boolean().optional(),
        voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("briefing_settings")
      .update(data)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Integrations ----------

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("integration_tokens")
      .select("provider,status,updated_at,metadata")
      .eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  });

export const setIntegrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        provider: z.enum(["google_calendar", "whoop"]),
        status: z.enum(["disconnected", "connected", "error"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("integration_tokens").upsert(
      {
        user_id: userId,
        provider: data.provider,
        status: data.status,
      },
      { onConflict: "user_id,provider" },
    );
    if (error) throw error;
    return { ok: true };
  });

// Generate OAuth start URL for a provider. Client navigates to the returned URL.
export const startOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        provider: z.enum(["google_calendar", "whoop"]),
        origin: z.string().url(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { createAuthUrl } = await import("@/lib/oauth.server");
    try {
      const url = await createAuthUrl({
        provider: data.provider,
        userId: context.userId,
        origin: data.origin,
      });
      return { ok: true as const, url };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Failed to start OAuth",
      };
    }
  });

export const disconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ provider: z.enum(["google_calendar", "whoop"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("integration_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("provider", data.provider);
    if (error) throw error;
    return { ok: true };
  });

// Returns the user's ingest token for the batteries POST endpoint.
export const getIngestToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("ingest_token")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return { token: data?.ingest_token ?? null };
  });

// Latest battery readings for the dashboard.
export const listBatteries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("device_batteries")
      .select("device_name,level,is_charging,updated_at")
      .eq("user_id", userId)
      .order("device_name");
    if (error) throw error;
    return data ?? [];
  });


// ---------- Webhooks ----------

export const listWebhooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("smart_home_webhooks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const upsertWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        label: z.string().trim().min(1).max(80),
        target: z.enum(["sonos", "nanoleaf", "other"]),
        url: z.string().url().max(500),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { error } = await supabase
        .from("smart_home_webhooks")
        .update({
          label: data.label,
          target: data.target,
          url: data.url,
          enabled: data.enabled,
        })
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabase
      .from("smart_home_webhooks")
      .insert({
        user_id: userId,
        label: data.label,
        target: data.target,
        url: data.url,
        enabled: data.enabled,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row.id };
  });

export const deleteWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("smart_home_webhooks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

export const pingWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: hook, error } = await supabase
      .from("smart_home_webhooks")
      .select("url,label,target")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !hook) throw new Error("Webhook not found");
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "jarvis-morning-briefing",
          event: "ping",
          label: hook.label,
          target: hook.target,
          at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(8000),
      });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
    }
  });

// ---------- Logs ----------

async function signAudio(
  supabase: { storage: { from: (b: string) => { createSignedUrl: (p: string, e: number) => Promise<{ data: { signedUrl: string } | null }> } } },
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("briefings").createSignedUrl(path, 60 * 60 * 6);
  return data?.signedUrl ?? null;
}

export const listLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("briefing_logs")
      .select("id,briefing_text,audio_url,metadata,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    const rows = data ?? [];
    return await Promise.all(
      rows.map(async (r) => ({ ...r, audio_url: await signAudio(supabase, r.audio_url) })),
    );
  });

export const getLatestLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("briefing_logs")
      .select("id,briefing_text,audio_url,metadata,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { ...data, audio_url: await signAudio(supabase, data.audio_url) };
  });

// ---------- Generate ----------

type Section = { id: string; title: string; content: string };

function fallbackBriefing(name: string, sections: Section[]): string {
  const greeting = `Good morning, ${name}.`;
  const body = sections.map((s) => `${s.title}. ${s.content}`).join(" ");
  return `${greeting} ${body} That's the briefing.`;
}

async function generateText(
  apiKey: string,
  name: string,
  sections: Section[],
): Promise<{ text: string; model: string }> {
  const prompt = [
    "You are Maverick, a personal morning briefing assistant.",
    `Subject name: ${name}.`,
    "Compose a concise, calm morning briefing in 5-8 sentences using ONLY the data below.",
    "Open with a short greeting. Mention each section naturally. End with a single confident closer.",
    "Data sections:",
    ...sections.map((s) => `- ${s.title}: ${s.content}`),
  ].join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You write tight, confident morning briefings." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${t.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    choices: { message: { content: string } }[];
    model?: string;
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  return { text, model: json.model ?? "google/gemini-2.5-flash" };
}

async function synthesizeSpeech(
  apiKey: string,
  text: string,
  voice: string,
): Promise<Uint8Array> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini-tts",
      input: text,
      voice,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`TTS ${res.status}: ${t.slice(0, 200)}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export const generateMorningBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: settings }, { data: profile }, { data: webhooks }] = await Promise.all([
      supabase.from("briefing_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
      supabase
        .from("smart_home_webhooks")
        .select("url,label,target")
        .eq("user_id", userId)
        .eq("enabled", true),
    ]);

    const name = profile?.display_name?.trim() || "there";

    const { collectCalendar, collectWhoop, collectBatteries, collectTailoredNews } =
      await import("@/lib/data-sources.server");

    const apiKey = process.env.LOVABLE_API_KEY;

    const collectors: Promise<Section | null>[] = [];
    if (settings?.include_calendar) collectors.push(collectCalendar(userId));
    if (settings?.include_whoop) collectors.push(collectWhoop(userId));
    if (settings?.include_batteries) collectors.push(collectBatteries(userId));
    if (settings?.include_roca_news)
      collectors.push(collectTailoredNews(settings?.news_topics ?? "", apiKey, name));
    const sections = (await Promise.all(collectors)).filter(
      (s): s is Section => s !== null,
    );


    let text: string;
    let modelUsed = "fallback";
    if (apiKey) {
      try {
        const out = await generateText(apiKey, name, sections);
        text = out.text || fallbackBriefing(name, sections);
        modelUsed = out.model;
      } catch (err) {
        console.error("[briefing] LLM failed, falling back", err);
        text = fallbackBriefing(name, sections);
      }
    } else {
      text = fallbackBriefing(name, sections);
    }

    // TTS + upload
    let storagePath: string | null = null;
    if (settings?.text_to_speech_enabled && apiKey) {
      try {
        const audio = await synthesizeSpeech(apiKey, text, settings.voice ?? "alloy");
        const fileName = `${userId}/${crypto.randomUUID()}.mp3`;
        const { error: upErr } = await supabase.storage
          .from("briefings")
          .upload(fileName, audio, { contentType: "audio/mpeg", upsert: false });
        if (upErr) throw upErr;
        storagePath = fileName;
      } catch (err) {
        console.error("[briefing] TTS failed", err);
      }
    }

    const { data: log, error: logErr } = await supabase
      .from("briefing_logs")
      .insert({
        user_id: userId,
        briefing_text: text,
        audio_url: storagePath,
        metadata: {
          model: modelUsed,
          sections: sections.map((s) => s.id),
          had_tts: storagePath !== null,
        },
      })
      .select("id,created_at")
      .single();
    if (logErr) throw logErr;

    // Sign audio for response
    let signedAudio: string | null = null;
    if (storagePath) {
      const { data: s } = await supabase.storage
        .from("briefings")
        .createSignedUrl(storagePath, 60 * 60 * 6);
      signedAudio = s?.signedUrl ?? null;
    }

    // Fan-out to webhooks (best-effort)
    const webhookResults = await Promise.allSettled(
      (webhooks ?? []).map((w) =>
        fetch(w.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "jarvis-morning-briefing",
            event: "briefing.generated",
            label: w.label,
            target: w.target,
            briefing_id: log.id,
            text,
            audio_url: signedAudio,
            sections: sections.map((s) => s.id),
            at: log.created_at,
          }),
          signal: AbortSignal.timeout(8000),
        }),
      ),
    );

    return {
      ok: true,
      id: log.id,
      text,
      audio_url: signedAudio,
      created_at: log.created_at,
      webhooks_delivered: webhookResults.filter(
        (r) => r.status === "fulfilled" && (r.value as Response).ok,
      ).length,
      webhooks_total: webhookResults.length,
    };
  });
