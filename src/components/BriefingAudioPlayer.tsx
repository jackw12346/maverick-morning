import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BriefingAudioPlayerProps {
  src: string;
  className?: string;
}

function fmt(t: number) {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function BriefingAudioPlayer({ src, className }: BriefingAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const a = audioRef.current;
    if (a) a.playbackRate = rate;
  }, [rate]);


  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrent(a.currentTime);
    const onLoaded = () => setDuration(a.duration);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else void a.play();
    setPlaying(!playing);
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const v = Number(e.target.value);
    a.currentTime = v;
    setCurrent(v);
  };

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border border-border/60 bg-background/60 px-3 py-2",
        className,
      )}
    >
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground transition hover:brightness-110"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>
      <div className="flex flex-1 items-center gap-3">
        <span className="mono text-[10px] tabular-nums text-muted-foreground">{fmt(current)}</span>
        <div className="relative flex-1">
          <div className="h-1 w-full rounded-full bg-border" />
          <div
            className="absolute left-0 top-0 h-1 rounded-full bg-hud"
            style={{ width: `${pct}%`, boxShadow: "0 0 8px var(--color-hud)" }}
          />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onChange={seek}
            className="absolute inset-0 h-1 w-full cursor-pointer appearance-none bg-transparent opacity-0"
          />
        </div>
        <span className="mono text-[10px] tabular-nums text-muted-foreground">
          {fmt(duration)}
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          const steps = [1, 1.25, 1.5, 1.75, 2, 0.75];
          const next = steps[(steps.indexOf(rate) + 1) % steps.length] ?? 1;
          setRate(next);
        }}
        className="mono rounded-md border border-border/60 px-2 py-1 text-[10px] tabular-nums text-muted-foreground transition hover:text-foreground"
        aria-label="Playback speed"
      >
        {rate}x
      </button>
      <Volume2 className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}
