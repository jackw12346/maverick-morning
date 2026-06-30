import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlarmClock as AlarmIcon, BellRing, Loader2, Power } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { generateMorningBriefing, getLatestLog } from "@/lib/briefing.functions";

const STORAGE_KEY = "maverick.alarm.v1";
const LEAD_MINUTES = 5;

type Persisted = {
  time: string; // "HH:MM"
  enabled: boolean;
};

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Persisted;
  } catch {
    /* ignore */
  }
  return { time: "07:00", enabled: false };
}

function save(p: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function nextOccurrence(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const now = new Date();
  const t = new Date(now);
  t.setHours(h, m, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  return t;
}

function fmtCountdown(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec
    .toString()
    .padStart(2, "0")}`;
}

export function AlarmClock() {
  const qc = useQueryClient();
  const [state, setState] = useState<Persisted>(() =>
    typeof window === "undefined" ? { time: "07:00", enabled: false } : load(),
  );
  const [now, setNow] = useState(() => Date.now());
  const [ringing, setRinging] = useState(false);

  // Track which alarm occurrence we've already pre-generated / rung for, so we don't loop.
  const preGeneratedFor = useRef<number | null>(null);
  const rangFor = useRef<number | null>(null);

  // Beep loop (WebAudio) — created on ring, destroyed on stop.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const beepTimerRef = useRef<number | null>(null);

  // Post-stop briefing audio
  const briefingAudioRef = useRef<HTMLAudioElement | null>(null);

  const generate = useMutation({
    mutationFn: () => generateMorningBriefing(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["latest-log"] });
      qc.invalidateQueries({ queryKey: ["logs"] });
    },
  });

  useEffect(() => {
    save(state);
  }, [state]);

  // Tick every second
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Scheduling effect
  useEffect(() => {
    if (!state.enabled || ringing) return;
    const target = nextOccurrence(state.time).getTime();
    const leadAt = target - LEAD_MINUTES * 60 * 1000;

    // Pre-generate the briefing once per occurrence
    if (
      preGeneratedFor.current !== target &&
      now >= leadAt &&
      now < target &&
      !generate.isPending
    ) {
      preGeneratedFor.current = target;
      toast.info(`Pre-generating your briefing (${LEAD_MINUTES} min lead)…`);
      generate.mutate();
    }

    // Ring at target time
    if (rangFor.current !== target && now >= target) {
      rangFor.current = target;
      // Ensure we have a briefing even if pre-gen was skipped
      if (preGeneratedFor.current !== target) {
        preGeneratedFor.current = target;
        generate.mutate();
      }
      startRinging();
    }
  }, [now, state.enabled, state.time, ringing, generate]);

  function startRinging() {
    setRinging(true);
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const playBeep = () => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.02);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.45);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      };
      playBeep();
      beepTimerRef.current = window.setInterval(playBeep, 900);
    } catch (e) {
      console.warn("[alarm] audio blocked", e);
    }
  }

  async function stopRinging() {
    setRinging(false);
    if (beepTimerRef.current) {
      window.clearInterval(beepTimerRef.current);
      beepTimerRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        await audioCtxRef.current.close();
      } catch {
        /* ignore */
      }
      audioCtxRef.current = null;
    }

    // Fetch the freshest briefing and play it
    try {
      // Wait for in-flight generation if any
      if (generate.isPending) {
        toast.info("Finishing your briefing…");
        await new Promise<void>((resolve) => {
          const start = Date.now();
          const id = window.setInterval(() => {
            if (!generate.isPending || Date.now() - start > 60_000) {
              window.clearInterval(id);
              resolve();
            }
          }, 500);
        });
      }
      const latest = await getLatestLog();
      if (latest?.audio_url) {
        const a = new Audio(latest.audio_url);
        briefingAudioRef.current = a;
        await a.play();
        toast.success("Good morning. Playing your briefing.");
      } else {
        toast.message("Briefing ready — audio not available.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not play briefing");
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (beepTimerRef.current) window.clearInterval(beepTimerRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
      if (briefingAudioRef.current) {
        briefingAudioRef.current.pause();
        briefingAudioRef.current = null;
      }
    };
  }, []);

  const target = state.enabled ? nextOccurrence(state.time).getTime() : null;
  const countdown = target ? target - now : 0;
  const leadCountdown = target ? target - LEAD_MINUTES * 60 * 1000 - now : 0;

  return (
    <>
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <AlarmIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Wake Alarm
              </div>
              <div className="font-display text-xl font-semibold">
                {state.enabled ? `Set for ${state.time}` : "Off"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {state.enabled ? "On" : "Off"}
            </span>
            <Switch
              checked={state.enabled}
              onCheckedChange={(v) => {
                setState((s) => ({ ...s, enabled: v }));
                if (v) {
                  // Reset trackers so the next occurrence schedules cleanly
                  preGeneratedFor.current = null;
                  rangFor.current = null;
                  // Prime AudioContext via a silent resume on user gesture
                  try {
                    const Ctx =
                      window.AudioContext ||
                      (window as unknown as {
                        webkitAudioContext: typeof AudioContext;
                      }).webkitAudioContext;
                    const ctx = new Ctx();
                    ctx.resume().finally(() => ctx.close());
                  } catch {
                    /* ignore */
                  }
                  toast.success(`Alarm armed for ${state.time}`);
                }
              }}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-xs">
            <span className="uppercase tracking-[0.18em] text-muted-foreground">
              Alarm time
            </span>
            <Input
              type="time"
              value={state.time}
              onChange={(e) => {
                preGeneratedFor.current = null;
                rangFor.current = null;
                setState((s) => ({ ...s, time: e.target.value || "07:00" }));
              }}
              className="font-display text-lg"
            />
          </label>
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="uppercase tracking-[0.18em] text-muted-foreground">
              Rings in
            </span>
            <div className="mono rounded-md border border-border/60 bg-background/60 px-3 py-2 font-display text-lg tabular-nums">
              {state.enabled ? fmtCountdown(countdown) : "—"}
            </div>
          </div>
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="uppercase tracking-[0.18em] text-muted-foreground">
              Briefing pre-gen
            </span>
            <div className="mono rounded-md border border-border/60 bg-background/60 px-3 py-2 font-display text-lg tabular-nums">
              {state.enabled
                ? leadCountdown > 0
                  ? `T-${fmtCountdown(leadCountdown)}`
                  : generate.isPending
                    ? "Running…"
                    : "Ready"
                : "—"}
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Generates your briefing {LEAD_MINUTES} minutes before the alarm, then plays it
          automatically when you stop the alarm. Keep this tab open for the alarm to fire.
        </p>
      </div>

      {ringing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-primary/40 bg-card p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <BellRing className="h-8 w-8 animate-pulse" />
            </div>
            <div className="mt-4 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Wake up
            </div>
            <div className="mt-1 font-display text-4xl font-semibold">{state.time}</div>
            <p className="mt-3 text-sm text-muted-foreground">
              {generate.isPending
                ? "Your briefing is still compiling — it'll play as soon as you stop."
                : "Stop the alarm to hear your morning briefing."}
            </p>
            <Button
              size="lg"
              className="mt-6 w-full"
              onClick={() => void stopRinging()}
            >
              <Power className="mr-2 h-5 w-5" /> Stop & play briefing
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
