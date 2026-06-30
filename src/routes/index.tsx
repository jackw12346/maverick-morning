import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlarmClock,
  CalendarDays,
  HeartPulse,
  Newspaper,
  Cloud,
  Car,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Maverick — Your AI Morning Briefing" },
      {
        name: "description",
        content:
          "Maverick blends your calendar, Whoop recovery, weather, traffic, and tailored news into a single, spoken morning briefing — woken by a smart alarm.",
      },
      { property: "og:title", content: "Maverick — Your AI Morning Briefing" },
      {
        property: "og:description",
        content:
          "Personal telemetry, calendar, news, weather and traffic — delivered as a spoken briefing the moment your alarm stops.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: HeartPulse, title: "Whoop recovery", desc: "Strain, recovery and sleep performance baked into every brief." },
  { icon: CalendarDays, title: "Google Calendar", desc: "Family events get prioritized so nothing important slips." },
  { icon: Newspaper, title: "Tailored news", desc: "Topics you actually care about, summarized by AI with sources." },
  { icon: Cloud, title: "Local weather", desc: "Today's forecast, sunset, and what to wear before you step out." },
  { icon: Car, title: "Traffic to work", desc: "Live drive time so you know exactly when to walk out the door." },
  { icon: AlarmClock, title: "Smart alarm", desc: "Stop the alarm, the briefing starts playing automatically." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <MaverickLogo />
          <span className="font-display text-lg font-semibold tracking-tight">Maverick</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/support" className="hidden px-3 py-2 text-muted-foreground hover:text-foreground sm:inline">
            Support
          </Link>
          <Link to="/privacy" className="hidden px-3 py-2 text-muted-foreground hover:text-foreground sm:inline">
            Privacy
          </Link>
          <Link to="/signin">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link to="/signin">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_-10%,oklch(0.55_0.18_38/0.18),transparent_60%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 text-center md:px-6 md:py-28">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur">
            <Sparkles className="h-3 w-3 text-primary" />
            Personal AI control panel
          </div>
          <h1 className="mx-auto max-w-3xl font-display text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
            Wake up to a briefing built just for you.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
            Maverick pulls your calendar, recovery, weather, traffic and the news you actually
            care about — then plays it back in a natural voice the moment your alarm stops.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signin">
              <Button size="lg" className="gap-2">
                Get started free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/signin">
              <Button size="lg" variant="outline">
                I already have an account
              </Button>
            </Link>
          </div>
          <div className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Your data stays yours. Disconnect any integration in one tap.
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-6">
        <div className="mb-10 text-center">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">What it knows</div>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Everything that matters, before your feet hit the floor.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="rounded-xl border border-border/60 bg-card/50 p-5 backdrop-blur transition hover:border-primary/40"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="font-display text-base font-semibold">{f.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{f.desc}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
          <div className="grid gap-12 md:grid-cols-3">
            {[
              { n: "01", t: "Connect your sources", d: "Google Calendar, Whoop, location, and the news topics you care about." },
              { n: "02", t: "Set your alarm", d: "Pick a wake time. Maverick prepares your briefing five minutes before." },
              { n: "03", t: "Stop the alarm, listen", d: "A natural-voice recap plays automatically. Then your day begins." },
            ].map((s) => (
              <div key={s.n}>
                <div className="font-display text-3xl font-semibold text-primary">{s.n}</div>
                <div className="mt-2 font-display text-xl font-semibold">{s.t}</div>
                <div className="mt-2 text-sm text-muted-foreground">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center md:px-6">
        <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Mornings, finally on autopilot.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Two minutes to set up. A better start to every day after.
        </p>
        <div className="mt-8">
          <Link to="/signin">
            <Button size="lg" className="gap-2">
              Create your account <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground md:px-6">
          <div>© {new Date().getFullYear()} Maverick</div>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/support" className="hover:text-foreground">Support</Link>
            <Link to="/signin" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
