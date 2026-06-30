// Server-only data collectors for the morning briefing.
import { getValidAccessToken } from "./oauth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Section = { id: string; title: string; content: string };

export async function collectCalendar(userId: string): Promise<Section | null> {
  const token = await getValidAccessToken({
    userId,
    provider: "google_calendar",
  });
  if (!token) return null;

  const profileQuery = supabaseAdmin
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();

  // Fetch every readable calendar, including hidden/unchecked calendars such as Work.
  const listResPromise = fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&showHidden=true",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const [{ data: profile }, listRes] = await Promise.all([profileQuery, listResPromise]);

  if (!listRes.ok) {
    console.error("[calendar list]", listRes.status, await listRes.text().catch(() => ""));
    return {
      id: "calendar",
      title: "Calendar",
      content: "Calendar fetch failed — try reconnecting Google Calendar.",
    };
  }
  const listJson = (await listRes.json()) as {
    items?: Array<{
      id: string;
      summary?: string;
      summaryOverride?: string;
      selected?: boolean;
      primary?: boolean;
      timeZone?: string;
    }>;
  };
  const calendars = listJson.items ?? [];

  const primaryCalendar = calendars.find((c) => c.primary) ?? calendars[0];
  const tz = primaryCalendar?.timeZone || profile?.timezone || "UTC";
  const now = new Date();
  const todayKey = dateKeyInTimeZone(now, tz);

  const start = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 84 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
  });

  const isFamilyCalendar = (c: { summary?: string; summaryOverride?: string }) => {
    const name = `${c.summaryOverride ?? ""} ${c.summary ?? ""}`.toLowerCase();
    return /\bfamily\b|\bfam\b/.test(name);
  };

  const results = await Promise.all(
    calendars.map(async (c) => {
      const r = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!r.ok) return [] as any[];
      const j = (await r.json()) as { items?: any[] };
      const family = isFamilyCalendar(c);
      const calName = c.summaryOverride ?? c.summary ?? "";
      return (j.items ?? []).map((e) => ({
        ...e,
        __calendarId: c.id,
        __family: family,
        __calName: calName,
        __primary: !!c.primary,
      }));
    }),
  );
  const allItems = results.flat();

  const seen = new Set<string>();
  const events = allItems
    .filter((e: any) => {
      if (!e?.summary || e.status === "cancelled") return false;
      const key = `${e.__calendarId}-${e.id}-${e.start?.dateTime ?? e.start?.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      if (e.start?.date) return e.start.date === todayKey;
      if (!e.start?.dateTime) return false;
      return dateKeyInTimeZone(new Date(e.start.dateTime), tz) === todayKey;
    })
    .sort((a: any, b: any) => {
      // Family events first, then chronological.
      if (!!b.__family !== !!a.__family) return b.__family ? 1 : -1;
      const at = new Date(a.start?.dateTime ?? a.start?.date ?? 0).getTime();
      const bt = new Date(b.start?.dateTime ?? b.start?.date ?? 0).getTime();
      return at - bt;
    });

  if (events.length === 0) {
    return {
      id: "calendar",
      title: "Calendar",
      content: "No events on the calendar today. The day is yours.",
    };
  }
  const lines = events.slice(0, 25).map((e: any) => {
    const when = e.start?.dateTime
      ? new Date(e.start.dateTime).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: tz,
        })
      : "All day";
    const calendarLabel = !e.__primary && e.__calName ? ` [${e.__calName}]` : "";
    const tag = e.__family ? " [FAMILY — prioritize]" : "";
    return `${when} ${e.summary}${calendarLabel}${tag}`;
  });
  const familyCount = events.filter((e: any) => e.__family).length;
  const preamble = familyCount > 0
    ? `${familyCount} family event${familyCount === 1 ? "" : "s"} take priority. `
    : "";
  return {
    id: "calendar",
    title: "Calendar",
    content: `${preamble}${events.length} event${events.length === 1 ? "" : "s"} today: ${lines.join("; ")}.`,
  };
}


function dateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}


export async function collectWhoop(userId: string): Promise<Section | null> {
  const token = await getValidAccessToken({ userId, provider: "whoop" });
  if (!token) return null;

  const headers = { Authorization: `Bearer ${token}` };
  const [recRes, sleepRes] = await Promise.all([
    fetch("https://api.prod.whoop.com/developer/v2/recovery?limit=1", { headers }),
    fetch("https://api.prod.whoop.com/developer/v2/activity/sleep?limit=1", { headers }),
  ]);

  if (!recRes.ok) {
    console.error("[whoop recovery]", recRes.status, await recRes.text().catch(() => ""));
  }
  if (!sleepRes.ok) {
    console.error("[whoop sleep]", sleepRes.status, await sleepRes.text().catch(() => ""));
  }
  if (!recRes.ok && !sleepRes.ok) {
    return {
      id: "whoop",
      title: "Recovery",
      content: "Whoop fetch failed — try reconnecting.",
    };
  }

  const recJson = recRes.ok
    ? ((await recRes.json()) as {
        records?: Array<{
          created_at?: string;
          updated_at?: string;
          score_state?: string;
          score?: {
            recovery_score?: number;
            hrv_rmssd_milli?: number;
            resting_heart_rate?: number;
          };
        }>;
      })
    : { records: [] };
  const sleepJson = sleepRes.ok
    ? ((await sleepRes.json()) as {
        records?: Array<{
          created_at?: string;
          updated_at?: string;
          score_state?: string;
          score?: {
            sleep_performance_percentage?: number;
            sleep_efficiency_percentage?: number;
            sleep_consistency_percentage?: number;
          };
        }>;
      })
    : { records: [] };

  const rec = recJson.records?.[0];
  const r = rec?.score;
  const sleep = sleepJson.records?.[0];
  const s = sleep?.score;

  const parts: string[] = [];
  if (r?.recovery_score != null) parts.push(`Recovery ${Math.round(r.recovery_score)}%`);
  if (s?.sleep_performance_percentage != null)
    parts.push(`Sleep ${Math.round(s.sleep_performance_percentage)}%`);
  if (s?.sleep_efficiency_percentage != null)
    parts.push(`efficiency ${Math.round(s.sleep_efficiency_percentage)}%`);
  if (r?.hrv_rmssd_milli != null) parts.push(`HRV ${Math.round(r.hrv_rmssd_milli)}ms`);
  if (r?.resting_heart_rate != null) parts.push(`RHR ${r.resting_heart_rate}`);

  if (parts.length === 0) {
    const state = rec?.score_state ?? sleep?.score_state;
    return {
      id: "whoop",
      title: "Recovery",
      content:
        state && state !== "SCORED"
          ? `Latest Whoop data is still ${state.toLowerCase()}.`
          : "No Whoop data yet for today.",
    };
  }

  // Flag staleness so the model can mention it instead of pretending it's today's.
  let suffix = "";
  const ts = rec?.updated_at ?? rec?.created_at ?? sleep?.updated_at ?? sleep?.created_at;
  if (ts) {
    const ageHrs = (Date.now() - new Date(ts).getTime()) / 36e5;
    if (ageHrs > 18) {
      suffix = ` (last synced ${Math.round(ageHrs)}h ago — Whoop hasn't pushed this morning's score yet)`;
    }
  }
  return {
    id: "whoop",
    title: "Recovery",
    content: parts.join(", ") + "." + suffix,
  };
}

export async function collectBatteries(userId: string): Promise<Section | null> {
  const { data } = await supabaseAdmin
    .from("device_batteries")
    .select("device_name,level,is_charging,updated_at")
    .eq("user_id", userId)
    .order("device_name");
  if (!data || data.length === 0) {
    return {
      id: "batteries",
      title: "Devices",
      content:
        "No device battery data yet. Set up an iOS Shortcut to POST to your ingest URL.",
    };
  }
  const parts = data.map(
    (d) =>
      `${d.device_name} ${d.level}%${d.is_charging ? " (charging)" : ""}`,
  );
  const low = data.filter((d) => d.level < 30 && !d.is_charging);
  let line = parts.join(", ") + ".";
  if (low.length > 0) {
    line += ` Heads up — ${low.map((d) => d.device_name).join(", ")} running low.`;
  }
  return { id: "batteries", title: "Devices", content: line };
}

// Fetch headlines from Google News RSS for a given query.
async function fetchGoogleNews(query: string, limit = 5): Promise<string[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Maverick-Briefing/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const items = Array.from(xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/g))
    .map((m) => decodeEntities(m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim()))
    .filter((t) => t.length > 8);
  return items.slice(0, limit);
}

export async function collectTailoredNews(
  topics: string,
  apiKey: string | undefined,
  displayName: string,
): Promise<Section | null> {
  const cleanedTopics = topics
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
  const queries = cleanedTopics.length > 0 ? cleanedTopics : ["top world news today"];
  try {
    const all = await Promise.all(
      queries.slice(0, 5).map(async (q) => {
        const heads = await fetchGoogleNews(q, 4);
        return { topic: q, headlines: heads };
      }),
    );
    const groups = all.filter((g) => g.headlines.length > 0);
    if (groups.length === 0) {
      return {
        id: "news",
        title: "News",
        content: "News feed unavailable this morning.",
      };
    }

    // If we have an AI key, let the model tailor a 2-3 sentence brief.
    if (apiKey) {
      const prompt = [
        `Subject: ${displayName}.`,
        `Their interests: ${cleanedTopics.join(", ") || "general world news"}.`,
        "Below are real headlines from this morning grouped by topic. Write a tight 2-4 sentence news brief tailored to them, prioritizing what is most relevant and novel. No headlines verbatim — synthesize. Do not invent facts beyond the headlines.",
        ...groups.map(
          (g) => `Topic "${g.topic}":\n- ${g.headlines.join("\n- ")}`,
        ),
      ].join("\n\n");
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You write concise personalized news briefs." },
              { role: "user", content: prompt },
            ],
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            choices: { message: { content: string } }[];
          };
          const text = json.choices?.[0]?.message?.content?.trim();
          if (text) return { id: "news", title: "News", content: text };
        } else {
          console.error("[news ai]", res.status, await res.text().catch(() => ""));
        }
      } catch (e) {
        console.error("[news ai]", e);
      }
    }

    // Fallback: raw headline list.
    const flat = groups
      .map((g) => `${g.topic}: ${g.headlines.slice(0, 2).join("; ")}`)
      .join(". ");
    return { id: "news", title: "News", content: flat + "." };
  } catch (err) {
    console.error("[news]", err);
    return { id: "news", title: "News", content: "News feed unavailable." };
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
