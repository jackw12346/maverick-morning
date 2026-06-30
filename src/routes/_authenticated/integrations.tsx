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

function ShortcutGuide({ url, token }: { url: string; token: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"build" | "automate" | "extend" | "troubleshoot">("build");

  const jsonBody = `{
  "token": "${token}",
  "devices": [
    { "name": "iPhone", "level": [Battery Level], "charging": false }
  ]
}`;

  const extendedJson = `{
  "token": "${token}",
  "devices": [
    { "name": "iPhone",       "level": [Battery Level],    "charging": false },
    { "name": "Apple Watch",  "level": [Watch Battery],    "charging": false },
    { "name": "AirPods Pro",  "level": [AirPods Battery],  "charging": false },
    { "name": "MacBook Pro",  "level": [Mac Battery],      "charging": false }
  ]
}`;

  const copy = (value: string, label = "Copied") => {
    navigator.clipboard.writeText(value);
    toast.success(label);
  };

  const CopyRow = ({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) => (
    <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background/70 p-2">
      <span className="mt-0.5 shrink-0 rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <code className={`flex-1 whitespace-pre-wrap break-all text-[11px] ${mono ? "font-mono" : ""}`}>{value}</code>
      <Button size="sm" variant="secondary" type="button" onClick={() => copy(value)}>
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );

  // Visual mock of a Shortcut action card (mimics the iOS UI)
  const ActionCard = ({
    icon,
    color = "bg-blue-500",
    title,
    detail,
    output,
  }: {
    icon: React.ReactNode;
    color?: string;
    title: string;
    detail?: React.ReactNode;
    output?: string;
  }) => (
    <div className="rounded-lg border border-border/60 bg-gradient-to-b from-background/80 to-background/40 p-2.5 shadow-sm">
      <div className="flex items-start gap-2.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white ${color}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold leading-tight">{title}</div>
          {detail && <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{detail}</div>}
          {output && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">
              → {output}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const Arrow = () => (
    <div className="flex justify-center py-0.5 text-muted-foreground/60">
      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 1v7M2 5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
  );

  const Step = ({
    n,
    title,
    children,
  }: { n: number; title: string; children: React.ReactNode }) => (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-[11px] font-semibold text-primary">
        {n}
      </span>
      <div className="flex-1 space-y-2">
        <div className="text-[13px] font-semibold leading-tight">{title}</div>
        <div className="space-y-2 text-[11.5px] leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </li>
  );

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
        tab === id
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border/60 bg-background/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs"
      >
        <span className="flex items-center gap-2 font-medium">
          <BatteryMedium className="h-3.5 w-3.5 text-primary" />
          iOS Shortcut · step-by-step setup
          <span className="rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            ~5 min
          </span>
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <div className="border-t border-border/60">
          {/* Endpoint summary */}
          <div className="space-y-2 border-b border-border/60 bg-background/30 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Endpoint</div>
            <CopyRow label="POST" value={url} />
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="rounded border border-border/60 bg-background/60 p-1.5">
                <div className="text-muted-foreground">Method</div>
                <div className="font-mono text-foreground">POST</div>
              </div>
              <div className="rounded border border-border/60 bg-background/60 p-1.5">
                <div className="text-muted-foreground">Auth</div>
                <div className="font-mono text-foreground">token in body</div>
              </div>
              <div className="rounded border border-border/60 bg-background/60 p-1.5">
                <div className="text-muted-foreground">Format</div>
                <div className="font-mono text-foreground">application/json</div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border/60 bg-background/20 p-2">
            <TabBtn id="build" label="1. Build" />
            <TabBtn id="automate" label="2. Automate" />
            <TabBtn id="extend" label="3. Extend" />
            <TabBtn id="troubleshoot" label="Troubleshoot" />
          </div>

          {tab === "build" && (
            <ol className="space-y-4 p-4">
              <Step n={1} title="Open Shortcuts → New Shortcut">
                <p>
                  On iPhone, open the <strong>Shortcuts</strong> app → tap <strong>+</strong> in the top-right.
                  Tap the title bar and rename it to <em>“Maverick Battery Sync”</em>.
                  Optionally assign a glyph (battery icon) and a color.
                </p>
              </Step>

              <Step n={2} title="Add these two actions">
                <p>Tap the search bar at the bottom and add each action. iOS Shortcuts has no “Get Power State” action — charging is sent as a fixed <code>false</code> here, then flipped to <code>true</code> by a separate Charger automation (covered on the Automate tab).</p>
                <div className="space-y-1.5">
                  <ActionCard
                    icon={<BatteryMedium className="h-4 w-4" />}
                    color="bg-green-600"
                    title="Get Battery Level"
                    detail="No options. Outputs a number 0–100."
                    output="Battery Level"
                  />
                  <Arrow />
                  <ActionCard
                    icon={<Webhook className="h-4 w-4" />}
                    color="bg-blue-600"
                    title="Get Contents of URL"
                    detail={<>Paste the endpoint URL. Tap <strong>Show More</strong> to reveal Method / Headers / Request Body.</>}
                  />
                </div>
              </Step>

              <Step n={3} title="Configure Get Contents of URL">
                <div className="rounded-md border border-border/60 bg-background/60 p-2.5 text-[11px] space-y-1">
                  <div><span className="text-muted-foreground">URL: </span><span className="font-mono break-all">{url}</span></div>
                  <div><span className="text-muted-foreground">Method: </span><span className="font-mono">POST</span></div>
                </div>

                <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
                  <div className="text-[12px] font-semibold text-foreground">Headers</div>
                  <p className="mt-1 text-[11px]">Tap <strong>Add new header</strong>. Two fields appear — <em>Key</em> and <em>Text</em>:</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div className="rounded border border-border/60 bg-background/70 p-1.5"><span className="text-muted-foreground">Key</span><br/>Content-Type</div>
                    <div className="rounded border border-border/60 bg-background/70 p-1.5"><span className="text-muted-foreground">Text</span><br/>application/json</div>
                  </div>
                </div>

                <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
                  <div className="text-[12px] font-semibold text-foreground">Request Body → JSON</div>
                  <p className="mt-1 text-[11px]">
                    Set <em>Request Body</em> to <strong>JSON</strong>. Tap <strong>Add new field</strong> — each row has a <strong>Key</strong> input, a small <strong>type picker</strong> on the right (Text · Number · Array · Dictionary · Boolean), and a value input that changes with the type. Add these two top-level fields:
                  </p>

                  <div className="mt-2 space-y-2 text-[11px]">
                    <div className="rounded border border-border/60 bg-background/70 p-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-secondary/60 px-1 text-[10px]">Key</span>
                        <span className="font-mono">token</span>
                        <span className="ml-auto rounded bg-secondary/60 px-1 text-[10px]">type: Text</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded bg-secondary/60 px-1 text-[10px]">Text</span>
                        <span className="font-mono break-all">{token}</span>
                      </div>
                    </div>

                    <div className="rounded border border-border/60 bg-background/70 p-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-secondary/60 px-1 text-[10px]">Key</span>
                        <span className="font-mono">devices</span>
                        <span className="ml-auto rounded bg-secondary/60 px-1 text-[10px]">type: Array</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">Tap the array row → <strong>Add new item</strong> → set the item's type to <strong>Dictionary</strong>. Inside that dictionary, add three fields the same way:</p>
                      <ul className="mt-1.5 ml-2 space-y-1">
                        <li className="flex items-center gap-2"><span className="rounded bg-secondary/60 px-1 text-[10px]">Key</span><span className="font-mono">name</span> · <span className="rounded bg-secondary/60 px-1 text-[10px]">Text</span> · <span className="font-mono">iPhone</span></li>
                        <li className="flex items-center gap-2"><span className="rounded bg-secondary/60 px-1 text-[10px]">Key</span><span className="font-mono">level</span> · <span className="rounded bg-secondary/60 px-1 text-[10px]">Number</span> · tap the value, then insert the <strong>Battery Level</strong> magic variable</li>
                        <li className="flex items-center gap-2"><span className="rounded bg-secondary/60 px-1 text-[10px]">Key</span><span className="font-mono">charging</span> · <span className="rounded bg-secondary/60 px-1 text-[10px]">Boolean</span> · toggle <strong>off</strong></li>
                      </ul>
                    </div>
                  </div>

                  <p className="mt-2 text-[11px] text-muted-foreground">
                    The JSON below is what your fields equate to — useful as a sanity check, not something to paste anywhere.
                  </p>
                </div>
                <CopyRow label="Reference JSON" value={jsonBody} />
              </Step>



              <Step n={4} title="Run once to test">
                <p>
                  Tap the <strong>▶︎ Play</strong> button in the bottom-right of the editor. Grant the network permission prompt.
                  Within a few seconds, your iPhone should appear under <em>Last seen devices</em> below.
                </p>
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-[11px] text-emerald-300/90">
                  Expected response: <code className="font-mono">200 OK</code> with body <code className="font-mono">{`{"ok":true}`}</code>
                </div>
              </Step>
            </ol>
          )}

          {tab === "automate" && (
            <ol className="space-y-4 p-4">
              <Step n={1} title="Open the Automation tab">
                <p>In Shortcuts, tap <strong>Automation</strong> at the bottom → <strong>+</strong> → <strong>Create Personal Automation</strong>.</p>
              </Step>
              <Step n={2} title="Pick a trigger (recommended combo)">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
                    <div className="text-[12px] font-semibold">Time of Day</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Daily at <strong>6:45 AM</strong> — gives Maverick fresh battery data before the morning briefing.</div>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
                    <div className="text-[12px] font-semibold">Battery Level</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Falls below <strong>30%</strong> — keeps the dashboard accurate during the day.</div>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
                    <div className="text-[12px] font-semibold">Charger</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Is <strong>Connected</strong> / Disconnected — captures plug/unplug events.</div>
                  </div>
                  <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
                    <div className="text-[12px] font-semibold">App</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">When <strong>Maverick</strong> is opened — refresh on demand.</div>
                  </div>
                </div>
              </Step>
              <Step n={3} title="Attach the shortcut">
                <p>
                  Tap <strong>Next</strong> → search for <em>Run Shortcut</em> → select <strong>Maverick Battery Sync</strong>.
                  On the final screen, turn <strong>Ask Before Running</strong> <em>off</em> and <strong>Notify When Run</strong> <em>off</em> for silent execution.
                </p>
              </Step>
              <Step n={4} title="Verify in the Maverick dashboard">
                <p>
                  Return to this page. The <em>Last seen</em> column should update to “a few seconds ago”.
                  If it doesn't, jump to the <strong>Troubleshoot</strong> tab.
                </p>
              </Step>
            </ol>
          )}

          {tab === "extend" && (
            <div className="space-y-4 p-4 text-[11.5px] leading-relaxed text-muted-foreground">
              <div>
                <div className="text-[13px] font-semibold text-foreground">Multiple devices in one payload</div>
                <p className="mt-1">
                  The <code>devices</code> array accepts any number of entries. Use one shortcut per source device (iPhone, iPad),
                  or aggregate them via Home Assistant / Mac scripts and POST once.
                </p>
              </div>
              <CopyRow label="JSON" value={extendedJson} />
              <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
                <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
                  <div className="font-semibold text-foreground">Apple Watch</div>
                  <p className="mt-1">Create the same shortcut on the Watch via <em>Shortcuts on Apple Watch</em> and an independent automation. Watch can't read iPhone battery and vice-versa.</p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
                  <div className="font-semibold text-foreground">AirPods</div>
                  <p className="mt-1">iOS doesn't expose AirPods battery to Shortcuts directly. Use a HomeBridge / Home Assistant integration that polls them, then POST from there.</p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
                  <div className="font-semibold text-foreground">Mac</div>
                  <p className="mt-1">On macOS, build the same shortcut in the Shortcuts app and trigger it with <em>launchd</em> or a Calendar event for laptop battery.</p>
                </div>
                <div className="rounded-md border border-border/60 bg-background/60 p-2.5">
                  <div className="font-semibold text-foreground">Home Assistant</div>
                  <p className="mt-1">Use a <code>rest_command</code> with the same URL + body. Trigger on any battery sensor state change.</p>
                </div>
              </div>
            </div>
          )}

          {tab === "troubleshoot" && (
            <div className="divide-y divide-border/60 p-1 text-[11.5px]">
              {[
                {
                  q: "The shortcut runs but no device appears",
                  a: <>Check the response from <em>Get Contents of URL</em> — long-press the action and toggle <strong>Show When Run</strong>. A <code>401</code> means the token is wrong (re-copy from the field above). A <code>400</code> means the JSON is malformed — make sure <code>[Battery Level]</code> is an actual magic variable, not literal text.</>,
                },
                {
                  q: "Body shows up as a string of text on the server",
                  a: <>In the URL action, ensure <strong>Request Body</strong> is set to <em>JSON</em> (or <em>File</em> pointing to a Text variable), not <em>Form</em>. The <code>Content-Type</code> header must be <code>application/json</code> exactly.</>,
                },
                {
                  q: "Automation never fires",
                  a: <>iOS 17+ runs personal automations silently, but only if <em>Ask Before Running</em> is off. Also confirm the iPhone is unlocked at the trigger time for time-based automations.</>,
                },
                {
                  q: "How do I report charging = true?",
                  a: <>Shortcuts has no “Get Power State” action. Instead, duplicate the shortcut, hard-code <code>charging</code> to <strong>true</strong> in the JSON dictionary, and trigger that copy from a <em>Charger → Is Connected</em> automation. The original (charging = false) runs from <em>Charger → Disconnected</em> and your daily time trigger.</>,
                },
                {
                  q: "Want to reset the token",
                  a: <>Use the <strong>Rotate token</strong> control in the battery card above; the previous token will stop working immediately.</>,
                },
              ].map((item, i) => (
                <details key={i} className="group px-3 py-2.5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[12px] font-medium text-foreground">
                    <span>{item.q}</span>
                    <span className="text-muted-foreground transition group-open:rotate-45">+</span>
                  </summary>
                  <div className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{item.a}</div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
