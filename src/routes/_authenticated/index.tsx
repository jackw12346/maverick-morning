import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  BatteryCharging,
  CalendarDays,
  HeartPulse,
  Loader2,
  Newspaper,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { AlarmClock } from "@/components/AlarmClock";
import { BriefingAudioPlayer } from "@/components/BriefingAudioPlayer";
import { Button } from "@/components/ui/button";
import {
  generateMorningBriefing,
  getLatestLog,
  getSettings,
  listIntegrations,
  listWebhooks,
} from "@/lib/briefing.functions";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

const sectionMeta = [
  { key: "include_calendar", label: "Calendar", icon: CalendarDays },
  { key: "include_whoop", label: "Recovery", icon: HeartPulse },
  { key: "include_batteries", label: "Devices", icon: BatteryCharging },
  { key: "include_roca_news", label: "News", icon: Newspaper },
] as const;

function Dashboard() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => getSettings() });
  const latest = useQuery({ queryKey: ["latest-log"], queryFn: () => getLatestLog() });
  const integrations = useQuery({
    queryKey: ["integrations"],
    queryFn: () => listIntegrations(),
  });
  const webhooks = useQuery({ queryKey: ["webhooks"], queryFn: () => listWebhooks() });

  const generate = useMutation({
    mutationFn: () => generateMorningBriefing(),
    onSuccess: (res) => {
      toast.success(
        `Briefing generated · ${res.webhooks_delivered}/${res.webhooks_total} webhook${res.webhooks_total === 1 ? "" : "s"} fired`,
      );
      qc.invalidateQueries({ queryKey: ["latest-log"] });
      qc.invalidateQueries({ queryKey: ["logs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Generation failed"),
  });

  const s = settings.data;
  const activeSections = sectionMeta.filter((m) => s?.[m.key]);
  const connectedCount =
    integrations.data?.filter((i) => i.status === "connected").length ?? 0;
  const webhookCount = webhooks.data?.filter((w) => w.enabled).length ?? 0;

  return (
    <div className="space-y-8">
      {/* Magazine masthead */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Today's Edition
          </div>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Morning Briefing
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Your day, distilled — calendar, recovery, devices, and the news worth your attention.
          </p>
        </div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending} size="lg">
          {generate.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Compiling…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Generate briefing
            </>
          )}
        </Button>
      </header>

      <AlarmClock />

      {/* Featured story */}
      <article className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="border-b border-border/60 px-6 py-4">
          <div className="text-[11px] uppercase tracking-[0.2em] text-primary">
            Latest Edition
          </div>
          <div className="mt-1 font-display text-2xl font-semibold">
            {latest.data
              ? new Date(latest.data.created_at).toLocaleString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "No briefings yet"}
          </div>
        </div>
        <div className="px-6 py-6">
          {latest.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : latest.data ? (
            <div className="space-y-5">
              <div className="prose prose-sm prose-invert max-w-none text-foreground/90 prose-p:leading-relaxed prose-strong:text-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{latest.data.briefing_text}</ReactMarkdown>
              </div>
              {latest.data.audio_url && <BriefingAudioPlayer src={latest.data.audio_url} />}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Generate your first briefing to see the transcript and audio preview here.
            </p>
          )}
        </div>
      </article>

      {/* Stats row */}
      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Active modules" value={`${activeSections.length}/4`} hint="data sections" />
        <Stat label="Integrations" value={`${connectedCount}`} hint="connected" />
        <Stat
          label="Smart-home routes"
          value={`${webhookCount}`}
          hint={`${webhooks.data?.length ?? 0} configured`}
        />
      </section>

      {/* Module chips */}
      <section>
        <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          In this edition
        </div>
        <div className="flex flex-wrap gap-2">
          {activeSections.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              No modules enabled — visit Configuration to choose data sources.
            </span>
          ) : (
            activeSections.map((m) => {
              const Icon = m.icon;
              return (
                <span
                  key={m.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" /> {m.label}
                </span>
              );
            })
          )}
          {s?.text_to_speech_enabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary">
              <AudioLines className="h-3.5 w-3.5" /> TTS · {s.voice}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-5">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-display text-4xl font-semibold">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
