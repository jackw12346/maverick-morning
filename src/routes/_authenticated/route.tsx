import { Link, Outlet, redirect, useLocation, useRouter } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { Cable, LayoutDashboard, ListOrdered, LogOut, Menu, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { AccountDialog } from "@/components/AccountDialog";

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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };

  const navContent = (
    <>
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
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>

      <div className="mt-2 rounded-md border border-border/60 bg-background/60 p-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Account
        </div>
        <div className="mt-0.5 truncate text-xs">{user.email}</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="mt-2 h-7 w-full justify-start px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1400px] gap-6 px-4 py-4 md:px-6 md:py-6">
        {/* desktop sidebar */}
        <aside className="sticky top-6 hidden h-[calc(100vh-3rem)] w-60 shrink-0 flex-col rounded-lg border border-border/60 bg-card/50 p-4 backdrop-blur md:flex">
          {navContent}
        </aside>

        {/* main */}
        <main className="min-w-0 flex-1">
          <header className="mb-6 flex items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div className="flex min-w-0 items-center gap-2">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-8 w-8 shrink-0"
                    aria-label="Open menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 border-border/60 bg-card p-4">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <div className="flex h-full flex-col">{navContent}</div>
                </SheetContent>
              </Sheet>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
              <span className="truncate text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                All systems online
              </span>
            </div>
            <div className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
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
