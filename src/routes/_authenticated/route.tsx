import { Link, Outlet, redirect, useLocation, useRouter } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Cable, LayoutDashboard, ListOrdered, LogOut, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

const nav: { to: "/" | "/settings" | "/integrations" | "/logs"; label: string; icon: typeof LayoutDashboard; end?: boolean }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/settings", label: "Configuration", icon: SlidersHorizontal },
  { to: "/integrations", label: "Integrations", icon: Cable },
  { to: "/logs", label: "Logs", icon: ListOrdered },
];

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const location = useLocation();
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  return (
    <div className="hud-grid min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1400px] gap-6 px-6 py-6">
        {/* sidebar */}
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-60 shrink-0 flex-col rounded-lg border border-border/60 bg-card/50 p-4 backdrop-blur md:flex">
          <div className="flex items-center gap-3 px-2 pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <span className="font-display text-base font-bold">M</span>
            </div>
            <div>
              <div className="font-display text-base font-semibold tracking-tight">
                Maverick
              </div>
              <div className="text-[11px] text-muted-foreground">Morning briefing</div>
            </div>
          </div>

          <nav className="mt-2 flex flex-1 flex-col gap-1">
            {nav.map((item) => {
              const active = item.end
                ? location.pathname === item.to
                : location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "group flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition",
                    active
                      ? "border-hud/40 bg-hud/10 text-hud"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-hud shadow-[0_0_8px_var(--color-hud)]" />}
                </Link>
              );
            })}
          </nav>

          <div className="mt-2 rounded-md border border-border/60 bg-background/60 p-3">
            <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Operator
            </div>
            <div className="mt-0.5 truncate text-xs">{user.email}</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="mt-2 h-7 w-full justify-start px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" /> Disengage
            </Button>
          </div>
        </aside>

        {/* main */}
        <main className="min-w-0 flex-1">
          <header className="mb-6 flex items-center justify-between rounded-md border border-border/60 bg-card/40 px-4 py-2 backdrop-blur">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_8px_var(--color-success)]" />
              <span className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                System nominal · all sectors online
              </span>
            </div>
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-hud">
              {time.toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "2-digit",
              })}{" "}
              · {time.toLocaleTimeString()}
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
