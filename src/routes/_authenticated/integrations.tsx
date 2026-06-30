import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BatteryMedium,
  CalendarDays,
  CheckCircle2,
  Copy,
  HeartPulse,
  Lightbulb,
  Loader2,
  Plug,
  Plus,
  Radio,
  Speaker,
  Trash2,
  Webhook,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { HudCard } from "@/components/hud/hud-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteWebhook,
  disconnectIntegration,
  getIngestToken,
  listBatteries,
  listIntegrations,
  listWebhooks,
  pingWebhook,
  startOAuth,
  upsertWebhook,
} from "@/lib/briefing.functions";

const searchSchema = z.object({
  connected: z.string().optional(),
  oauth_error: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/integrations")({
  validateSearch: searchSchema,
  component: IntegrationsPage,
});

const providers = [
  {
    id: "google_calendar" as const,
    label: "Google Calendar",
    desc: "Pull today's events and meeting load from your primary calendar.",
    icon: CalendarDays,
  },
  {
    id: "whoop" as const,
    label: "Whoop",
    desc: "Latest recovery score, HRV, and resting heart rate.",
    icon: HeartPulse,
  },
];

const targets = [
  { id: "sonos", label: "Sonos", icon: Speaker },
  { id: "nanoleaf", label: "Nanoleaf", icon: Lightbulb },
  { id: "other", label: "Other", icon: Radio },
] as const;

function IntegrationsPage() {
  const qc = useQueryClient();
  const search = useSearch({ from: "/_authenticated/integrations" });

  useEffect(() => {
    if (search.connected) {
      toast.success(`Connected: ${search.connected.replace("_", " ")}`);
      qc.invalidateQueries({ queryKey: ["integrations"] });
      window.history.replaceState({}, "", "/integrations");
    }
    if (search.oauth_error) {
      toast.error(`OAuth failed: ${search.oauth_error}`);
      window.history.replaceState({}, "", "/integrations");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const integrations = useQuery({
    queryKey: ["integrations"],
    queryFn: () => listIntegrations(),
  });
  const webhooks = useQuery({ queryKey: ["webhooks"], queryFn: () => listWebhooks() });
  const ingest = useQuery({
    queryKey: ["ingest-token"],
    queryFn: () => getIngestToken(),
  });
  const batteries = useQuery({
    queryKey: ["batteries"],
    queryFn: () => listBatteries(),
  });

  const startConnect = useMutation({
    mutationFn: (provider: "google_calendar" | "whoop") =>
      startOAuth({ data: { provider, origin: window.location.origin } }),
    onSuccess: (r) => {
      if (r.ok) {
        window.location.href = r.url;
      } else {
        toast.error(r.error);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const disconnect = useMutation({
    mutationFn: (provider: "google_calendar" | "whoop") =>
      disconnectIntegration({ data: { provider } }),
    onSuccess: () => {
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-6">
      <HudCard eyebrow="External feeds" title="Integration manager">
        <div className="grid gap-3 md:grid-cols-2">
          {providers.map((p) => {
            const row = integrations.data?.find((i) => i.provider === p.id);
            const connected = row?.status === "connected";
            const errored = row?.status === "error";
            const Icon = p.icon;
            return (
              <div
                key={p.id}
                className="relative rounded-md border border-border/60 bg-background/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border/60 bg-secondary/60">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{p.label}</div>
                      <div className="text-xs text-muted-foreground">{p.desc}</div>
                    </div>
                  </div>
                  <StatusPill connected={connected} errored={errored} />
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {row?.updated_at
                      ? `synced ${new Date(row.updated_at).toLocaleString()}`
                      : "not connected"}
                  </div>
                  {connected ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => disconnect.mutate(p.id)}
                      disabled={disconnect.isPending}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => startConnect.mutate(p.id)}
                      disabled={startConnect.isPending}
                    >
                      {startConnect.isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plug className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          You'll be redirected to the provider to authorize Maverick. Tokens are stored
          per user and refreshed automatically.
        </p>
      </HudCard>

      <HudCard
        eyebrow="Device telemetry"
        title="Battery ingest endpoint"
      >
        <p className="text-sm text-muted-foreground">
          POST device battery levels from an iOS Shortcut, Home Assistant, or any
          script. The endpoint is public but authorized by your personal token.
        </p>
        <div className="mt-3 space-y-2">
          <CodeRow label="URL" value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/public/ingest/batteries`} />
          <CodeRow label="Token" value={ingest.data?.token ?? "loading…"} secret />
          <details className="mt-2 rounded-md border border-border/60 bg-background/40 p-3 text-xs">
            <summary className="cursor-pointer text-muted-foreground">Example payload</summary>
            <pre className="mt-2 overflow-auto text-[11px] leading-relaxed">{`POST /api/public/ingest/batteries
Content-Type: application/json

{
  "token": "${ingest.data?.token ?? "<your-token>"}",
  "devices": [
    { "name": "iPhone", "level": 84, "charging": false },
    { "name": "AirPods", "level": 38 },
    { "name": "Watch", "level": 91, "charging": true }
  ]
}`}</pre>
          </details>
          <ShortcutGuide
            url={`${typeof window !== "undefined" ? window.location.origin : ""}/api/public/ingest/batteries`}
            token={ingest.data?.token ?? "<your-token>"}
          />
        </div>
        {batteries.data && batteries.data.length > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Last seen
            </div>
            <div className="flex flex-wrap gap-2">
              {batteries.data.map((b) => (
                <span
                  key={b.device_name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs"
                >
                  <BatteryMedium className="h-3.5 w-3.5 text-primary" />
                  {b.device_name} · {b.level}%
                  {b.is_charging ? " ⚡" : ""}
                </span>
              ))}
            </div>
          </div>
        )}
      </HudCard>

      <HudCard
        eyebrow="Smart-home webhooks"
        title="Sonos · Nanoleaf · automation bridges"
        actions={<NewWebhookButton onCreated={() => qc.invalidateQueries({ queryKey: ["webhooks"] })} />}
      >
        {webhooks.isLoading ? (
          <div className="h-24 animate-pulse rounded bg-secondary/40" />
        ) : webhooks.data && webhooks.data.length > 0 ? (
          <div className="space-y-2">
            {webhooks.data.map((w) => (
              <WebhookRow key={w.id} webhook={w as Webhook} />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/60 bg-background/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No webhooks configured. Add one to forward your briefing to Make.com, Home Assistant,
            n8n, or any HTTP endpoint.
          </div>
        )}
      </HudCard>
    </div>
  );
}

function CodeRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/40 p-2.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-12">
        {label}
      </span>
      <code className="flex-1 truncate text-xs font-mono">
        {shown ? value : "•".repeat(Math.min(value.length, 36))}
      </code>
      {secret && (
        <Button size="sm" variant="ghost" onClick={() => setShown((s) => !s)}>
          {shown ? "Hide" : "Show"}
        </Button>
      )}
      <Button
        size="sm"
        variant="secondary"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast.success("Copied");
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function StatusPill({ connected, errored }: { connected: boolean; errored?: boolean }) {
  if (errored) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
        <Activity className="h-3 w-3" /> Error
      </span>
    );
  }
  return connected ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
      <CheckCircle2 className="h-3 w-3" /> Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground">
      <Activity className="h-3 w-3" /> Offline
    </span>
  );
}

type Webhook = {
  id: string;
  label: string;
  target: "sonos" | "nanoleaf" | "other";
  url: string;
  enabled: boolean;
};

function WebhookRow({ webhook }: { webhook: Webhook }) {
  const qc = useQueryClient();
  const targetMeta = targets.find((t) => t.id === webhook.target)!;
  const Icon = targetMeta.icon;

  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      upsertWebhook({
        data: {
          id: webhook.id,
          label: webhook.label,
          target: webhook.target,
          url: webhook.url,
          enabled,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });
  const del = useMutation({
    mutationFn: () => deleteWebhook({ data: { id: webhook.id } }),
    onSuccess: () => {
      toast.success("Webhook removed");
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
  });
  const ping = useMutation({
    mutationFn: () => pingWebhook({ data: { id: webhook.id } }),
    onSuccess: (r) =>
      r.ok ? toast.success(`Ping ok · ${r.status}`) : toast.error(`Ping failed · ${r.status}`),
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-background/40 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border/60 bg-secondary/60">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{webhook.label}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {webhook.target}
          </span>
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">{webhook.url}</div>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          checked={webhook.enabled}
          onCheckedChange={(v) => toggle.mutate(v)}
          aria-label="Toggle enabled"
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => ping.mutate()}
          disabled={ping.isPending}
        >
          {ping.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => del.mutate()} disabled={del.isPending}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

function NewWebhookButton({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState<"sonos" | "nanoleaf" | "other">("sonos");

  const create = useMutation({
    mutationFn: () =>
      upsertWebhook({ data: { label, url, target, enabled: true } }),
    onSuccess: () => {
      toast.success("Webhook added");
      setOpen(false);
      setLabel("");
      setUrl("");
      setTarget("sonos");
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add webhook
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider">Label</Label>
        <Input
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Kitchen Sonos"
          className="h-8 w-36"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider">Target</Label>
        <Select value={target} onValueChange={(v) => setTarget(v as typeof target)}>
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {targets.map((t) => (
              <SelectItem key={t.id} value={t.id} className="capitalize">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wider">URL</Label>
        <Input
          required
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://hook.make.com/…"
          className="h-8 w-64"
        />
      </div>
      <Button type="submit" size="sm" disabled={create.isPending}>
        {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="mr-1.5 h-3.5 w-3.5" />}
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
