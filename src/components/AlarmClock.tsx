import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlarmClock as AlarmIcon, BellRing, Loader2, Power } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { generateMorningBriefing, getLatestLog } from "@/lib/briefing.functions";
import {
  cancelDailyAlarm,
  isNative,
  onAppResume,
  onNotificationAction,
  scheduleDailyAlarm,
} from "@/lib/native";

const STORAGE_KEY = "maverick.alarm.v1";
const LEAD_MINUTES = 5;

type Persisted = {
  time: string;
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

/**
 * Build a short looping beep as a WAV data URL.
 * Using an HTMLAudioElement (instead of WebAudio scheduled beeps) means once
 * the user "unlocks" playback by toggling the alarm on, the browser will let
 * the same element resume/play later — even when the tab is backgrounded —
 * because the gesture context is preserved on the element itself.
 */
function buildBeepDataUrl(): string {
  const sampleRate = 44100;
  const totalSeconds = 2; // 2s pattern, looped
  const totalSamples = sampleRate * totalSeconds;
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);
  // RIFF header
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, totalSamples * 2, true);
  // Two 0.4s beeps per 2s window
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const inBeep1 = t < 0.4;
    const inBeep2 = t >= 0.9 && t < 1.3;
    const env = inBeep1 || inBeep2 ? 0.35 : 0;
    const sample = env * Math.sin(2 * Math.PI * 880 * t);
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }
  // Convert to base64
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export function AlarmClock() {
  const qc = useQueryClient();
  const [state, setState] = useState<Persisted>(() =>
    typeof window === "undefined" ? { time: "07:00", enabled: false } : load(),
  );
  const [now, setNow] = useState(() => Date.now());
  const [ringing, setRinging] = useState(false);
  const [alarmNeedsTap, setAlarmNeedsTap] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  const preGeneratedFor = useRef<number | null>(null);
  const rangFor = useRef<number | null>(null);

  // Alarm tone — looping <audio> primed by user gesture on toggle.
  const beepUrl = useMemo(() => (typeof window === "undefined" ? "" : buildBeepDataUrl()), []);
  const beepAudioRef = useRef<HTMLAudioElement | null>(null);

  // Post-stop briefing audio
  const briefingAudioRef = useRef<HTMLAudioElement | null>(null);

  // Wake Lock to reduce throttling while armed
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const titleRef = useRef(typeof document === "undefined" ? "Maverick" : document.title);

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

  // Tick every second (also use setTimeout fallbacks below for precision)
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const playAlarmTone = useCallback(async () => {
    const el = beepAudioRef.current;
    if (!el) {
      setAlarmNeedsTap(true);
      return false;
    }
    try {
      el.loop = true;
      el.volume = 1;
      el.currentTime = 0;
      await el.play();
      setAlarmNeedsTap(false);
      return true;
    } catch (err) {
      console.warn("[alarm] audio.play() blocked", err);
      setAlarmNeedsTap(true);
      return false;
    }
  }, []);

  const startRinging = useCallback(() => {
    setRinging(true);
    setAlarmNeedsTap(false);

    // Try the primed <audio> element first — works after page-level gesture,
    // even when tab is backgrounded.
    void playAlarmTone();

    // Best-effort notification so a backgrounded tab still alerts the user
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        const notification = new Notification("Maverick — wake up", {
          body: "Your morning briefing is ready. Tap the tab to stop the alarm.",
          tag: "maverick-alarm",
          requireInteraction: true,
        });
        notification.onclick = () => {
          window.focus();
          void playAlarmTone();
        };
      }
    } catch {
      /* ignore */
    }

    // Vibrate on supported devices
    try {
      navigator.vibrate?.([400, 200, 400, 200, 400]);
    } catch {
      /* ignore */
    }
    try {
      const nav = navigator as Navigator & {
        setAppBadge?: (contents?: number) => Promise<void>;
      };
      void nav.setAppBadge?.(1);
    } catch {
      /* ignore */
    }
  }, [playAlarmTone]);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const update = () => {
      setIsStandalone(
        standaloneQuery.matches ||
          ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
      );
    };
    update();
    standaloneQuery.addEventListener("change", update);
    return () => standaloneQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!ringing) {
      document.title = titleRef.current;
      return;
    }
    let on = false;
    const id = window.setInterval(() => {
      on = !on;
      document.title = on ? "⏰ Maverick alarm" : titleRef.current;
    }, 900);
    return () => {
      window.clearInterval(id);
      document.title = titleRef.current;
    };
  }, [ringing]);

  // Scheduling effect (polling) — fires pre-gen + ringing as time crosses thresholds
  useEffect(() => {
    if (!state.enabled || ringing) return;
    const target = nextOccurrence(state.time).getTime();
    const leadAt = target - LEAD_MINUTES * 60 * 1000;

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

    if (rangFor.current !== target && now >= target) {
      rangFor.current = target;
      if (preGeneratedFor.current !== target) {
        preGeneratedFor.current = target;
        generate.mutate();
      }
      startRinging();
    }
  }, [now, state.enabled, state.time, ringing, generate, startRinging]);

  // Precise setTimeout fallback — browsers throttle setInterval in background
  // tabs, so schedule an explicit timer to the next target.
  useEffect(() => {
    if (!state.enabled || ringing) return;
    const target = nextOccurrence(state.time).getTime();
    const delay = target - Date.now();
    if (delay <= 0 || delay > 12 * 60 * 60 * 1000) return;
    const id = window.setTimeout(() => {
      if (rangFor.current === target) return;
      rangFor.current = target;
      if (preGeneratedFor.current !== target) {
        preGeneratedFor.current = target;
        generate.mutate();
      }
      startRinging();
    }, delay + 200);
    return () => window.clearTimeout(id);
  }, [state.enabled, state.time, ringing, generate, startRinging]);

  // If the tab was throttled/suspended past the target, catch up on visibility
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (ringing) {
        void playAlarmTone();
        return;
      }
      if (!state.enabled || ringing) return;
      const target = nextOccurrence(state.time).getTime();
      // nextOccurrence always returns a future time, so if we just woke up past
      // a missed alarm, compare against the prior occurrence (target - 24h).
      const prior = target - 24 * 60 * 60 * 1000;
      const candidate = Date.now() >= prior && rangFor.current !== prior ? prior : null;
      if (candidate && Date.now() - candidate < 30 * 60 * 1000) {
        rangFor.current = candidate;
        if (preGeneratedFor.current !== candidate) {
          preGeneratedFor.current = candidate;
          generate.mutate();
        }
        startRinging();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [state.enabled, state.time, ringing, generate, startRinging, playAlarmTone]);

  // Native iOS: schedule the OS-level daily local notification so the alarm
  // fires even with the app closed (within the iOS notification sound rules).
  useEffect(() => {
    if (!isNative()) return;
    if (state.enabled) {
      void scheduleDailyAlarm(state.time);
    } else {
      void cancelDailyAlarm();
    }
  }, [state.enabled, state.time]);

  // Native iOS: react to the user tapping the alarm notification by jumping
  // straight into the briefing playback flow.
  useEffect(() => {
    if (!isNative()) return;
    const offTap = onNotificationAction({
      onAlarm: () => {
        startRinging();
      },
      onPregen: () => {
        if (!generate.isPending) generate.mutate();
      },
    });
    const offResume = onAppResume(() => {
      // Catch the case where the pre-gen notification fired while the app
      // was suspended — kick off generation on resume if we're inside the
      // lead window.
      if (!state.enabled || ringing || generate.isPending) return;
      const target = nextOccurrence(state.time).getTime();
      const leadAt = target - LEAD_MINUTES * 60 * 1000;
      const t = Date.now();
      if (t >= leadAt && t < target && preGeneratedFor.current !== target) {
        preGeneratedFor.current = target;
        generate.mutate();
      }
    });
    return () => {
      offTap();
      offResume();
    };
  }, [state.enabled, state.time, ringing, generate, startRinging]);

  async function stopRinging() {
    setRinging(false);
    const el = beepAudioRef.current;
    if (el) {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    try {
      navigator.vibrate?.(0);
    } catch {
      /* ignore */
    }
    try {
      const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      void nav.clearAppBadge?.();
    } catch {
      /* ignore */
    }

    try {
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

  useEffect(() => {
    return () => {
      if (beepAudioRef.current) {
        beepAudioRef.current.pause();
      }
      if (briefingAudioRef.current) {
        briefingAudioRef.current.pause();
        briefingAudioRef.current = null;
      }
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  const target = state.enabled ? nextOccurrence(state.time).getTime() : null;
  const countdown = target ? target - now : 0;
  const leadCountdown = target ? target - LEAD_MINUTES * 60 * 1000 - now : 0;

  return (
    <>
      {/* Hidden audio element — primed on toggle via user gesture */}
      <audio
        ref={beepAudioRef}
        src={beepUrl}
        loop
        preload="auto"
        style={{ display: "none" }}
      />
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
              onCheckedChange={async (v) => {
                setState((s) => ({ ...s, enabled: v }));
                if (v) {
                  preGeneratedFor.current = null;
                  rangFor.current = null;

                  // Prime the audio element with the user gesture so play()
                  // is allowed later even when the tab is backgrounded.
                  const el = beepAudioRef.current;
                  if (el) {
                    try {
                      el.muted = true;
                      el.volume = 0;
                      await el.play();
                      el.pause();
                      el.currentTime = 0;
                      el.muted = false;
                      el.volume = 1;
                    } catch (e) {
                      console.warn("[alarm] could not prime audio", e);
                    }
                  }

                  // Ask for notification permission (also a gesture-bound action)
                  try {
                    if (
                      "Notification" in window &&
                      Notification.permission === "default"
                    ) {
                      await Notification.requestPermission();
                    }
                  } catch {
                    /* ignore */
                  }

                  // Best-effort wake lock
                  try {
                    const nav = navigator as Navigator & {
                      wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> };
                    };
                    if (nav.wakeLock) {
                      wakeLockRef.current = await nav.wakeLock.request("screen");
                    }
                  } catch {
                    /* ignore */
                  }

                  toast.success(`Alarm armed for ${state.time}`);
                } else {
                  wakeLockRef.current?.release().catch(() => {});
                  wakeLockRef.current = null;
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
          Generates your briefing {LEAD_MINUTES} min before the alarm, then plays it when
          you stop the alarm. Keep this tab open — allow notifications when prompted so a
          backgrounded tab can still alert you.
        </p>
        {!isStandalone && (
          <p className="mt-2 text-xs text-primary">
            Mobile fallback active: add Maverick to your home screen for the best notification behavior.
          </p>
        )}
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
                : alarmNeedsTap
                  ? "Mobile blocked background audio. Tap below to sound the alarm, or stop it to play the briefing."
                  : "Stop the alarm to hear your morning briefing."}
            </p>
            {alarmNeedsTap && (
              <Button
                variant="secondary"
                className="mt-5 w-full"
                onClick={() => void playAlarmTone()}
              >
                <BellRing className="mr-2 h-4 w-4" /> Play alarm sound
              </Button>
            )}
            <Button
              size="lg"
              className={alarmNeedsTap ? "mt-3 w-full" : "mt-6 w-full"}
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
