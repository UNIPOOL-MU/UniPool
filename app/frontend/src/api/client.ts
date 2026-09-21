import { storage } from "@/src/utils/storage";
import { answerLocalDailyChallenge, localDailyChallenge, localTriviaRound } from "@/src/data/travelTrivia";

const BASE = process.env.EXPO_PUBLIC_API_BASE_URL;
const TOKEN_KEY = "unipool.session_token";
export const FRONTEND_VERSION = "2.2.0";
export const FRONTEND_BUILD_SHA = process.env.EXPO_PUBLIC_BUILD_SHA || null;
type CacheEntry = { at: number; data: any };
let tokenMemory: string | null | undefined;
let tokenLoad: Promise<string | null> | null = null;
const responseCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>();
let wakePromise: Promise<void> | null = null;

export async function getToken(): Promise<string | null> {
  if (tokenMemory !== undefined) return tokenMemory;
  if (!tokenLoad) tokenLoad = storage.secureGet(TOKEN_KEY, null).then((value) => { tokenMemory = (value as string | null) || null; return tokenMemory; }).finally(() => { tokenLoad = null; });
  return tokenLoad;
}
export async function setToken(token: string | null) { tokenMemory = token; if (token) await storage.secureSet(TOKEN_KEY, token); else await storage.secureRemove(TOKEN_KEY); }
function clearReadCache() { responseCache.clear(); }
function currentRoute() { try { return typeof window !== "undefined" ? window.location.pathname : undefined; } catch { return undefined; } }

async function sendClientError(payload: Record<string, any>, token?: string | null) {
  if (!BASE || !token) return;
  try {
    await fetch(`${BASE}/api/client-errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...payload, app_version: FRONTEND_VERSION }),
    });
  } catch {}
}

async function req(path: string, opts: RequestInit = {}, cacheMs = 0) {
  if (!BASE) throw new Error("UniPool API is not configured");
  const method = (opts.method || "GET").toUpperCase();
  const cacheKey = `${method}:${path}`;
  if (method === "GET" && cacheMs > 0) {
    const cached = responseCache.get(cacheKey); if (cached && Date.now() - cached.at < cacheMs) return cached.data;
    const pending = inflight.get(cacheKey); if (pending) return pending;
  }
  const run = (async () => {
    const token = await getToken();
    const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as Record<string, string>) };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res: Response;
    try {
      res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
    } catch (networkError: any) {
      if (path !== "/client-errors") void sendClientError({ name: "NetworkError", message: networkError?.message || "Network request failed", route: currentRoute(), endpoint: path, context: { method } }, token);
      throw networkError;
    }
    const text = await res.text(); let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err: any = new Error(data?.detail || res.statusText || `Request failed (${res.status})`); err.status = res.status; err.data = data;
      if (path !== "/client-errors" && res.status !== 401) void sendClientError({ name: "ApiError", message: err.message, route: currentRoute(), endpoint: path, status: res.status, context: { method } }, token);
      throw err;
    }
    if (method === "GET" && cacheMs > 0) responseCache.set(cacheKey, { at: Date.now(), data });
    return data;
  })();
  if (method === "GET" && cacheMs > 0) { inflight.set(cacheKey, run); run.then(() => inflight.delete(cacheKey), () => inflight.delete(cacheKey)); }
  return run;
}
async function mutate(path: string, opts: RequestInit) { const data = await req(path, opts); clearReadCache(); return data; }
async function wakeBackend() {
  if (!BASE) throw new Error("UniPool API is not configured");
  if (wakePromise) return wakePromise;
  wakePromise = (async () => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 20000) : null;
    try {
      const response = await fetch(`${BASE}/health`, { method: "GET", cache: "no-store", signal: controller?.signal });
      if (!response.ok) throw new Error(`UniPool API returned ${response.status}`);
      const health = await response.json();
      if (health?.status !== "ok") throw new Error("UniPool API or database is unavailable");
    } finally { if (timer) clearTimeout(timer); }
  })().finally(() => { wakePromise = null; });
  return wakePromise;
}
if (typeof document !== "undefined" && BASE) { try { const origin = new URL(BASE).origin; if (!document.querySelector(`link[data-unipool-preconnect="${origin}"]`)) { const link = document.createElement("link"); link.rel = "preconnect"; link.href = origin; link.setAttribute("data-unipool-preconnect", origin); document.head.appendChild(link); } } catch {} }
function query(params: Record<string, string | number | boolean | undefined | null>) { const q = new URLSearchParams(); Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== "") q.set(key, String(value)); }); return q.toString(); }

export const api = {
  wakeBackend,
  googleSignIn: (id_token: string) => req("/auth/google", { method: "POST", body: JSON.stringify({ id_token }) }),
  emailSignup: (email: string, password: string, name: string, username?: string, turnstileToken?: string | null) => mutate("/auth/signup", { method: "POST", body: JSON.stringify({ email, password, name, username, turnstile_token: turnstileToken }) }),
  confirmEmailSignup: (challengeId: string, code: string) => mutate("/auth/signup/confirm", { method: "POST", body: JSON.stringify({ challenge_id: challengeId, code }) }),
  emailLogin: (identifier: string, password: string, turnstileToken?: string | null) => req("/auth/login", { method: "POST", body: JSON.stringify({ identifier, password, turnstile_token: turnstileToken }) }),
  me: () => req("/auth/me"), logout: () => mutate("/auth/logout", { method: "POST" }), updateProfile: (patch: any) => mutate("/profile", { method: "PATCH", body: JSON.stringify(patch) }),

  listPools: () => req("/pools", {}, 10000), routeHeatmap: () => req("/analytics/route-heatmap", {}, 30000), myPools: () => req("/pools/mine", {}, 10000), myMatches: () => req("/pools/matches", {}, 8000),
  createPool: (body: any) => mutate("/pools", { method: "POST", body: JSON.stringify(body) }), updatePool: (id: string, body: any) => mutate(`/pools/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  closePool: (id: string) => mutate(`/pools/${id}/close`, { method: "PATCH" }), reopenPool: (id: string) => mutate(`/pools/${id}/reopen`, { method: "PATCH" }), deletePool: (id: string) => mutate(`/pools/${id}`, { method: "DELETE" }), getPool: (poolId: string) => req(`/pools/${poolId}`, {}, 8000),

  searchLocations: (q = "", limit = 12) => req(`/locations?${query({ q, limit })}`, {}, 60000),
  savedRoutes: () => req("/saved-routes", {}, 8000), saveRoute: (body: any) => mutate("/saved-routes", { method: "POST", body: JSON.stringify(body) }), deleteSavedRoute: (id: string) => mutate(`/saved-routes/${id}`, { method: "DELETE" }),
  recurringRoutes: () => req("/recurring-routes", {}, 8000), createRecurringRoute: (body: any) => mutate("/recurring-routes", { method: "POST", body: JSON.stringify(body) }), updateRecurringRoute: (id: string, body: any) => mutate(`/recurring-routes/${id}`, { method: "PATCH", body: JSON.stringify(body) }), deleteRecurringRoute: (id: string) => mutate(`/recurring-routes/${id}`, { method: "DELETE" }),
  upcomingJourneys: () => req("/journeys/upcoming", {}, 5000), setJourneyStatus: (poolId: string, status: string) => mutate(`/journeys/${poolId}/status`, { method: "PATCH", body: JSON.stringify({ status }) }), setMeetingPoint: (poolId: string, body: any) => mutate(`/journeys/${poolId}/meeting-point`, { method: "PATCH", body: JSON.stringify(body) }), setJourneyFare: (poolId: string, amount: number, currency = "INR") => mutate(`/journeys/${poolId}/fare`, { method: "PATCH", body: JSON.stringify({ amount, currency }) }), repeatJourney: (poolId: string, travel_datetime: string) => mutate(`/journeys/${poolId}/repeat`, { method: "POST", body: JSON.stringify({ travel_datetime }) }), duplicateJourneys: (from_location: string, to_location: string, travel_datetime: string) => req(`/journeys/duplicates?${query({ from_location, to_location, travel_datetime })}`), routeInsights: () => req("/route-insights", {}, 30000), travelDigest: () => req("/travel-digest", {}, 10000), diagnostics: () => req("/diagnostics", {}, 5000),
  cancelJourney: (poolId: string, reason: string, note?: string) => mutate(`/journeys/${poolId}/cancel-with-reason`, { method: "POST", body: JSON.stringify({ reason, note }) }),
  reportNoShow: (poolId: string, reported_user_id: string, note?: string) => mutate(`/journeys/${poolId}/no-show`, { method: "POST", body: JSON.stringify({ reported_user_id, note }) }),

  notifications: (unreadOnly = false, limit = 60) => req(`/notifications?${query({ unread_only: unreadOnly, limit })}`, {}, 4000),
  readNotification: (id: string) => mutate(`/notifications/${id}/read`, { method: "PATCH" }),
  readAllNotifications: () => mutate("/notifications/read-all", { method: "POST" }),
  notificationPreferences: () => req("/notification-preferences", {}, 10000),
  updateNotificationPreferences: (body: any) => mutate("/notification-preferences", { method: "PATCH", body: JSON.stringify(body) }),
  pickupPoints: () => req("/pickup-points", {}, 10000),
  savePickupPoint: (body: any) => mutate("/pickup-points", { method: "POST", body: JSON.stringify(body) }),
  deletePickupPoint: (id: string) => mutate(`/pickup-points/${id}`, { method: "DELETE" }),

  userProfile: (userId: string) => req(`/users/${encodeURIComponent(userId)}/profile`, {}, 10000),
  travelHistory: (limit = 50) => req(`/travel-history?${query({ limit })}`, {}, 15000), myReliability: () => req("/reliability/me", {}, 10000), userReliability: (userId: string) => req(`/reliability/${userId}`, {}, 10000), mutualContext: (userId: string) => req(`/mutual-context/${userId}`, {}, 10000),
  globalSearch: (q: string) => req(`/search/global?${query({ q })}`, {}, 5000), recordEvent: (event: string, context: Record<string, any> = {}) => mutate("/analytics/events", { method: "POST", body: JSON.stringify({ event, context }) }), productAnalytics: () => req("/analytics/product", {}, 10000),
  reportClientError: (body: any) => mutate("/client-errors", { method: "POST", body: JSON.stringify({ ...body, app_version: FRONTEND_VERSION }) }),
  releaseDiagnostics: () => req(`/admin/release-diagnostics?${query({ frontend_version: FRONTEND_VERSION })}`, {}, 5000),

  dailyChallenge: () => localDailyChallenge(),
  answerDailyChallenge: (challenge_id: string, answer: number) => answerLocalDailyChallenge(challenge_id, answer),
  dailyChallengeLeaderboard: () => req("/daily-challenge/leaderboard", {}, 30000).catch(() => []),
  trivia: (excludeIds: string[] = [], count = 8) => Promise.resolve(localTriviaRound(excludeIds, count)),

  adminRoles: () => req("/admin/roles", {}, 10000),
  setMemberRole: (userId: string, role: "user" | "moderator" | "admin") => mutate(`/admin/people/${encodeURIComponent(userId)}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  adminReports: () => req("/admin/reports", {}, 10000),
  adminResolveReport: (id: string) => mutate(`/admin/reports/${encodeURIComponent(id)}/resolve`, { method: "PATCH" }),
  adminStats: () => req("/admin/stats", {}, 10000), adminPools: () => req("/admin/pools", {}, 5000), adminPeople: () => req("/admin/people", {}, 5000), adminDeletePool: (id: string) => mutate(`/admin/pools/${id}`, { method: "DELETE" }),
  sendMessage: (to_user_id: string, text: string, pool_id?: string) => mutate("/messages", { method: "POST", body: JSON.stringify({ to_user_id, text, pool_id }) }), getThread: (otherUserId: string) => req(`/messages/${otherUserId}`, {}, 2500), listConversations: () => req("/messages/conversations", {}, 5000), sendTyping: (to_user_id: string) => req("/messages/typing", { method: "POST", body: JSON.stringify({ to_user_id }) }), getTyping: (otherUserId: string) => req(`/messages/typing/${otherUserId}`), getPresence: (userId: string) => req(`/users/${userId}/presence`, {}, 3000),
  getVapidKey: () => req("/push/vapid-public-key", {}, 60000), pushSubscribe: (sub: { endpoint: string; keys: any }) => mutate("/push/subscribe", { method: "POST", body: JSON.stringify(sub) }), pushUnsubscribe: (endpoint: string) => mutate("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
  submitScore: (game: string, score: number) => mutate("/games/score", { method: "POST", body: JSON.stringify({ game, score }) }), getLeaderboard: (game: string) => req(`/games/leaderboard/${game}`, {}, 5000),
  submitRating: (rated_user_id: string, stars: number, comment?: string, pool_id?: string) => mutate("/ratings", { method: "POST", body: JSON.stringify({ rated_user_id, stars, comment, pool_id }) }), getUserRatings: (userId: string) => req(`/ratings/user/${userId}`, {}, 10000), canRate: (userId: string) => req(`/ratings/can-rate/${userId}`, {}, 5000),
  requestToJoin: (poolId: string) => mutate(`/pools/${poolId}/requests`, { method: "POST" }), listPoolRequests: (poolId: string) => req(`/pools/${poolId}/requests`, {}, 5000), incomingRequests: () => req("/requests/incoming", {}, 5000), myRequests: () => req("/requests/mine", {}, 5000), acceptRequest: (requestId: string) => mutate(`/requests/${requestId}/accept`, { method: "PATCH" }), declineRequest: (requestId: string) => mutate(`/requests/${requestId}/decline`, { method: "PATCH" }), cancelRequest: (requestId: string) => mutate(`/requests/${requestId}`, { method: "DELETE" }), confirmedMatches: () => req("/matches/confirmed", {}, 8000), removeTraveler: (poolId: string, travelerUserId: string) => mutate(`/pools/${poolId}/travelers/${travelerUserId}`, { method: "DELETE" }),
  blockUser: (userId: string) => mutate(`/users/${userId}/block`, { method: "POST" }), unblockUser: (userId: string) => mutate(`/users/${userId}/block`, { method: "DELETE" }), listBlocked: () => req("/users/me/blocked", {}, 10000), submitReport: (reportedUserId: string, reason: string, details?: string, poolId?: string) => mutate("/reports", { method: "POST", body: JSON.stringify({ reported_user_id: reportedUserId, reason, details, pool_id: poolId }) }),
  verifyCollegeIdStart: (collegeEmail: string) => mutate("/profile/verify-college-id/start", { method: "POST", body: JSON.stringify({ college_email: collegeEmail }) }), verifyCollegeIdConfirm: (code: string) => mutate("/profile/verify-college-id/confirm", { method: "POST", body: JSON.stringify({ code }) }),
  ensureTripChat: (poolId: string) => mutate(`/messages/trip/ensure/${poolId}`, { method: "POST" }), getGroupThread: (conversationId: string) => req(`/messages/group/${conversationId}`, {}, 2500), sendGroupMessage: (conversationId: string, text: string) => mutate(`/messages/group/${conversationId}`, { method: "POST", body: JSON.stringify({ text }) }),
};
