/**
 * Native (Capacitor iOS) social sign-in helpers.
 *
 * On iOS we use the native Sign in with Apple sheet and the native Google
 * sign-in flow (which itself uses ASWebAuthenticationSession under the hood).
 * Both return an ID token that we exchange for a Supabase session via
 * `signInWithIdToken`. This satisfies Apple's requirement that OAuth stays
 * inside the app (no jump to external Safari).
 */
import { SignInWithApple } from "@capacitor-community/apple-sign-in";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/native";

let googleInitialized = false;
function ensureGoogleInit() {
  if (googleInitialized) return;
  // The iOS-side config (client ID) is picked up from Info.plist / capacitor
  // config. On web we don't call this path.
  GoogleAuth.initialize({
    scopes: ["profile", "email"],
    grantOfflineAccess: false,
  });
  googleInitialized = true;
}

export async function nativeSignInWithApple() {
  if (!isNative()) throw new Error("Native only");
  const res = await SignInWithApple.authorize({
    clientId: "app.lovable.maverick",
    redirectURI: "https://maverick-morning.lovable.app",
    scopes: "email name",
    state: crypto.randomUUID(),
    nonce: crypto.randomUUID(),
  });
  const idToken = res.response?.identityToken;
  if (!idToken) throw new Error("Apple sign-in returned no identity token");
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: idToken,
  });
  if (error) throw error;
}

export async function nativeSignInWithGoogle() {
  if (!isNative()) throw new Error("Native only");
  ensureGoogleInit();
  const user = await GoogleAuth.signIn();
  const idToken = user.authentication?.idToken;
  if (!idToken) throw new Error("Google sign-in returned no identity token");
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });
  if (error) throw error;
}
