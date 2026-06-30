// Server-only data collectors for the morning briefing.
import { getValidAccessToken } from "./oauth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Section = { id: string; title: string; content: string };

// ---------- Weather (Open-Meteo, no API key required) ----------

async function geocode(location: string): Promise<{ lat: number; lon: number; name: string; tz: string } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string; country_code?: string; timezone?: string }>;
  };
  const r = j.results?.[0];
  if (!r) return null;
  const label = [r.name, r.admin1, r.country_code].filter(Boolean).join(", ");
  return { lat: r.latitude, lon: r.longitude, name: label, tz: r.timezone ?? "auto" };
}

const WX: Record<number, string> = {
  0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "freezing fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
  61: "light rain", 63: "rain", 65: "heavy rain",
  66: "freezing rain", 67: "heavy freezing rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains",
  80: "rain showers", 81: "heavy showers", 82: "violent showers",
  85: "snow showers", 86: "heavy snow showers",
  95: "thunderstorm", 96: "thunderstorm w/ hail", 99: "severe thunderstorm",
};

export async function collectWeather(location: string): Promise<Section | null> {
  const loc = location.trim();
  if (!loc) {
    return {
      id: "weather",
      title: "Weather",
      content: "No weather location set — add one in Configuration.",
    };
  }
  const geo = await geocode(loc);
  if (!geo) {
    return { id: "weather", title: "Weather", content: `Couldn't find "${loc}" — try a more specific city.` };
  }
  const params = new URLSearchParams({
    latitude: String(geo.lat),
    longitude: String(geo.lon),
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: geo.tz,
    forecast_days: "1",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { id: "weather", title: "Weather", content: "Weather feed unavailable." };
  const j = (await res.json()) as {
    current?: { temperature_2m: number; apparent_temperature: number; weather_code: number; wind_speed_10m: number };
    daily?: {
      weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[];
      precipitation_probability_max: number[]; precipitation_sum: number[];
      sunrise: string[]; sunset: string[];
    };
  };
  const c = j.current;
  const d = j.daily;
  if (!c || !d) return { id: "weather", title: "Weather", content: "Weather feed unavailable." };
  const cond = WX[c.weather_code] ?? "conditions";
  const dayCond = WX[d.weather_code[0]] ?? cond;
  const sunset = d.sunset[0]
    ? new Date(d.sunset[0]).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: geo.tz })
    : "";
  const precipNote = d.precipitation_probability_max[0] >= 30
    ? ` ${d.precipitation_probability_max[0]}% chance of precipitation (${d.precipitation_sum[0].toFixed(2)}").`
    : "";
  return {
    id: "weather",
    title: "Weather",
    content:
      `${geo.name}: currently ${Math.round(c.temperature_2m)}°F, ${cond}, feels like ${Math.round(c.apparent_temperature)}°F, wind ${Math.round(c.wind_speed_10m)} mph. ` +
      `Today ${dayCond}, high ${Math.round(d.temperature_2m_max[0])}°F / low ${Math.round(d.temperature_2m_min[0])}°F.${precipNote}` +
      (sunset ? ` Sunset ${sunset}.` : ""),
  };
}

// ---------- Traffic (Google Distance Matrix; requires GOOGLE_MAPS_API_KEY) ----------

export async function collectTraffic(origin: string, destination: string): Promise<Section | null> {
  const o = origin.trim();
  const dst = destination.trim();
  if (!o || !dst) {
    return {
      id: "traffic",
      title: "Traffic",
      content: "Set your commute origin and destination in Configuration.",
    };
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return {
      id: "traffic",
      title: "Traffic",
      content: "Traffic unavailable — Google Maps API key not configured.",
    };
  }
  const params = new URLSearchParams({
    origins: o,
    destinations: dst,
    departure_time: "now",
    traffic_model: "best_guess",
    units: "imperial",
    key,
  });
  const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.error("[traffic]", res.status, await res.text().catch(() => ""));
    return { id: "traffic", title: "Traffic", content: "Traffic feed unavailable." };
  }
  const j = (await res.json()) as {
    status: string;
    rows?: Array<{
      elements?: Array<{
        status: string;
        duration?: { value: number; text: string };
        duration_in_traffic?: { value: number; text: string };
        distance?: { text: string };
      }>;
    }>;
  };
  const el = j.rows?.[0]?.elements?.[0];
  if (!el || el.status !== "OK" || !el.duration) {
    return { id: "traffic", title: "Traffic", content: `Couldn't route ${o} → ${dst}.` };
  }
  const base = el.duration.value;
  const live = el.duration_in_traffic?.value ?? base;
  const deltaMin = Math.round((live - base) / 60);
  const condition =
    deltaMin <= 1 ? "clear" : deltaMin <= 5 ? "light traffic" : deltaMin <= 12 ? "moderate traffic" : "heavy traffic";
  const liveText = el.duration_in_traffic?.text ?? el.duration.text;
  return {
    id: "traffic",
    title: "Traffic",
    content: `${o} → ${dst}: ${liveText}${el.distance ? ` (${el.distance.text})` : ""}, ${condition}${deltaMin > 1 ? `, +${deltaMin} min vs typical` : ""}.`,
  };
}

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
