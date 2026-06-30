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
import { HudCard } from "@/components/hud/hud-card";
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
    <div className="space-y-6">
      {/* Hero */}
      <HudCard
        glow
        eyebrow="Primary Directive"
        title="Morning briefing control"
        actions={
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
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
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="Active modules" value={`${activeSections.length}/4`} hint="data sections" />
          <Stat label="Integrations" value={`${connectedCount}`} hint="connected" />
          <Stat
            label="Smart-home routes"
            value={`${webhookCount}`}
            hint={`${webhooks.data?.length ?? 0} configured`}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {activeSections.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No modules enabled — visit Configuration to choose data sources.
            </span>
          ) : (
            activeSections.map((m) => {
              const Icon = m.icon;
              return (
                <span
                  key={m.key}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hud/30 bg-hud/5 px-2.5 py-1 text-[11px] text-hud"
                >
                  <Icon className="h-3 w-3" /> {m.label}
                </span>
              );
            })
          )}
          {s?.text_to_speech_enabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-alert/40 bg-alert/10 px-2.5 py-1 text-[11px] text-alert">
              <AudioLines className="h-3 w-3" /> TTS · {s.voice}
            </span>
          )}
        </div>
      </HudCard>

      {/* Latest briefing */}
      <HudCard
        eyebrow="Latest transmission"
        title={
          latest.data
            ? new Date(latest.data.created_at).toLocaleString()
            : "No briefings yet"
        }
      >
        {latest.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : latest.data ? (
          <div className="space-y-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {latest.data.briefing_text}
            </p>
            {latest.data.audio_url && <BriefingAudioPlayer src={latest.data.audio_url} />}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Generate your first briefing to see the transcript and audio preview here.
          </p>
        )}
      </HudCard>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/60 p-4">
      <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 mono text-3xl font-bold text-hud" style={{ textShadow: "0 0 10px var(--color-hud-glow)" }}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
