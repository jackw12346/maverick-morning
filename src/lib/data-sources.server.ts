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
