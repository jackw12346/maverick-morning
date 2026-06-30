
## Jarvis Morning Briefing — Build Plan

A dark, HUD-inspired control center for a personal AI morning briefing, with Lovable Cloud for data/auth and a TanStack server function scaffolded to assemble the daily report.

---

### 1. Backend (Lovable Cloud)

Enable Lovable Cloud, then create the schema in a single migration with explicit GRANTs and RLS.

**Tables (all in `public`):**

- `profiles` — `id uuid pk references auth.users(id) on delete cascade`, `display_name text`, `timezone text default 'UTC'`, `wake_time time default '07:00'`, `created_at`, `updated_at`. Auto-created via `handle_new_user` trigger on `auth.users` insert.
- `briefing_settings` — one row per user. `user_id uuid pk references auth.users(id) on delete cascade`, booleans: `include_calendar`, `include_whoop`, `include_batteries`, `include_roca_news`, `text_to_speech_enabled` (all default `true`), `voice text default 'alloy'`, `updated_at`. Auto-created via same trigger.
- `briefing_logs` — `id uuid pk default gen_random_uuid()`, `user_id uuid references auth.users(id) on delete cascade`, `briefing_text text not null`, `audio_url text`, `metadata jsonb default '{}'` (token counts, sections included), `created_at timestamptz default now()`.
- `integration_tokens` — `id uuid pk`, `user_id`, `provider text` (`google_calendar` | `whoop`), `status text` (`disconnected` | `connected` | `error`), `access_token text` (placeholder; encrypted-at-rest by Postgres), `refresh_token text`, `expires_at timestamptz`, `metadata jsonb`, `updated_at`. Unique `(user_id, provider)`.
- `smart_home_webhooks` — `id uuid pk`, `user_id`, `label text` (e.g. "Sonos Living Room"), `target text` (`sonos` | `nanoleaf` | `other`), `url text`, `enabled bool default true`, `created_at`. Lets the user store the Make.com / Home Assistant endpoints the brief mentions.

**Security:** RLS enabled on all tables. Policies scope every action to `auth.uid() = user_id`. Standard GRANTs: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`, `ALL` to `service_role` (no `anon` access — this is a private tool).

---

### 2. Auth

Email/password + Google sign-in (via the Lovable broker helper), with `supabase--configure_social_auth` for Google enabled in the same step.

- Public `/auth` route (sign in / sign up tabs, Google button).
- All app routes live under the integration-managed `_authenticated/` layout.
- Root: `onAuthStateChange` listener wired in `__root.tsx` for sign-in/out invalidation.

---

### 3. Frontend — Routes & Layout

Dark HUD aesthetic: near-black background (`oklch(0.14 0.02 250)`), cyan/electric-blue primary (`oklch(0.78 0.15 220)`), amber alert accent (`oklch(0.78 0.16 75)`), JetBrains Mono for telemetry/labels, Inter for body. Subtle grid overlay, thin 1px borders, glowing accent rings on active cards, monospace timestamps.

Routes (all under `_authenticated/`):

- `/` — **Dashboard**. Hero status block ("Good morning. Systems nominal."), today's date + wake time, latest briefing preview card with audio player, quick-action buttons (Generate Now, Play Last). Right column: telemetry strip showing integration health (Calendar / Whoop / Webhooks) as compact status pills.
- `/settings` — **Configuration Panel**. Toggle switches (shadcn `Switch`) for each `briefing_settings` boolean, grouped under "Briefing Modules" and "Output". Voice select. Timezone + wake-time inputs on profile sub-section.
- `/integrations` — **Integration Manager**. Cards for Google Calendar and Whoop (status pill, Connect / Reconnect / Disconnect buttons — scaffolded; OAuth flow is a placeholder writing to `integration_tokens.status`). Separate "Smart Home Webhooks" panel: list + add/edit/delete form for `smart_home_webhooks` rows with a Test Ping button.
- `/logs` — **Morning Logs feed**. Reverse-chronological list of `briefing_logs` rendered as terminal-style cards (date stamp, expandable text block, custom audio player with waveform-ish progress bar, play/pause, scrub, time display).

Public:
- `/auth` — sign-in / sign-up.

---

### 4. Reusable Components

- `BriefingAudioPlayer` — custom HTML `<audio>` wrapper with play/pause, scrubber, current/total time, monospace styling. Used in Dashboard preview and Logs feed.
- `StatusPill` — small badge with colored dot (`online` | `degraded` | `offline`).
- `HudCard` — base card with 1px border, faint inner glow, optional corner accents.
- `ToggleRow` — label + description + `Switch`, wired to a server fn updating `briefing_settings`.
- `IntegrationCard` — provider logo/glyph, status, action button.

---

### 5. Server Functions (TanStack `createServerFn`)

All under `src/lib/*.functions.ts`, protected with `requireSupabaseAuth` (except where noted). Loaders call these from `_authenticated` routes.

- `getBriefingSettings` / `updateBriefingSettings`
- `getProfile` / `updateProfile`
- `listBriefingLogs` / `getLatestBriefingLog`
- `listIntegrations` / `setIntegrationStatus` (placeholder for OAuth completion)
- `listWebhooks` / `upsertWebhook` / `deleteWebhook` / `pingWebhook` (fires a POST to the stored URL with a test payload from the server)
- **`generateMorningBriefing`** — the headline scaffold. Pseudocode:
  1. Load `briefing_settings` + `profile` + enabled webhooks for the user.
  2. Stub data collectors (each returns `{ section, content }` or `null`):
     - `collectCalendar()` — `TODO: call Google Calendar API once OAuth lands` — returns placeholder events.
     - `collectWhoop()` — `TODO: Whoop API` — placeholder recovery/strain.
     - `collectBatteries()` — placeholder.
     - `collectRocaNews()` — placeholder headlines.
  3. Compose prompt → call Lovable AI Gateway (`google/gemini-3-flash-preview`) for the briefing text. (Wired in but behind a feature flag; falls back to a deterministic template if `LOVABLE_API_KEY` missing, so the UI is fully testable.)
  4. If `text_to_speech_enabled`, call Lovable AI `/v1/audio/speech` with `openai/gpt-4o-mini-tts`, upload returned audio to a Supabase Storage bucket `briefings`, get public URL.
  5. Insert `briefing_logs` row.
  6. Fan-out POST to each enabled `smart_home_webhooks` URL with `{ text, audio_url, sections }`.
  7. Return the new log row to the client; dashboard invalidates queries.

Storage: create a `briefings` bucket (public read, authenticated write) in the migration.

`LOVABLE_API_KEY` provisioned via `ai_gateway--create`.

---

### 6. Out of scope this pass (clearly stubbed in UI)

- Real Google Calendar / Whoop OAuth flows — connection cards show "Setup pending" with a tooltip explaining the next step.
- Real audio waveform analysis (player is functional, just no FFT visualization).
- Scheduling/cron for automatic morning runs — Generate is manual button-driven for now; pg_cron can be added in a follow-up.

---

### Technical notes

- Stack: TanStack Start, Tailwind v4 tokens in `src/styles.css`, shadcn components, TanStack Query for all reads (`ensureQueryData` in loaders, `useSuspenseQuery` in components).
- Fonts via `@fontsource/inter` + `@fontsource/jetbrains-mono`, imported in `src/main.tsx` (or equivalent entry), referenced via `@theme` `--font-*` tokens.
- Animations: light `framer-motion` for card mount + status-pill pulse only — no scattered micro-interactions.
- All colors via semantic tokens; zero hardcoded hex in components.
