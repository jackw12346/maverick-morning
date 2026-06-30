import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AudioLines,
  BatteryCharging,
  CalendarDays,
  HeartPulse,
  Newspaper,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { HudCard } from "@/components/hud/hud-card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSettings, updateSettings } from "@/lib/briefing.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const toggles = [
  {
    key: "include_calendar",
    label: "Google Calendar",
    desc: "Today's meetings and time blocks.",
    icon: CalendarDays,
  },
  {
    key: "include_whoop",
    label: "Whoop recovery",
    desc: "Recovery, HRV, and strain targets.",
    icon: HeartPulse,
  },
  {
    key: "include_batteries",
    label: "Device batteries",
    desc: "Phone, watch, earbuds and peripherals.",
    icon: BatteryCharging,
  },
  {
    key: "include_roca_news",
    label: "Roca news digest",
    desc: "Daily headline brief from Roca News.",
    icon: Newspaper,
  },
] as const;

const voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;

function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings(),
  });
  type SettingsPatch = Partial<{
    include_calendar: boolean;
    include_whoop: boolean;
    include_batteries: boolean;
    include_roca_news: boolean;
    text_to_speech_enabled: boolean;
    voice: (typeof voices)[number];
  }>;
  const mut = useMutation({
    mutationFn: (input: SettingsPatch) => updateSettings({ data: input }),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["settings"] });
      const prev = qc.getQueryData(["settings"]);
      qc.setQueryData(["settings"], (old: typeof data) =>
        old ? { ...old, ...input } : old,
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["settings"], ctx.prev);
      toast.error(e instanceof Error ? e.message : "Update failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  return (
    <div className="space-y-6">
      <HudCard eyebrow="Briefing modules" title="Toggle data sources">
        {isLoading || !data ? (
          <div className="h-32 animate-pulse rounded bg-secondary/40" />
        ) : (
          <div className="grid gap-3">
            {toggles.map((t) => {
              const Icon = t.icon;
              const checked = Boolean(data[t.key]);
              return (
                <label
                  key={t.key}
                  className="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-background/40 p-3 transition hover:border-hud/30"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-secondary/60">
                      <Icon className="h-4 w-4 text-hud" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.desc}</div>
                    </div>
                  </div>
                  <Switch
                    checked={checked}
                    onCheckedChange={(v) => mut.mutate({ [t.key]: v })}
                  />
                </label>
              );
            })}
          </div>
        )}
      </HudCard>

      <HudCard eyebrow="Audio synthesis" title="Text-to-speech">
        {data && (
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-background/40 p-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-secondary/60">
                  <AudioLines className="h-4 w-4 text-hud" />
                </div>
                <div>
                  <div className="text-sm font-medium">Generate audio</div>
                  <div className="text-xs text-muted-foreground">
                    Synthesize each briefing into an MP3 for Sonos playback.
                  </div>
                </div>
              </div>
              <Switch
                checked={Boolean(data.text_to_speech_enabled)}
                onCheckedChange={(v) => mut.mutate({ text_to_speech_enabled: v })}
              />
            </label>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 bg-background/40 p-3">
              <div>
                <Label className="text-sm font-medium">Voice</Label>
                <div className="text-xs text-muted-foreground">Default narration voice.</div>
              </div>
              <Select
                value={data.voice ?? "alloy"}
                onValueChange={(v) => mut.mutate({ voice: v as (typeof voices)[number] })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {voices.map((v) => (
                    <SelectItem key={v} value={v} className="capitalize">
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </HudCard>
    </div>
  );
}
