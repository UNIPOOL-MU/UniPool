import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import { api, getToken, setToken } from "@/src/api/client";
import { collegeSignupApi, CollegeSignupChallenge } from "@/src/api/collegeSignup";
import { authExtrasApi, MicrosoftAuthConfig } from "@/src/api/authExtras";
import { peopleApi } from "@/src/api/people";
import { storage } from "@/src/utils/storage";

export type UniUser = {
  user_id: string;
  email: string;
  name: string;
  picture?: string | null;
  gender?: string | null;
  phone?: string | null;
  blood_group?: string | null;
  username?: string | null;
  is_admin?: boolean;
  college_verified?: boolean;
  college_email?: string | null;
  roll_number?: string | null;
  school_name?: string | null;
  degree_level_name?: string | null;
  branch_name?: string | null;
  batch_year?: number | null;
  onboarding_completed?: boolean;
  signup_tour_eligible?: boolean;
  created_at?: string;
};

type AuthCtx = {
  user: UniUser | null;
  loading: boolean;
  signingIn: boolean;
  signInError: string | null;
  microsoftEnabled: boolean;
  microsoftConfigLoading: boolean;
  clearSignInError: () => void;
  signIn: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  renderGoogleButton: (containerId: string) => void;
  signInWithPassword: (identifier: string, password: string, turnstileToken?: string | null) => Promise<void>;
  signUpWithPassword: (email: string, password: string, name: string, username?: string, turnstileToken?: string | null) => Promise<void>;
  startCollegeSignup: (email: string, password: string, name: string, username?: string, turnstileToken?: string | null) => Promise<CollegeSignupChallenge>;
  confirmCollegeSignup: (challengeId: string, code: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as any);
export const useAuth = () => useContext(Ctx);

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "";
const USER_CACHE_KEY = "unipool.cached_user.v1";
const MS_FLOW_KEY = "unipool.microsoft_pkce.v1";
const TOUR_LOCAL_PREFIX = "unipool.first_tour_done.v1";

declare global {
  interface Window {
    google?: any;
  }
}

let gsiScriptPromise: Promise<void> | null = null;
let microsoftCallbackHandled = false;

function loadGoogleScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiScriptPromise) return gsiScriptPromise;
  gsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Sign-In script")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In script"));
    document.head.appendChild(script);
  });
  return gsiScriptPromise;
}

function tourKey(userId: string) {
  return `${TOUR_LOCAL_PREFIX}.${userId}`;
}

async function applyLocalTourState(next: UniUser): Promise<UniUser> {
  const localDone = await storage.secureGet(tourKey(next.user_id), null);
  if (localDone === "1") return { ...next, onboarding_completed: true };
  try { if ((await peopleApi.tourStatus()).completed) return { ...next, onboarding_completed: true }; } catch {}
  const eligible = await storage.secureGet(`${tourKey(next.user_id)}.eligible`, null);
  return { ...next, signup_tour_eligible: next.signup_tour_eligible || eligible === "1" };
}

async function cacheUser(next: UniUser | null) {
  if (next) await storage.secureSet(USER_CACHE_KEY, JSON.stringify(next));
  else await storage.secureRemove(USER_CACHE_KEY);
}

async function readCachedUser(): Promise<UniUser | null> {
  const raw = await storage.secureGet(USER_CACHE_KEY, null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.user_id && parsed?.email ? parsed as UniUser : null;
  } catch {
    await storage.secureRemove(USER_CACHE_KEY);
    return null;
  }
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomToken(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64Url(data);
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function cleanMicrosoftCallbackUrl() {
  try {
    const url = new URL(window.location.href);
    ["code", "state", "session_state", "error", "error_description"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UniUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [microsoftConfig, setMicrosoftConfig] = useState<MicrosoftAuthConfig | null>(null);
  const [microsoftConfigLoading, setMicrosoftConfigLoading] = useState(true);

  const clearSignInError = useCallback(() => setSignInError(null), []);

  const loadMicrosoftConfig = useCallback(async () => {
    setMicrosoftConfigLoading(true);
    try {
      const config = await authExtrasApi.microsoftConfig();
      setMicrosoftConfig(config);
      return config;
    } catch (error) {
      console.warn("Microsoft sign-in config unavailable", error);
      const fallback = { enabled: false, client_id: null, tenant: "organizations" } as MicrosoftAuthConfig;
      setMicrosoftConfig(fallback);
      return fallback;
    } finally {
      setMicrosoftConfigLoading(false);
    }
  }, []);

  const applySession = useCallback(async (sessionToken: string, nextUser: UniUser) => {
    await setToken(sessionToken);
    if (nextUser.signup_tour_eligible || (nextUser.onboarding_completed === false && nextUser.created_at && Date.now() - new Date(nextUser.created_at).getTime() >= 0 && Date.now() - new Date(nextUser.created_at).getTime() < 120000)) {
      nextUser = { ...nextUser, signup_tour_eligible: true, onboarding_completed: false };
      await storage.secureSet(`${tourKey(nextUser.user_id)}.eligible`, "1");
    }
    const effectiveUser = await applyLocalTourState(nextUser);
    await cacheUser(effectiveUser);
    setUser(effectiveUser);
    if (effectiveUser.onboarding_completed === true && nextUser.onboarding_completed === false) {
      authExtrasApi.completeOnboarding().catch(() => {});
    }
  }, []);

  const handleCredential = useCallback(async (response: { credential: string }) => {
    setSigningIn(true);
    setSignInError(null);
    try {
      const res = await api.googleSignIn(response.credential);
      await applySession(res.session_token, res.user);
    } catch (e: any) {
      console.warn("Google sign-in failed", e);
      setSignInError(
        e?.message === "Failed to fetch" || e?.name === "TypeError"
          ? "The UniPool server is still waking up. Please try once more in a few seconds."
          : e?.message || "Sign-in failed. Please try again."
      );
    } finally {
      setSigningIn(false);
    }
  }, [applySession]);

  const initGoogle = useCallback(async () => {
    if (Platform.OS !== "web" || !GOOGLE_CLIENT_ID) return;
    await loadGoogleScript();
    if (!window.google?.accounts?.id) return;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
      error_callback: (error: any) => {
        console.warn("Google Identity Services error", error);
        setSignInError(
          error?.type === "popup_failed_to_open"
            ? "Google sign-in popup was blocked. Please allow popups for UniPool and try again."
            : "Google sign-in could not start. Please try again."
        );
      },
    });
  }, [handleCredential]);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.me();
      const effective = await applyLocalTourState(fresh);
      setUser(effective);
      await cacheUser(effective);
      if (effective.onboarding_completed === true && fresh.onboarding_completed === false) {
        authExtrasApi.completeOnboarding().catch(() => {});
      }
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 403) {
        setUser(null);
        await Promise.all([setToken(null), cacheUser(null)]);
      } else {
        console.warn("Session validation deferred; keeping cached session", e);
      }
    }
  }, []);

  const handleMicrosoftCallback = useCallback(async () => {
    if (Platform.OS !== "web" || microsoftCallbackHandled) return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (!code && !oauthError) return;
    microsoftCallbackHandled = true;
    setSigningIn(true);
    setSignInError(null);

    try {
      if (oauthError) {
        const description = url.searchParams.get("error_description") || "Microsoft sign-in was cancelled or could not complete.";
        throw new Error(description);
      }
      const raw = window.sessionStorage.getItem(MS_FLOW_KEY);
      if (!raw) throw new Error("Microsoft sign-in session expired. Please try again.");
      const flow = JSON.parse(raw) as {
        state: string;
        nonce: string;
        verifier: string;
        redirect_uri: string;
        client_id: string;
        tenant: string;
      };
      if (!returnedState || returnedState !== flow.state) throw new Error("Microsoft sign-in session could not be verified. Please try again.");

      const tokenBody = new URLSearchParams({
        client_id: flow.client_id,
        scope: "openid profile email",
        code: code || "",
        redirect_uri: flow.redirect_uri,
        grant_type: "authorization_code",
        code_verifier: flow.verifier,
      });
      const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(flow.tenant)}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody.toString(),
      });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenData?.id_token) {
        throw new Error(tokenData?.error_description || "Microsoft could not finish sign-in.");
      }
      const session = await authExtrasApi.microsoftSignIn(tokenData.id_token, flow.nonce);
      await applySession(session.session_token, session.user);
    } catch (e: any) {
      console.warn("Microsoft sign-in failed", e);
      setSignInError(e?.message || "Microsoft sign-in failed. Please try again.");
    } finally {
      window.sessionStorage.removeItem(MS_FLOW_KEY);
      cleanMicrosoftCallbackUrl();
      setSigningIn(false);
    }
  }, [applySession]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [token, cached] = await Promise.all([getToken(), readCachedUser()]);
      if (!active) return;
      if (token && cached) {
        const effectiveCached = await applyLocalTourState(cached);
        if (active) setUser(effectiveCached);
      }
      setLoading(false);

      api.wakeBackend().catch(() => {});
      initGoogle().catch((e) => console.warn("Google script failed to load", e));
      loadMicrosoftConfig().catch(() => {});

      if (token) refresh();
      else handleMicrosoftCallback();
    })();
    return () => { active = false; };
  }, [initGoogle, refresh, loadMicrosoftConfig, handleMicrosoftCallback]);

  const signIn = useCallback(async () => {
    if (Platform.OS !== "web") {
      console.warn("Google sign-in is currently only wired up for web.");
      return;
    }
    await initGoogle();
    if (window.google?.accounts?.id) window.google.accounts.id.prompt();
  }, [initGoogle]);

  const signInWithMicrosoft = useCallback(async () => {
    setSignInError(null);
    if (Platform.OS !== "web") {
      setSignInError("Microsoft university sign-in is currently available on the UniPool web app.");
      return;
    }
    const config = microsoftConfig?.enabled ? microsoftConfig : await loadMicrosoftConfig();
    if (!config.enabled || !config.client_id) {
      setSignInError("Microsoft university sign-in needs UniPool's one-time Microsoft Entra app registration. Use your college email verification for now.");
      return;
    }
    if (!window.crypto?.subtle || !window.sessionStorage) {
      setSignInError("This browser cannot start secure Microsoft sign-in. Use college email verification instead.");
      return;
    }

    const verifier = randomToken(48);
    const challenge = await sha256Base64Url(verifier);
    const state = randomToken(24);
    const nonce = randomToken(24);
    const redirectUri = `${window.location.origin}/`;
    const tenant = config.tenant || "organizations";
    window.sessionStorage.setItem(MS_FLOW_KEY, JSON.stringify({
      state,
      nonce,
      verifier,
      redirect_uri: redirectUri,
      client_id: config.client_id,
      tenant,
    }));

    const authorize = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
    authorize.searchParams.set("client_id", config.client_id);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("response_mode", "query");
    authorize.searchParams.set("scope", "openid profile email");
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("nonce", nonce);
    authorize.searchParams.set("prompt", "select_account");
    window.location.assign(authorize.toString());
  }, [microsoftConfig, loadMicrosoftConfig]);

  const renderGoogleButton = useCallback((containerId: string) => {
    if (Platform.OS !== "web") return;
    initGoogle().then(() => {
      const el = document.getElementById(containerId);
      if (el && window.google?.accounts?.id) {
        el.innerHTML = "";
        window.google.accounts.id.renderButton(el, {
          theme: "outline",
          size: "large",
          width: 280,
        });
      }
    }).catch(() => {});
  }, [initGoogle]);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch {}
    await Promise.all([setToken(null), cacheUser(null)]);
    setUser(null);
    if (Platform.OS === "web" && window.google?.accounts?.id) {
      try {
        window.google.accounts.id.disableAutoSelect();
        window.google.accounts.id.cancel();
      } catch {}
    }
  }, []);

  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    const optimistic = { ...user, onboarding_completed: true };
    setUser(optimistic);
    await Promise.all([
      cacheUser(optimistic),
      storage.secureSet(tourKey(user.user_id), "1"),
    ]);
    try {
      await peopleApi.completeTour();
      const refreshed = { ...optimistic };
      const effective = await applyLocalTourState(refreshed);
      setUser(effective);
      await cacheUser(effective);
    } catch (error) {
      console.warn("Tour completion will sync later", error);
    }
  }, [user]);

  const signInWithPassword = useCallback(async (identifier: string, password: string, turnstileToken?: string | null) => {
    setSigningIn(true);
    setSignInError(null);
    try {
      const res = await api.emailLogin(identifier, password, turnstileToken);
      await applySession(res.session_token, res.user);
    } catch (e: any) {
      setSignInError(e?.message || "Sign-in failed. Please check your details and try again.");
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, [applySession]);

  const signUpWithPassword = useCallback(async (email: string, password: string, name: string, username?: string, turnstileToken?: string | null) => {
    setSigningIn(true);
    setSignInError(null);
    try {
      const res = await api.emailSignup(email, password, name, username, turnstileToken);
      await applySession(res.session_token, { ...res.user, onboarding_completed: false, signup_tour_eligible: true });
    } catch (e: any) {
      setSignInError(e?.message || "Couldn't create your account. Please try again.");
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, [applySession]);

  const startCollegeSignup = useCallback(async (email: string, password: string, name: string, username?: string, turnstileToken?: string | null) => {
    setSigningIn(true);
    setSignInError(null);
    try {
      return await collegeSignupApi.start({ email, password, name, username, turnstile_token: turnstileToken });
    } catch (e: any) {
      setSignInError(e?.message || "Couldn't send the college verification code. Please try again.");
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const confirmCollegeSignup = useCallback(async (challengeId: string, code: string) => {
    setSigningIn(true);
    setSignInError(null);
    try {
      const res = await collegeSignupApi.confirm(challengeId, code);
      await applySession(res.session_token, { ...res.user, onboarding_completed: false, signup_tour_eligible: true });
    } catch (e: any) {
      setSignInError(e?.message || "Couldn't verify that code. Please try again.");
      throw e;
    } finally {
      setSigningIn(false);
    }
  }, [applySession]);

  return (
    <Ctx.Provider value={{
      user, loading, signingIn, signInError,
      microsoftEnabled: Boolean(microsoftConfig?.enabled),
      microsoftConfigLoading,
      clearSignInError, signIn, signInWithMicrosoft, signOut, refresh, completeOnboarding, renderGoogleButton,
      signInWithPassword, signUpWithPassword, startCollegeSignup, confirmCollegeSignup,
    }}>
      {children}
    </Ctx.Provider>
  );
}
