// Server-only data collectors for the morning briefing.
import { getValidAccessToken } from "./oauth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Section = { id: string; title: string; content: string; error?: string };

// ---------- Weather (Open-Meteo, no API key required) ----------

async function geocode(location: string): Promise<{ lat: number; lon: number; name: string; tz: string } | null> {
  // Open-Meteo geocoder matches a single name token best — strip ", ST"/", Country" suffixes on retry.
  const variants = Array.from(
    new Set([
      location,
      location.split(",")[0]?.trim() ?? location,
      location.replace(/,/g, " ").replace(/\s+/g, " ").trim(),
    ].filter(Boolean)),
  );
  for (const q of variants) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) {
        console.error("[geocode]", q, res.status);
        continue;
      }
      const j = (await res.json()) as {
        results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string; country_code?: string; timezone?: string }>;
      };
      const r = j.results?.[0];
      if (!r) continue;
      const label = [r.name, r.admin1, r.country_code].filter(Boolean).join(", ");
      return { lat: r.latitude, lon: r.longitude, name: label, tz: r.timezone ?? "auto" };
    } catch (e) {
      console.error("[geocode]", q, e instanceof Error ? e.message : e);
    }
  }
  return null;
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

async function fetchWttrIn(loc: string): Promise<Section | null> {
  const res = await fetch(`https://wttr.in/${encodeURIComponent(loc)}?format=j1`, {
    headers: { "User-Agent": "Mozilla/5.0 MaverickBriefing" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`wttr.in ${res.status}`);
  const j = (await res.json()) as {
    current_condition?: Array<{ temp_F: string; FeelsLikeF: string; weatherDesc: Array<{ value: string }>; windspeedMiles: string; humidity: string }>;
    weather?: Array<{
      maxtempF: string;
      mintempF: string;
      astronomy?: Array<{ sunset: string }>;
      hourly?: Array<{ chanceofrain: string; weatherDesc: Array<{ value: string }> }>;
    }>;
    nearest_area?: Array<{ areaName: Array<{ value: string }>; region: Array<{ value: string }>; country: Array<{ value: string }> }>;
  };
  const cur = j.current_condition?.[0];
  const today = j.weather?.[0];
  if (!cur || !today) throw new Error("wttr.in: empty payload");
  const area = j.nearest_area?.[0];
  const name = area
    ? [area.areaName?.[0]?.value, area.region?.[0]?.value, area.country?.[0]?.value].filter(Boolean).join(", ")
    : loc;
  const cond = cur.weatherDesc?.[0]?.value ?? "conditions";
  const midday = today.hourly?.[Math.min(4, (today.hourly?.length ?? 1) - 1)];
  const dayCond = midday?.weatherDesc?.[0]?.value ?? cond;
  const rainChance = Math.max(...(today.hourly?.map((h) => parseInt(h.chanceofrain, 10) || 0) ?? [0]));
  const sunset = today.astronomy?.[0]?.sunset ?? "";
  const precipNote = rainChance >= 30 ? ` ${rainChance}% chance of precipitation.` : "";
  return {
    id: "weather",
    title: "Weather",
    content:
      `${name}: currently ${cur.temp_F}°F, ${cond.toLowerCase()}, feels like ${cur.FeelsLikeF}°F, wind ${cur.windspeedMiles} mph, humidity ${cur.humidity}%. ` +
      `Today ${dayCond.toLowerCase()}, high ${today.maxtempF}°F / low ${today.mintempF}°F.${precipNote}` +
      (sunset ? ` Sunset ${sunset}.` : ""),
  };
}

export async function collectWeather(location: string): Promise<Section | null> {
  const loc = location.trim();
  if (!loc) {
    return {
      id: "weather",
      title: "Weather",
      content: "No weather location set — add one in Configuration.",
    };
  }
  const errors: string[] = [];

  // Provider 1: Open-Meteo (free, no key).
  try {
    const geo = await geocode(loc);
    if (!geo) {
      errors.push(`geocoding: couldn't find "${loc}"`);
    } else {
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
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        errors.push(`open-meteo ${res.status}: ${body.slice(0, 120)}`);
        console.error("[weather open-meteo]", res.status, body);
      } else {
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
        if (c && d) {
          const cond = WX[c.weather_code] ?? "conditions";
          const dayCond = WX[d.weather_code[0]] ?? cond;
          const sunsetRaw = d.sunset[0] ?? "";
          const sunsetMatch = sunsetRaw.match(/T(\d{2}):(\d{2})/);
          let sunset = "";
          if (sunsetMatch) {
            const h = parseInt(sunsetMatch[1], 10);
            const m = sunsetMatch[2];
            const period = h >= 12 ? "PM" : "AM";
            const h12 = h % 12 === 0 ? 12 : h % 12;
            sunset = `${h12}:${m} ${period}`;
          }
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
        errors.push("open-meteo: empty payload");
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`open-meteo: ${msg}`);
    console.error("[weather open-meteo]", msg);
  }

  // Provider 2 (fallback): wttr.in — no key, different infra, works when Open-Meteo hits its daily cap.
  try {
    const section = await fetchWttrIn(loc);
    if (section) return section;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`wttr.in: ${msg}`);
    console.error("[weather wttr.in]", msg);
  }

  return { id: "weather", title: "Weather", content: "Weather feed unavailable.", error: errors.join(" | ") };
}

// ---------- Traffic (Google Maps via Firecrawl scrape — live traffic, personal use) ----------
// Scrapes the public Google Maps directions page through Firecrawl so we get
// the "with traffic" drive time without using the paid Distance Matrix API.

function parseDurationToMin(s: string): number | null {
  const hr = s.match(/(\d+)\s*(?:h|hr|hour)s?/i);
  const mn = s.match(/(\d+)\s*min/i);
  if (!hr && !mn) return null;
  return (hr ? parseInt(hr[1], 10) * 60 : 0) + (mn ? parseInt(mn[1], 10) : 0);
}

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
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return { id: "traffic", title: "Traffic", content: "Firecrawl is not configured." };
  }
  try {
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(dst)}&travelmode=driving`;
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: mapsUrl,
        formats: ["markdown"],
        onlyMainContent: false,
        waitFor: 5000,
        location: { country: "US", languages: ["en"] },
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[traffic] firecrawl", res.status, body.slice(0, 300));
      return { id: "traffic", title: "Traffic", content: "Traffic lookup failed (scrape error)." };
    }
    const j = (await res.json()) as {
      success?: boolean;
      data?: { markdown?: string };
      markdown?: string;
    };
    const md = j.data?.markdown ?? j.markdown ?? "";
    if (!md) {
      return { id: "traffic", title: "Traffic", content: "Traffic lookup returned no data." };
    }

    const candidates: number[] = [];
    const re = /(\d+\s*(?:h|hr|hour)s?\s*\d+\s*min|\d+\s*(?:h|hr|hour)s?|\d+\s*min)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) {
      const mins = parseDurationToMin(m[1]);
      if (mins && mins >= 1 && mins <= 60 * 24) candidates.push(mins);
    }
    const distMatch = md.match(/(\d+(?:\.\d+)?)\s*(mi|km)\b/i);

    if (candidates.length === 0) {
      return {
        id: "traffic",
        title: "Traffic",
        content: `Couldn't read drive time from Google Maps for ${o} → ${dst}. Try a more specific address.`,
      };
    }
    const driveMin = candidates[0];
    const hrs = Math.floor(driveMin / 60);
    const mins = driveMin % 60;
    const pretty = hrs > 0 ? `${hrs} h ${mins} min` : `${mins} min`;
    const distStr = distMatch ? ` (${distMatch[1]} ${distMatch[2]})` : "";
    return {
      id: "traffic",
      title: "Traffic",
      content: `${o} → ${dst}: about ${pretty}${distStr} with current traffic (Google Maps).`,
    };
  } catch (e) {
    console.error("[traffic]", e);
    return { id: "traffic", title: "Traffic", content: "Traffic lookup failed." };
  }
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
  const filtered = allItems.filter((e: any) => {
    if (!e?.summary || e.status === "cancelled") return false;
    const key = `${e.__calendarId}-${e.id}-${e.start?.dateTime ?? e.start?.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (e.start?.date) return e.start.date === todayKey;
    if (!e.start?.dateTime) return false;
    return dateKeyInTimeZone(new Date(e.start.dateTime), tz) === todayKey;
  });

  const getRange = (e: any): [number, number] | null => {
    const s = e.start?.dateTime ?? e.start?.date;
    const en = e.end?.dateTime ?? e.end?.date ?? s;
    if (!s) return null;
    return [new Date(s).getTime(), new Date(en).getTime()];
  };
  const personalRanges = filtered
    .filter((e: any) => !e.__family)
    .map(getRange)
    .filter((r): r is [number, number] => !!r);

  // If a family event overlaps any personal event, drop the family event — personal takes priority.
  const deconflicted = filtered.filter((e: any) => {
    if (!e.__family) return true;
    const r = getRange(e);
    if (!r) return true;
    return !personalRanges.some(([ps, pe]) => r[0] < pe && r[1] > ps);
  });

  const events = deconflicted.sort((a: any, b: any) => {
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

// Fetch headlines + source via Firecrawl search (Google News RSS blocks Cloudflare Worker IPs).
type NewsItem = { headline: string; source: string };

async function fetchNewsViaFirecrawl(query: string, limit = 5): Promise<{ items: NewsItem[]; error?: string }> {
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!fcKey) return { items: [], error: "FIRECRAWL_API_KEY missing" };
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fcKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `${query} latest news`,
        limit,
        tbs: "qdr:d", // past 24 hours
        lang: "en",
        country: "us",
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[news firecrawl]", query, res.status, body.slice(0, 200));
      return { items: [], error: `Firecrawl search ${res.status} for "${query}": ${body.slice(0, 120)}` };
    }
    const j = (await res.json()) as {
      data?: {
        web?: Array<{ title?: string; description?: string; url?: string }>;
        news?: Array<{ title?: string; snippet?: string; url?: string }>;
      } | Array<{ title?: string; description?: string; url?: string }>;
    };
    const rawResults = Array.isArray(j.data)
      ? j.data
      : [...(j.data?.news ?? []), ...(j.data?.web ?? [])];
    const items: NewsItem[] = [];
    for (const r of rawResults) {
      const title = (r as { title?: string }).title?.trim();
      const url = (r as { url?: string }).url ?? "";
      if (!title || title.length < 8) continue;
      let source = "source unknown";
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        // Prettify e.g. "reuters.com" -> "Reuters", "nytimes.com" -> "Nytimes"
        source = host.split(".")[0].replace(/^\w/, (c) => c.toUpperCase());
      } catch {
        /* ignore */
      }
      items.push({ headline: title, source });
      if (items.length >= limit) break;
    }
    if (items.length === 0) {
      return { items: [], error: `Firecrawl returned no results for "${query}"` };
    }
    return { items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[news firecrawl]", query, msg);
    return { items: [], error: `Firecrawl "${query}": ${msg}` };
  }
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
      queries.slice(0, 3).map(async (q) => {
        const r = await fetchNewsViaFirecrawl(q, 4).catch((e: unknown) => ({ items: [] as NewsItem[], error: String(e) }));
        return { topic: q, headlines: r.items, error: r.error };
      }),
    );
    const errors = all.filter((g) => g.error).map((g) => g.error as string);
    const groups = all.filter((g) => g.headlines.length > 0);
    if (groups.length === 0) {
      return {
        id: "news",
        title: "News",
        content: "News feed unavailable this morning.",
        error: errors.length > 0 ? errors.join(" | ") : "no headlines returned",
      };
    }

    // If we have an AI key, let the model tailor a 2-3 sentence brief.
    if (apiKey) {
      const prompt = [
        `Subject: ${displayName}.`,
        `Their interests: ${cleanedTopics.join(", ") || "general world news"}.`,
        "Below are real headlines from this morning grouped by topic, each with its source. Write a tight 2-4 sentence news brief tailored to them, prioritizing what is most relevant and novel. Synthesize — do not quote headlines verbatim. ALWAYS attribute each item with its source in parentheses, e.g. \"(Reuters)\". Do not invent facts beyond the headlines.",
        ...groups.map(
          (g) =>
            `Topic "${g.topic}":\n` +
            g.headlines.map((h) => `- ${h.headline} (${h.source})`).join("\n"),
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
          signal: AbortSignal.timeout(10000),
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

    // Fallback: raw headline list with sources.
    const flat = groups
      .map(
        (g) =>
          `${g.topic}: ` +
          g.headlines
            .slice(0, 2)
            .map((h) => `${h.headline} (${h.source})`)
            .join("; "),
      )
      .join(". ");
    return { id: "news", title: "News", content: flat + "." };

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[news]", msg);
    return { id: "news", title: "News", content: "News feed unavailable.", error: msg };
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
