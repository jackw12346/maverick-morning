import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

interface HudCardProps extends HTMLAttributes<HTMLDivElement> {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  glow?: boolean;
  children?: ReactNode;
}

export function HudCard({
  title,
  eyebrow,
  actions,
  glow,
  className,
  children,
  ...rest
}: HudCardProps) {
  return (
    <div
      {...rest}
      className={cn(
        "relative rounded-lg border border-border/60 bg-card/60 backdrop-blur-sm",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-lg",
        "before:bg-[radial-gradient(circle_at_top,_oklch(0.82_0.14_215_/_0.08),_transparent_60%)]",
        glow && "hud-glow",
        className,
      )}
    >
      {/* corner ticks */}
      <span className="pointer-events-none absolute -left-px -top-px h-3 w-3 border-l border-t border-hud" />
      <span className="pointer-events-none absolute -right-px -top-px h-3 w-3 border-r border-t border-hud" />
      <span className="pointer-events-none absolute -bottom-px -left-px h-3 w-3 border-b border-l border-hud" />
      <span className="pointer-events-none absolute -bottom-px -right-px h-3 w-3 border-b border-r border-hud" />

      {(title || eyebrow || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-border/50 px-5 py-3">
          <div>
            {eyebrow && (
              <div className="mono text-[10px] uppercase tracking-[0.2em] text-hud/80">
                {eyebrow}
              </div>
            )}
            {title && <div className="mt-0.5 text-sm font-semibold text-foreground">{title}</div>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="relative px-5 py-4">{children}</div>
    </div>
  );
}
