// Server-only OAuth helpers for per-user Google Calendar + Whoop connections.
// Must only be imported from `.server.ts` files or inside server-route/server-fn handlers.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Provider = "google_calendar" | "whoop";

type ProviderConfig = {
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  // For Google: scope-separated by space. For Whoop: same.
};

const PROVIDERS: Record<Provider, ProviderConfig> = {
  google_calendar: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes:
      "openid email profile https://www.googleapis.com/auth/calendar.readonly",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
  },
  whoop: {
    authUrl: "https://api.prod.whoop.com/oauth/oauth2/auth",
    tokenUrl: "https://api.prod.whoop.com/oauth/oauth2/token",
    scopes:
      "offline read:profile read:recovery read:sleep read:cycles read:workout",
    clientIdEnv: "WHOOP_CLIENT_ID",
    clientSecretEnv: "WHOOP_CLIENT_SECRET",
  },
};

export function getProviderConfig(p: Provider) {
  const cfg = PROVIDERS[p];
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) {
    throw new Error(
      `Missing OAuth credentials: set ${cfg.clientIdEnv} and ${cfg.clientSecretEnv} in project secrets.`,
    );
  }
  return { ...cfg, clientId, clientSecret };
}

export function callbackUrl(origin: string, provider: Provider) {
  return `${origin}/api/public/oauth/${provider === "google_calendar" ? "google" : "whoop"}/callback`;
}

export async function createAuthUrl(opts: {
  provider: Provider;
  userId: string;
  origin: string;
}) {
  const cfg = getProviderConfig(opts.provider);
  const state = crypto.randomUUID() + "." + crypto.randomUUID();
  const { error } = await supabaseAdmin.from("oauth_states").insert({
    state,
    user_id: opts.userId,
    provider: opts.provider,
  });
  if (error) throw error;

  const redirectUri = callbackUrl(opts.origin, opts.provider);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: cfg.scopes,
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${cfg.authUrl}?${params.toString()}`;
}

export async function consumeState(state: string) {
  const { data, error } = await supabaseAdmin
    .from("oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();
  if (error || !data) return null;
  await supabaseAdmin.from("oauth_states").delete().eq("state", state);
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data as {
    state: string;
    user_id: string;
    provider: Provider;
  };
}

export async function exchangeCode(opts: {
  provider: Provider;
  code: string;
  origin: string;
}) {
  const cfg = getProviderConfig(opts.provider);
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code: opts.code,
    grant_type: "authorization_code",
    redirect_uri: callbackUrl(opts.origin, opts.provider),
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Token exchange ${res.status}: ${t.slice(0, 300)}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
}

export async function refreshAccessToken(opts: {
  provider: Provider;
  refreshToken: string;
}) {
  const cfg = getProviderConfig(opts.provider);
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: opts.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Refresh ${res.status}: ${t.slice(0, 300)}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
}

export async function saveTokens(opts: {
  userId: string;
  provider: Provider;
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
}) {
  const expiresAt = opts.tokens.expires_in
    ? new Date(Date.now() + (opts.tokens.expires_in - 60) * 1000).toISOString()
    : null;
  // Upsert; preserve existing refresh_token if provider didn't return one this time.
  const { data: existing } = await supabaseAdmin
    .from("integration_tokens")
    .select("refresh_token")
    .eq("user_id", opts.userId)
    .eq("provider", opts.provider)
    .maybeSingle();

  const refresh = opts.tokens.refresh_token ?? existing?.refresh_token ?? null;

  const { error } = await supabaseAdmin.from("integration_tokens").upsert(
    {
      user_id: opts.userId,
      provider: opts.provider,
      status: "connected",
      access_token: opts.tokens.access_token,
      refresh_token: refresh,
      expires_at: expiresAt,
      scope: opts.tokens.scope ?? null,
      metadata: {},
    },
    { onConflict: "user_id,provider" },
  );
  if (error) throw error;
}

/** Returns a valid access token for the user/provider, refreshing if expired. */
export async function getValidAccessToken(opts: {
  userId: string;
  provider: Provider;
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("integration_tokens")
    .select("access_token,refresh_token,expires_at,status")
    .eq("user_id", opts.userId)
    .eq("provider", opts.provider)
    .maybeSingle();
  if (error || !data || data.status !== "connected" || !data.access_token) {
    return null;
  }
  const expired =
    data.expires_at && new Date(data.expires_at).getTime() < Date.now();
  if (!expired) return data.access_token;
  if (!data.refresh_token) return null;
  try {
    const refreshed = await refreshAccessToken({
      provider: opts.provider,
      refreshToken: data.refresh_token,
    });
    await saveTokens({
      userId: opts.userId,
      provider: opts.provider,
      tokens: refreshed,
    });
    return refreshed.access_token;
  } catch (err) {
    console.error("[oauth] refresh failed", opts.provider, err);
    await supabaseAdmin
      .from("integration_tokens")
      .update({ status: "error" })
      .eq("user_id", opts.userId)
      .eq("provider", opts.provider);
    return null;
  }
}
