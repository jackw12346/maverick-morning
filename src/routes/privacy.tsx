import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Maverick" },
      {
        name: "description",
        content:
          "Privacy policy for Maverick, a personal morning briefing dashboard that connects to services like WHOOP and Google Calendar.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const updated = "June 30, 2026";
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
            to="/signin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Legal
        </p>
        <h1 className="mt-2 font-display text-4xl font-semibold">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: {updated}
        </p>

        <div className="prose prose-invert mt-10 max-w-none space-y-8 text-[15px] leading-relaxed text-foreground/90">
          <section>
            <p>
              Maverick (&ldquo;Maverick,&rdquo; &ldquo;we,&rdquo;
              &ldquo;us&rdquo;) is a personal morning briefing dashboard that
              aggregates a user&rsquo;s own data &mdash; calendar events,
              fitness and recovery metrics, device battery levels, and news
              &mdash; into a single daily summary. This policy explains what
              information Maverick collects, how it is used, and the choices
              you have. It applies to data accessed through third-party
              integrations including WHOOP and Google Calendar.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              Information we collect
            </h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <strong>Account information.</strong> Email address and basic
                profile details you provide when signing in.
              </li>
              <li>
                <strong>WHOOP data.</strong> If you connect WHOOP, we access
                profile, recovery, sleep, cycle, and workout data through the
                WHOOP API using the scopes you authorize
                (<code>read:profile</code>, <code>read:recovery</code>,
                <code>read:sleep</code>, <code>read:cycles</code>,
                <code>read:workout</code>, <code>offline</code>).
              </li>
              <li>
                <strong>Google Calendar data.</strong> If you connect Google,
                we access read-only calendar event data
                (<code>calendar.readonly</code>) along with basic profile and
                email to identify your account.
              </li>
              <li>
                <strong>Device telemetry.</strong> Battery levels you
                explicitly push to Maverick from your own devices via the
                personal ingest endpoint.
              </li>
              <li>
                <strong>Briefing history.</strong> Generated briefing text and
                associated audio you produce inside Maverick.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              How we use information
            </h2>
            <p>
              All data is used solely to generate <em>your own</em> daily
              briefing and to display history back to you in the dashboard.
              Specifically:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                Read recent calendar events, WHOOP recovery/sleep/strain,
                battery levels, and news headlines to assemble the briefing.
              </li>
              <li>
                Send the assembled text to a language model to draft the
                briefing copy, and optionally to a text-to-speech model to
                produce audio.
              </li>
              <li>
                Store the resulting text and audio in your account so you can
                replay past briefings.
              </li>
            </ul>
            <p>
              We do not sell personal data. We do not use WHOOP, Google
              Calendar, or device data for advertising, profiling unrelated
              users, or training third-party models.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              How data is shared
            </h2>
            <p>
              Maverick shares data only with infrastructure providers required
              to operate the service:
            </p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <strong>Hosting &amp; database</strong> for storing your
                account, settings, tokens, and briefing history.
              </li>
              <li>
                <strong>LLM and text-to-speech providers</strong> that receive
                only the assembled briefing prompt necessary to generate the
                output.
              </li>
              <li>
                <strong>Your own webhooks</strong> (e.g. a Sonos or Nanoleaf
                automation bridge you configure) which receive the briefing
                you choose to send to them.
              </li>
            </ul>
            <p>
              We do not share your WHOOP or Google Calendar data with any
              other third party.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              Storage and security
            </h2>
            <p>
              OAuth access and refresh tokens are stored in our database and
              used only on the server to call the corresponding provider on
              your behalf. Data is transmitted over TLS and protected by
              row-level security so that only your account can read it. No
              system is perfectly secure; please use a strong password and
              keep your devices safe.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              Retention and deletion
            </h2>
            <p>
              You can disconnect WHOOP or Google Calendar at any time from the
              Integrations page, which revokes Maverick&rsquo;s stored tokens
              for that provider. You can also request deletion of your
              account and all associated data &mdash; profile, settings,
              integration tokens, briefing logs, audio, and device telemetry
              &mdash; by emailing the contact below. We will fulfill verified
              deletion requests within 30 days.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              Your choices
            </h2>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                Choose which data sources are included in your briefing from
                the Configuration panel.
              </li>
              <li>
                Disconnect any integration at any time from the Integrations
                page.
              </li>
              <li>
                Revoke Maverick&rsquo;s access directly with the provider
                (e.g. WHOOP account settings, Google Account &gt; Security
                &gt; Third-party access).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              Children&rsquo;s privacy
            </h2>
            <p>
              Maverick is not directed to children under 13 and we do not
              knowingly collect personal information from them.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">
              Changes to this policy
            </h2>
            <p>
              We may update this policy from time to time. Material changes
              will be reflected by updating the &ldquo;Last updated&rdquo;
              date above.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold">Contact</h2>
            <p>
              Questions or deletion requests:{" "}
              <a
                href="mailto:privacy@maverick.app"
                className="text-primary underline-offset-4 hover:underline"
              >
                privacy@maverick.app
              </a>
              .
            </p>
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
