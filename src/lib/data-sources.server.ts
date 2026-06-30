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
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "10",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    console.error("[calendar]", res.status, await res.text().catch(() => ""));
    return {
      id: "calendar",
      title: "Calendar",
      content: "Calendar fetch failed — try reconnecting Google Calendar.",
    };
  }
  const json = (await res.json()) as {
    items?: Array<{
      summary?: string;
      start?: { dateTime?: string; date?: string };
    }>;
  };
  const events = (json.items ?? []).filter((e) => e.summary);
  if (events.length === 0) {
    return {
      id: "calendar",
      title: "Calendar",
      content: "No events on the calendar today. The day is yours.",
    };
  }
  const lines = events.slice(0, 6).map((e) => {
    const when = e.start?.dateTime
      ? new Date(e.start.dateTime).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      : "All day";
    return `${when} ${e.summary}`;
  });
  return {
    id: "calendar",
    title: "Calendar",
    content: `${events.length} event${events.length === 1 ? "" : "s"} today: ${lines.join("; ")}.`,
  };
}

export async function collectWhoop(userId: string): Promise<Section | null> {
  const token = await getValidAccessToken({ userId, provider: "whoop" });
  if (!token) return null;
  // Latest recovery
  const res = await fetch(
    "https://api.prod.whoop.com/developer/v1/recovery?limit=1",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    console.error("[whoop]", res.status, await res.text().catch(() => ""));
    return {
      id: "whoop",
      title: "Recovery",
      content: "Whoop fetch failed — try reconnecting.",
    };
  }
  const json = (await res.json()) as {
    records?: Array<{
      score?: {
        recovery_score?: number;
        hrv_rmssd_milli?: number;
        resting_heart_rate?: number;
      };
    }>;
  };
  const r = json.records?.[0]?.score;
  if (!r) {
    return {
      id: "whoop",
      title: "Recovery",
      content: "No recovery data yet for today.",
    };
  }
  const parts: string[] = [];
  if (r.recovery_score != null)
    parts.push(`Recovery ${Math.round(r.recovery_score)}%`);
  if (r.hrv_rmssd_milli != null) parts.push(`HRV ${Math.round(r.hrv_rmssd_milli)}ms`);
  if (r.resting_heart_rate != null) parts.push(`RHR ${r.resting_heart_rate}`);
  return {
    id: "whoop",
    title: "Recovery",
    content: parts.join(", ") + ".",
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

export async function collectRocaNews(): Promise<Section | null> {
  try {
    const res = await fetch("https://www.readroca.com/", {
      headers: { "User-Agent": "Maverick-Briefing/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const html = await res.text();
    // Extract <h2>/<h3> headlines; readroca uses standard article headings.
    const headlines = Array.from(
      html.matchAll(/<h[23][^>]*>([^<]{12,140})<\/h[23]>/gi),
    )
      .map((m) => decodeEntities(m[1].trim()))
      .filter(
        (t) =>
          t.length > 12 &&
          !/subscribe|sign in|menu|read roca|newsletter/i.test(t),
      );
    const unique = Array.from(new Set(headlines)).slice(0, 4);
    if (unique.length === 0) {
      return {
        id: "news",
        title: "Roca News",
        content: "Could not parse top headlines this morning.",
      };
    }
    return {
      id: "news",
      title: "Roca News",
      content: `Top stories: ${unique.join("; ")}.`,
    };
  } catch (err) {
    console.error("[roca]", err);
    return {
      id: "news",
      title: "Roca News",
      content: "Roca News feed unavailable.",
    };
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
