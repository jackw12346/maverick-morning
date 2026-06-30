import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Maverick" },
      {
        name: "description",
        content:
          "Get help with Maverick, your personal morning briefing dashboard. FAQs, contact info, and troubleshooting.",
      },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground font-display text-sm font-semibold">
              M
            </span>
            <span className="font-display text-lg">Maverick</span>
          </Link>
          <Link
            to="/auth"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Help center
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold">Support</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Need help with Maverick? Start here.
        </p>

        <div className="mt-10 grid gap-6">
          <section className="rounded-lg border border-border/60 bg-card/50 p-5">
            <h2 className="font-display text-xl font-semibold">
              Contact us
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              For questions, account deletion requests, or bug reports, email the team directly.
            </p>
            <a
              href="mailto:support@maverick.app"
              className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              support@maverick.app
            </a>
          </section>

          <section className="rounded-lg border border-border/60 bg-card/50 p-5">
            <h2 className="font-display text-xl font-semibold">
              Frequently asked questions
            </h2>

            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">
                  How do I connect WHOOP or Google Calendar?
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sign in, then go to the{" "}
                  <Link to="/integrations" className="text-primary underline-offset-4 hover:underline">
                    Integrations
                  </Link>{" "}
                  page. Add your own OAuth client credentials and tap Connect. This keeps your tokens under your control.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Why isn’t my calendar showing events?
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Make sure the Google project has the Calendar API enabled, the OAuth consent screen is published, and the redirect URI is whitelisted. Family calendars are prioritized and labeled automatically.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  Can I use the alarm on the website?
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  The web alarm works in supported browsers. For the most reliable wake-up experience, use the iOS app with local notifications.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  How do I get the iOS app?
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  The native iOS project is built with Capacitor. Build the web app, sync the iOS platform, open the project in Xcode, and archive for TestFlight or the App Store.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold">
                  How do I delete my account?
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Email{" "}
                  <a href="mailto:support@maverick.app" className="text-primary underline-offset-4 hover:underline">
                    support@maverick.app
                  </a>{" "}
                  from the address associated with your account. We will delete your profile, settings, tokens, briefing logs, and audio within 30 days.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border/60 bg-card/50 p-5">
            <h2 className="font-display text-xl font-semibold">
              Troubleshooting
            </h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">No audio:</strong> check your device volume, ensure the browser is not muted, and that the briefing generated successfully.
              </li>
              <li>
                <strong className="text-foreground">Stale WHOOP data:</strong> WHOOP limits recovery data to a short window. Try generating a briefing in the morning after your recovery is available.
              </li>
              <li>
                <strong className="text-foreground">Alarm did not fire:</strong> on iOS, confirm the app has notification permission and the alarm is enabled in the app settings.
              </li>
              <li>
                <strong className="text-foreground">OAuth errors:</strong> verify the redirect URI matches exactly and the consent screen is in production status.
              </li>
            </ul>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Maverick</span>
          <div className="flex gap-4">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/support" className="hover:text-foreground">
              Support
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
