import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AudioLines, Clock, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { HudCard } from "@/components/hud/hud-card";
import { BriefingAudioPlayer } from "@/components/BriefingAudioPlayer";
import { Button } from "@/components/ui/button";
import { deleteLog, listLogs } from "@/lib/briefing.functions";

export const Route = createFileRoute("/_authenticated/logs")({
  component: LogsPage,
});

function LogsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["logs"], queryFn: () => listLogs() });
  const del = useMutation({
    mutationFn: (id: string) => deleteLog({ data: { id } }),
    onSuccess: () => {
      toast.success("Briefing deleted");
      qc.invalidateQueries({ queryKey: ["logs"] });
      qc.invalidateQueries({ queryKey: ["latest-log"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="space-y-6">
      <HudCard
        eyebrow="Transmission archive"
        title="Morning briefing logs"
        actions={
          <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {data?.length ?? 0} entries
          </span>
        }
      >
        {isLoading ? (
          <div className="h-32 animate-pulse rounded bg-secondary/40" />
        ) : data && data.length > 0 ? (
          <div className="space-y-4">
            {data.map((log) => {
              const meta = (log.metadata as { sections?: string[]; model?: string; had_tts?: boolean }) ?? {};
              return (
                <article
                  key={log.id}
                  className="rounded-md border border-border/60 bg-background/40 p-4"
                >
                  <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span className="mono">
                        {new Date(log.created_at).toLocaleString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {meta.model && (
                        <span className="mono text-[10px] uppercase tracking-wider text-hud/80">
                          · {meta.model}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(meta.sections ?? []).map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-hud/30 bg-hud/5 px-2 py-0.5 mono text-[10px] uppercase tracking-wider text-hud"
                        >
                          {s}
                        </span>
                      ))}
                      {log.audio_url && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-alert/40 bg-alert/10 px-2 py-0.5 mono text-[10px] uppercase tracking-wider text-alert">
                          <AudioLines className="h-3 w-3" /> tts
                        </span>
                      )}
                    </div>
                  </header>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {log.briefing_text}
                  </p>
                  {log.audio_url && (
                    <div className="mt-3">
                      <BriefingAudioPlayer src={log.audio_url} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/60 bg-background/30 px-4 py-12 text-center text-sm text-muted-foreground">
            <FileText className="mx-auto mb-2 h-6 w-6 opacity-50" />
            No briefings recorded yet.
          </div>
        )}
      </HudCard>
    </div>
  );
}
