import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_BASE = "https://unipool-backend-owb9.onrender.com";
const HOME = "https://uni-pool-ruddy.vercel.app";
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
};
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } }); }
function fail(detail: string, status = 400) { return json({ detail }, status); }
function nowIso() { return new Date().toISOString(); }
async function body(req: Request) { try { return await req.json(); } catch { return {}; } }
async function sha256(value: string) { const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function renderFetch(path: string, token: string) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 9000);
  try { return await fetch(`${RENDER_BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: controller.signal, cache: "no-store" }); }
  catch { return null; } finally { clearTimeout(timer); }
}
type User = { user_id: string; name: string; email?: string; picture?: string | null; token: string };
async function authUser(req: Request): Promise<User> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) throw { status: 401, detail: "Missing authorization header" };
  const token = auth.slice(7).trim(); if (!token) throw { status: 401, detail: "Missing session token" };
  const tokenHash = await sha256(token);
  const { data: cached } = await db.from("unipool_session_cache").select("*").eq("token_hash", tokenHash).maybeSingle();
  let user: User;
  if (cached && new Date(cached.expires_at).getTime() > Date.now()) user = { user_id: cached.user_id, name: cached.user_name || "Student", email: cached.user_email || undefined, picture: cached.user_picture || null, token };
  else {
    const response = await renderFetch("/api/auth/me", token);
    if (!response) throw { status: 503, detail: "UniPool session verification is temporarily unavailable" };
    if (!response.ok) throw { status: response.status === 401 ? 401 : 503, detail: response.status === 401 ? "Session expired" : "UniPool session verification failed" };
    const data = await response.json(); user = { user_id: data.user_id, name: data.name || "Student", email: data.email, picture: data.picture || null, token };
    await db.from("unipool_session_cache").upsert({ token_hash: tokenHash, user_id: user.user_id, user_name: user.name, user_email: user.email || null, user_picture: user.picture || null, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), validated_at: nowIso() });
  }
  await db.from("unipool_user_directory").upsert({ user_id: user.user_id, name: user.name, email: user.email || null, picture: user.picture || null, updated_at: nowIso() });
  return user;
}
async function namesFor(ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const { data } = await db.from("unipool_user_directory").select("user_id,name,email,picture").in("user_id", [...new Set(ids)]);
  return new Map((data || []).map((u: any) => [u.user_id, u]));
}
function emailProvider() {
  if (Deno.env.get("SENDGRID_API_KEY") && Deno.env.get("SENDGRID_FROM_EMAIL")) return "sendgrid";
  if (Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM_EMAIL")) return "resend";
  return null;
}
function esc(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c)); }
async function sendInviteEmail(to: string, subject: string, circleName: string, inviteCode: string, inviter: string) {
  const provider = emailProvider(); if (!provider) return { sent: false, provider: null };
  const html = `<html><body style="margin:0;background:#FFF9F2;font-family:Arial,sans-serif;color:#1C1917"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#fff;border-radius:18px;overflow:hidden"><tr><td style="background:#1A237E;padding:22px;color:#fff"><div style="font-size:24px;font-weight:800;color:#FF9933">UniPool</div><div style="font-size:13px;margin-top:4px">Trips · Circles · Money · Student Network</div></td></tr><tr><td style="padding:26px"><h2 style="margin-top:0">Join ${esc(circleName)}</h2><p><b>${esc(inviter)}</b> invited you to a private UniPool Circle.</p><div style="background:#FFF0D0;border-radius:14px;padding:18px;text-align:center;margin:20px 0"><div style="font-size:12px;color:#7A5A20">INVITE CODE</div><div style="font-size:28px;font-weight:800;letter-spacing:4px;color:#1A237E;margin-top:6px">${esc(inviteCode)}</div></div><p>Open UniPool, go to <b>Circles → Join</b>, and enter the code above.</p><p style="margin-top:24px"><a href="${HOME}/circles" style="background:#1A237E;color:#fff;text-decoration:none;padding:12px 18px;border-radius:22px;font-weight:700">Open UniPool</a></p><p style="font-size:12px;color:#6B625D;margin-top:28px">Only join Circles from people you know. UniPool does not move money; it records shared expenses and settlements.</p></td></tr></table></td></tr></table></body></html>`;
  try {
    if (provider === "sendgrid") {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("SENDGRID_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: Deno.env.get("SENDGRID_FROM_EMAIL"), name: "UniPool" }, subject, content: [{ type: "text/html", value: html }] }) });
      return { sent: response.status === 202, provider };
    }
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: `UniPool <${Deno.env.get("RESEND_FROM_EMAIL")}>`, to: [to], subject, html }) });
    return { sent: response.ok, provider };
  } catch { return { sent: false, provider }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url); const marker = "/unipool-utility"; const i = url.pathname.indexOf(marker); const path = i >= 0 ? (url.pathname.slice(i + marker.length) || "/") : url.pathname;
  try {
    if (path === "/health" && req.method === "GET") return json({ status: "ok", version: "utility-2.0", directory: true, relations: true, policy_consents: true, direct_invites: true, invite_email_provider: emailProvider() });
    const user = await authUser(req);

    if (path === "/directory" && req.method === "GET") {
      const q = (url.searchParams.get("q") || "").trim().slice(0, 120); if (q.length < 2) return json([]);
      const escaped = q.replace(/[,%()]/g, " ");
      const { data, error } = await db.from("unipool_user_directory").select("user_id,name,email,picture").or(`name.ilike.%${escaped}%,email.ilike.%${escaped}%`).neq("user_id", user.user_id).limit(12);
      if (error) throw error;
      return json((data || []).map((r: any) => ({ user_id: r.user_id, name: r.name || "Student", email: r.email || null, picture: r.picture || null })));
    }

    if (path === "/circle-invites" && req.method === "POST") {
      const b = await body(req); const circleId = String(b.circle_id || ""); const email = String(b.email || "").trim().toLowerCase();
      if (!circleId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address");
      const { data: membership } = await db.from("unipool_circle_members").select("role").eq("circle_id", circleId).eq("user_id", user.user_id).maybeSingle();
      if (!membership || membership.role !== "admin") return fail("Only a Circle admin can invite members", 403);
      const { data: circle } = await db.from("unipool_circles").select("id,name,invite_code").eq("id", circleId).maybeSingle(); if (!circle) return fail("Circle not found", 404);
      const { data: existing } = await db.from("unipool_user_directory").select("user_id,name,email,picture").ilike("email", email).maybeSingle();
      if (existing) return json({ exists: true, user: existing });
      const token = crypto.randomUUID().replaceAll("-", "");
      await db.from("unipool_circle_invites").insert({ circle_id: circleId, email, invited_by: user.user_id, invite_token: token, status: "pending" });
      const subject = `Join ${circle.name} on UniPool`;
      const message = `You've been invited to the UniPool Circle “${circle.name}”.\n\n1. Create or sign in to your UniPool account: ${HOME}\n2. Open Circles and choose Join.\n3. Enter invite code: ${circle.invite_code}\n\nUniPool helps university friends track shared expenses and simplify group debts.`;
      let delivery = { sent: false, provider: null as string | null };
      if (b.send_direct === true) delivery = await sendInviteEmail(email, subject, circle.name, circle.invite_code, user.name);
      return json({ exists: false, email, circle_name: circle.name, invite_code: circle.invite_code, subject, message, ...delivery });
    }

    if (path === "/relations" && req.method === "GET") {
      const { data } = await db.from("unipool_user_relations").select("target_user_id,relation,created_at").eq("owner_user_id", user.user_id).order("created_at", { ascending: false });
      const ids = (data || []).map((r: any) => r.target_user_id); const names = await namesFor(ids);
      return json((data || []).map((r: any) => ({ user_id: r.target_user_id, relation: r.relation, created_at: r.created_at, name: names.get(r.target_user_id)?.name || "Student", email: names.get(r.target_user_id)?.email || null, picture: names.get(r.target_user_id)?.picture || null })));
    }
    const restrictMatch = path.match(/^\/relations\/([^/]+)\/restrict$/);
    if (restrictMatch && req.method === "POST") {
      const target = decodeURIComponent(restrictMatch[1]); if (!target || target === user.user_id) return fail("Choose another user");
      await db.from("unipool_user_relations").upsert({ owner_user_id: user.user_id, target_user_id: target, relation: "restricted", created_at: nowIso() }, { onConflict: "owner_user_id,target_user_id,relation" });
      return json({ ok: true });
    }
    if (restrictMatch && req.method === "DELETE") {
      const target = decodeURIComponent(restrictMatch[1]); await db.from("unipool_user_relations").delete().eq("owner_user_id", user.user_id).eq("target_user_id", target).eq("relation", "restricted"); return json({ ok: true });
    }

    if (path === "/policy-consent" && req.method === "POST") {
      const b = await body(req); const terms = String(b.terms_version || "2026-08-30"); const privacy = String(b.privacy_version || "2026-08-30"); const accepted = nowIso();
      await db.from("unipool_policy_consents").upsert({ user_id: user.user_id, terms_version: terms, privacy_version: privacy, terms_accepted_at: accepted, privacy_accepted_at: accepted, source: String(b.source || "signup"), updated_at: accepted });
      return json({ ok: true, terms_version: terms, privacy_version: privacy, accepted_at: accepted });
    }
    if (path === "/policy-consent" && req.method === "GET") {
      const { data } = await db.from("unipool_policy_consents").select("*").eq("user_id", user.user_id).maybeSingle(); return json(data || null);
    }

    return fail("Not Found", 404);
  } catch (e: any) { console.error(e); return fail(e?.detail || e?.message || "Unexpected error", Number(e?.status || 500)); }
});
