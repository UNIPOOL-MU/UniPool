import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RENDER_BASE = "https://unipool-backend-owb9.onrender.com";
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function fail(detail: string, status = 400) { return json({ detail }, status); }
function nowIso() { return new Date().toISOString(); }
function safeDate(value: unknown) { const d = value ? new Date(String(value)) : new Date(); return Number.isNaN(d.getTime()) ? new Date() : d; }
async function body(req: Request) { try { return await req.json(); } catch { return {}; } }
async function sha256(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function renderFetch(path: string, token: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    return await fetch(`${RENDER_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
      cache: "no-store",
    });
  } catch { return null; }
  finally { clearTimeout(timer); }
}

type User = { user_id: string; name: string; email?: string; picture?: string | null; token: string };
async function authUser(req: Request): Promise<User> {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) throw { status: 401, detail: "Missing authorization header" };
  const token = auth.slice(7).trim();
  if (!token) throw { status: 401, detail: "Missing session token" };
  const tokenHash = await sha256(token);
  const { data: cached } = await db.from("unipool_session_cache").select("*").eq("token_hash", tokenHash).maybeSingle();
  let user: User | null = null;
  if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
    user = { user_id: cached.user_id, name: cached.user_name || "Student", email: cached.user_email || undefined, picture: cached.user_picture || null, token };
  } else {
    const response = await renderFetch("/api/auth/me", token);
    if (!response) throw { status: 503, detail: "UniPool session verification is temporarily unavailable" };
    if (!response.ok) throw { status: response.status === 401 ? 401 : 503, detail: response.status === 401 ? "Session expired" : "UniPool session verification failed" };
    const data = await response.json();
    user = { user_id: data.user_id, name: data.name || "Student", email: data.email, picture: data.picture || null, token };
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await db.from("unipool_session_cache").upsert({ token_hash: tokenHash, user_id: user.user_id, user_name: user.name, user_email: user.email || null, user_picture: user.picture || null, expires_at: expiresAt, validated_at: nowIso() });
  }
  await Promise.all([
    db.from("unipool_user_directory").upsert({ user_id: user.user_id, name: user.name, email: user.email || null, picture: user.picture || null, updated_at: nowIso() }),
    db.from("unipool_presence").upsert({ user_id: user.user_id, last_seen_at: nowIso() }),
  ]);
  return user;
}

function directKey(a: string, b: string) { return [a, b].sort().join("::"); }
async function ensureDirectConversation(a: string, b: string) {
  const key = directKey(a, b);
  let { data: convo } = await db.from("unipool_conversations").select("*").eq("direct_key", key).maybeSingle();
  if (!convo) {
    const inserted = await db.from("unipool_conversations").insert({ kind: "direct", direct_key: key, updated_at: nowIso() }).select("*").single();
    if (inserted.error) throw inserted.error;
    convo = inserted.data;
  }
  await db.from("unipool_conversation_members").upsert([
    { conversation_id: convo.id, user_id: a }, { conversation_id: convo.id, user_id: b },
  ], { onConflict: "conversation_id,user_id" });
  return convo;
}
async function directoryMap(ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const { data } = await db.from("unipool_user_directory").select("*").in("user_id", [...new Set(ids)]);
  return new Map((data || []).map((u: any) => [u.user_id, u]));
}

async function importLegacyThread(user: User, otherId: string, conversationId: string) {
  const candidates = [`/api/messages/${encodeURIComponent(otherId)}`, `/api/messages/thread/${encodeURIComponent(otherId)}`];
  for (const path of candidates) {
    const response = await renderFetch(path, user.token);
    if (!response?.ok) continue;
    const rows = await response.json().catch(() => null);
    if (!Array.isArray(rows)) continue;
    for (const m of rows) {
      if (!m?.from_user_id || !m?.to_user_id || !m?.text) continue;
      await db.from("unipool_messages").upsert({
        legacy_message_id: m.message_id || null,
        conversation_id: conversationId,
        from_user_id: m.from_user_id,
        to_user_id: m.to_user_id,
        pool_id: m.pool_id || null,
        text: String(m.text).slice(0, 2000),
        created_at: safeDate(m.created_at).toISOString(),
        read_at: m.read ? safeDate(m.created_at).toISOString() : null,
      }, { onConflict: "legacy_message_id", ignoreDuplicates: true });
    }
    return true;
  }
  return false;
}
async function importLegacyConversations(user: User) {
  const response = await renderFetch("/api/messages/conversations", user.token);
  if (!response?.ok) return;
  const rows = await response.json().catch(() => null);
  if (!Array.isArray(rows)) return;
  for (const item of rows) {
    if (item?.kind === "group" && item?.conversation_id) {
      let { data: existing } = await db.from("unipool_conversations").select("*").eq("legacy_conversation_id", item.conversation_id).maybeSingle();
      if (!existing) {
        const ins = await db.from("unipool_conversations").insert({ kind: "group", legacy_conversation_id: item.conversation_id, name: item.name || "Trip chat", updated_at: item.last_at || nowIso() }).select("*").single();
        existing = ins.data;
      }
      if (existing) await db.from("unipool_conversation_members").upsert({ conversation_id: existing.id, user_id: user.user_id }, { onConflict: "conversation_id,user_id" });
      continue;
    }
    const other = item?.other_user_id;
    if (!other) continue;
    if (item.name) await db.from("unipool_user_directory").upsert({ user_id: other, name: item.name, picture: item.picture || null, updated_at: nowIso() });
    const convo = await ensureDirectConversation(user.user_id, other);
    const { count } = await db.from("unipool_messages").select("id", { count: "exact", head: true }).eq("conversation_id", convo.id);
    if (!count && item.last_message) {
      const from = Number(item.unread || 0) > 0 ? other : user.user_id;
      const to = from === user.user_id ? other : user.user_id;
      await db.from("unipool_messages").upsert({
        legacy_message_id: `preview:${directKey(user.user_id, other)}`,
        conversation_id: convo.id, from_user_id: from, to_user_id: to,
        text: String(item.last_message).slice(0, 2000), created_at: safeDate(item.last_at).toISOString(),
        read_at: Number(item.unread || 0) > 0 ? null : safeDate(item.last_at).toISOString(),
      }, { onConflict: "legacy_message_id", ignoreDuplicates: true });
    }
  }
}

async function circleForMember(circleId: string, userId: string) {
  const { data: member } = await db.from("unipool_circle_members").select("role").eq("circle_id", circleId).eq("user_id", userId).maybeSingle();
  if (!member) throw { status: 404, detail: "Circle not found" };
  const { data: circle } = await db.from("unipool_circles").select("*").eq("id", circleId).single();
  return { circle, role: member.role };
}
function simplifyBalances(balances: Record<string, number>) {
  const creditors = Object.entries(balances).filter(([, n]) => n > 0).map(([u, n]) => [u, n] as [string, number]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const debtors = Object.entries(balances).filter(([, n]) => n < 0).map(([u, n]) => [u, -n] as [string, number]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out: any[] = []; let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i][1], creditors[j][1]);
    if (amount > 0) out.push({ from_user_id: debtors[i][0], to_user_id: creditors[j][0], amount_paise: amount });
    debtors[i][1] -= amount; creditors[j][1] -= amount;
    if (!debtors[i][1]) i++; if (!creditors[j][1]) j++;
  }
  return out;
}
async function circlePayload(circleId: string, viewerId: string) {
  const { circle } = await circleForMember(circleId, viewerId);
  const [{ data: members }, { data: expenses }, { data: settlements }, { data: activity }] = await Promise.all([
    db.from("unipool_circle_members").select("*").eq("circle_id", circleId).order("joined_at"),
    db.from("unipool_circle_expenses").select("*").eq("circle_id", circleId).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(1000),
    db.from("unipool_circle_settlements").select("*").eq("circle_id", circleId).is("voided_at", null).order("settled_at", { ascending: false }).limit(1000),
    db.from("unipool_circle_activity").select("*").eq("circle_id", circleId).order("created_at", { ascending: false }).limit(30),
  ]);
  const ids = (members || []).map((m: any) => m.user_id);
  const names = await directoryMap(ids);
  const balances: Record<string, number> = Object.fromEntries(ids.map((id: string) => [id, 0]));
  const expenseIds = (expenses || []).map((e: any) => e.id);
  let splits: any[] = [];
  if (expenseIds.length) { const res = await db.from("unipool_circle_splits").select("*").in("expense_id", expenseIds); splits = res.data || []; }
  const splitsByExpense = new Map<string, any[]>();
  for (const s of splits) { const arr = splitsByExpense.get(s.expense_id) || []; arr.push(s); splitsByExpense.set(s.expense_id, arr); }
  for (const e of expenses || []) {
    if (balances[e.paid_by] !== undefined) balances[e.paid_by] += Number(e.total_paise || 0);
    for (const s of splitsByExpense.get(e.id) || []) if (balances[s.user_id] !== undefined) balances[s.user_id] -= Number(s.share_paise || 0);
  }
  for (const s of settlements || []) {
    if (balances[s.from_user_id] !== undefined) balances[s.from_user_id] += Number(s.amount_paise || 0);
    if (balances[s.to_user_id] !== undefined) balances[s.to_user_id] -= Number(s.amount_paise || 0);
  }
  const simplified = simplifyBalances(balances).map((x) => ({ ...x, from_name: names.get(x.from_user_id)?.name || "Student", to_name: names.get(x.to_user_id)?.name || "Student" }));
  const expenseRows = (expenses || []).map((e: any) => {
    const es = (splitsByExpense.get(e.id) || []).map((s) => ({ user_id: s.user_id, amount_paise: Number(s.share_paise) }));
    return { expense_id: e.id, group_id: circleId, description: e.description, amount_paise: Number(e.total_paise), currency: "INR", paid_by: e.paid_by, paid_by_name: names.get(e.paid_by)?.name || "Student", splits: es, split_names: Object.fromEntries(es.map((s) => [s.user_id, names.get(s.user_id)?.name || "Student"])), split_type: e.split_method, category: e.category, notes: e.notes, created_by: e.created_by, created_at: e.occurred_at, updated_at: e.updated_at, deleted_at: null };
  });
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthExpenses = expenseRows.filter((e: any) => String(e.created_at).slice(0, 7) === monthKey);
  const categories: Record<string, number> = {};
  for (const e of monthExpenses) categories[e.category || "other"] = (categories[e.category || "other"] || 0) + e.amount_paise;
  const group = { group_id: circle.id, name: circle.name, emoji: circle.emoji, created_by: circle.created_by, member_ids: ids, admins: (members || []).filter((m: any) => m.role === "admin").map((m: any) => m.user_id), invite_code: circle.invite_code, archived: false, created_at: circle.created_at, updated_at: circle.updated_at };
  return {
    group,
    members: ids.map((id: string) => ({ user_id: id, name: names.get(id)?.name || "Student", username: null, picture: names.get(id)?.picture || null, college_verified: false })),
    balances: ids.map((id: string) => ({ user_id: id, name: names.get(id)?.name || "Student", amount_paise: balances[id] || 0 })),
    my_balance_paise: balances[viewerId] || 0,
    simplified, expenses: expenseRows.slice(0, 100),
    settlements: (settlements || []).map((s: any) => ({ settlement_id: s.id, group_id: circleId, from_user_id: s.from_user_id, to_user_id: s.to_user_id, amount_paise: Number(s.amount_paise), currency: "INR", note: s.note, created_by: s.created_by, created_at: s.settled_at, voided_at: null })),
    activity: (activity || []).map((a: any) => ({ activity_id: a.id, group_id: circleId, actor_id: a.actor_user_id, actor_name: names.get(a.actor_user_id)?.name || "Student", action: a.action, label: a.details?.label || a.action, metadata: a.details || {}, created_at: a.created_at })),
    month: { key: monthKey, total_paise: monthExpenses.reduce((n: number, e: any) => n + e.amount_paise, 0), categories },
  };
}
async function logActivity(circleId: string, actor: User, action: string, label: string, details: Record<string, unknown> = {}) {
  await db.from("unipool_circle_activity").insert({ circle_id: circleId, actor_user_id: actor.user_id, action, details: { ...details, label }, created_at: nowIso() });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const marker = "/unipool-shared";
  const idx = url.pathname.indexOf(marker);
  const path = idx >= 0 ? (url.pathname.slice(idx + marker.length) || "/") : url.pathname;
  try {
    if (path === "/health" && req.method === "GET") return json({ status: "ok", version: "supabase-1.0", circles_version: "2.0", personal_finance_version: "1.0", chat_version: "2.0" });
    const user = await authUser(req);

    if (path === "/expense-groups" && req.method === "POST") {
      const b = await body(req); const name = String(b.name || "").trim(); if (name.length < 2) return fail("Use at least 2 characters for the Circle name");
      const invite = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
      const ins = await db.from("unipool_circles").insert({ name, emoji: b.emoji || "💸", invite_code: invite, created_by: user.user_id, updated_at: nowIso() }).select("*").single();
      if (ins.error) throw ins.error; const circle = ins.data;
      const memberIds = [...new Set([user.user_id, ...((Array.isArray(b.member_ids) ? b.member_ids : []).map(String))])].slice(0, 40);
      await db.from("unipool_circle_members").insert(memberIds.map((id) => ({ circle_id: circle.id, user_id: id, role: id === user.user_id ? "admin" : "member" })));
      await logActivity(circle.id, user, "group_created", `created ${name}`);
      return json(await circlePayload(circle.id, user.user_id));
    }
    if (path === "/expense-groups" && req.method === "GET") {
      const { data: memberships } = await db.from("unipool_circle_members").select("circle_id").eq("user_id", user.user_id);
      const ids = (memberships || []).map((m: any) => m.circle_id); if (!ids.length) return json([]);
      const { data: circles } = await db.from("unipool_circles").select("*").in("id", ids).order("updated_at", { ascending: false });
      const out = [];
      for (const c of circles || []) { const p = await circlePayload(c.id, user.user_id); out.push({ ...p.group, my_balance_paise: p.my_balance_paise, member_count: p.members.length, expense_count: p.expenses.length }); }
      return json(out);
    }
    if (path === "/expense-groups/join" && req.method === "POST") {
      const b = await body(req); const code = String(b.invite_code || "").trim().toUpperCase();
      const { data: circle } = await db.from("unipool_circles").select("*").eq("invite_code", code).maybeSingle(); if (!circle) return fail("Invite code not found", 404);
      await db.from("unipool_circle_members").upsert({ circle_id: circle.id, user_id: user.user_id, role: "member" }, { onConflict: "circle_id,user_id", ignoreDuplicates: true });
      await db.from("unipool_circles").update({ updated_at: nowIso() }).eq("id", circle.id); await logActivity(circle.id, user, "member_joined", "joined the Circle");
      return json(await circlePayload(circle.id, user.user_id));
    }
    const groupMatch = path.match(/^\/expense-groups\/([^/]+)$/);
    if (groupMatch && req.method === "GET") return json(await circlePayload(groupMatch[1], user.user_id));
    const memberMatch = path.match(/^\/expense-groups\/([^/]+)\/members$/);
    if (memberMatch && req.method === "POST") {
      const { role } = await circleForMember(memberMatch[1], user.user_id); if (role !== "admin") return fail("Only a Circle admin can add members", 403);
      const b = await body(req); const target = String(b.user_id || ""); if (!target) return fail("Choose a student");
      await db.from("unipool_circle_members").upsert({ circle_id: memberMatch[1], user_id: target, role: "member" }, { onConflict: "circle_id,user_id", ignoreDuplicates: true });
      await db.from("unipool_circles").update({ updated_at: nowIso() }).eq("id", memberMatch[1]); await logActivity(memberMatch[1], user, "member_added", "added a student", { user_id: target });
      const names = await directoryMap([target]); return json({ ok: true, member: { user_id: target, name: names.get(target)?.name || "Student", picture: names.get(target)?.picture || null } });
    }
    const expenseMatch = path.match(/^\/expense-groups\/([^/]+)\/expenses$/);
    if (expenseMatch && req.method === "POST") {
      const circleId = expenseMatch[1]; await circleForMember(circleId, user.user_id); const b = await body(req);
      const amount = Number(b.amount_paise || 0); const splits = Array.isArray(b.splits) ? b.splits : []; if (amount <= 0 || splits.reduce((n: number, s: any) => n + Number(s.amount_paise || 0), 0) !== amount) return fail("Split amounts must add up exactly to the expense total");
      const { data: members } = await db.from("unipool_circle_members").select("user_id").eq("circle_id", circleId); const memberSet = new Set((members || []).map((m: any) => m.user_id));
      if (!memberSet.has(String(b.paid_by)) || splits.some((s: any) => !memberSet.has(String(s.user_id)))) return fail("Every payer and participant must be a Circle member");
      const ins = await db.from("unipool_circle_expenses").insert({ circle_id: circleId, description: String(b.description || "").trim(), category: String(b.category || "other").toLowerCase(), total_paise: amount, paid_by: String(b.paid_by), split_method: String(b.split_type || "equal"), created_by: user.user_id, notes: b.notes || null, occurred_at: nowIso(), updated_at: nowIso() }).select("*").single();
      if (ins.error) throw ins.error; await db.from("unipool_circle_splits").insert(splits.map((s: any) => ({ expense_id: ins.data.id, circle_id: circleId, user_id: String(s.user_id), share_paise: Number(s.amount_paise || 0) })));
      await db.from("unipool_circles").update({ updated_at: nowIso() }).eq("id", circleId); await logActivity(circleId, user, "expense_added", `added ${ins.data.description}`, { expense_id: ins.data.id, amount_paise: amount });
      return json({ expense_id: ins.data.id, group_id: circleId, description: ins.data.description, amount_paise: amount, currency: "INR", paid_by: ins.data.paid_by, splits, split_type: ins.data.split_method, category: ins.data.category, notes: ins.data.notes, created_by: user.user_id, created_at: ins.data.occurred_at, updated_at: ins.data.updated_at, deleted_at: null });
    }
    const deleteExpenseMatch = path.match(/^\/expense-groups\/([^/]+)\/expenses\/([^/]+)$/);
    if (deleteExpenseMatch && req.method === "DELETE") {
      const [_, circleId, expenseId] = deleteExpenseMatch; const { role } = await circleForMember(circleId, user.user_id);
      const { data: e } = await db.from("unipool_circle_expenses").select("*").eq("id", expenseId).eq("circle_id", circleId).is("deleted_at", null).maybeSingle(); if (!e) return fail("Expense not found", 404);
      if (e.created_by !== user.user_id && role !== "admin") return fail("Only the creator or a Circle admin can remove this expense", 403);
      await db.from("unipool_circle_expenses").update({ deleted_at: nowIso(), deleted_by: user.user_id, updated_at: nowIso() }).eq("id", expenseId); await logActivity(circleId, user, "expense_deleted", `removed ${e.description}`, { expense_id: expenseId }); return json({ ok: true });
    }
    const settlementMatch = path.match(/^\/expense-groups\/([^/]+)\/settlements$/);
    if (settlementMatch && req.method === "POST") {
      const circleId = settlementMatch[1]; const { role } = await circleForMember(circleId, user.user_id); const b = await body(req); const from = String(b.from_user_id || ""), to = String(b.to_user_id || ""), amount = Number(b.amount_paise || 0);
      if (!from || !to || from === to || amount <= 0) return fail("Choose two different Circle members and a valid amount"); if (user.user_id !== from && user.user_id !== to && role !== "admin") return fail("You can only record your own settlement unless you're a Circle admin", 403);
      const { data: ms } = await db.from("unipool_circle_members").select("user_id").eq("circle_id", circleId); const set = new Set((ms || []).map((x: any) => x.user_id)); if (!set.has(from) || !set.has(to)) return fail("Choose Circle members");
      const ins = await db.from("unipool_circle_settlements").insert({ circle_id: circleId, from_user_id: from, to_user_id: to, amount_paise: amount, created_by: user.user_id, note: b.note || null, settled_at: nowIso() }).select("*").single(); await logActivity(circleId, user, "settlement_added", "recorded a settlement", { amount_paise: amount });
      return json({ settlement_id: ins.data.id, group_id: circleId, from_user_id: from, to_user_id: to, amount_paise: amount, currency: "INR", note: b.note || null, created_by: user.user_id, created_at: ins.data.settled_at, voided_at: null });
    }
    if (path === "/expense-dashboard" && req.method === "GET") {
      const { data: memberships } = await db.from("unipool_circle_members").select("circle_id").eq("user_id", user.user_id); let owed = 0, owe = 0, spent = 0, paid = 0; const circles: any[] = [];
      for (const m of memberships || []) { const p = await circlePayload(m.circle_id, user.user_id); const mine = Number(p.my_balance_paise || 0); if (mine > 0) owed += mine; if (mine < 0) owe += -mine; const month = p.month.key; for (const e of p.expenses) if (String(e.created_at).slice(0,7) === month) { if (e.paid_by === user.user_id) paid += e.amount_paise; spent += (e.splits || []).filter((s:any)=>s.user_id===user.user_id).reduce((n:number,s:any)=>n+Number(s.amount_paise||0),0); } circles.push({ group_id: p.group.group_id, name: p.group.name, emoji: p.group.emoji, my_balance_paise: mine, member_count: p.members.length }); }
      return json({ month: new Date().toISOString().slice(0,7), spent_paise: spent, paid_paise: paid, owe_paise: owe, owed_to_me_paise: owed, net_paise: owed - owe, circles });
    }

    if (path === "/personal-transactions" && req.method === "POST") {
      const b = await body(req); const kind = String(b.kind || ""); const amount = Number(b.amount_paise || 0); const description = String(b.description || "").trim(); if (!["expense","income"].includes(kind) || amount <= 0 || !description) return fail("Check transaction details");
      const occurred = safeDate(b.occurred_at).toISOString(); const ins = await db.from("unipool_personal_transactions").insert({ user_id: user.user_id, kind, amount_paise: amount, description, category: String(b.category || "other").toLowerCase(), notes: b.notes || null, occurred_at: occurred, updated_at: nowIso() }).select("*").single(); if (ins.error) throw ins.error;
      return json({ transaction_id: ins.data.id, user_id: user.user_id, kind, amount_paise: amount, currency: "INR", description, category: ins.data.category, notes: ins.data.notes, occurred_at: occurred, created_at: ins.data.created_at, updated_at: ins.data.updated_at, deleted_at: null });
    }
    if (path === "/personal-transactions" && req.method === "GET") {
      const month = url.searchParams.get("month"); const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 100))); let q = db.from("unipool_personal_transactions").select("*").eq("user_id", user.user_id).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(limit);
      if (month) { const start = new Date(`${month}-01T00:00:00Z`); const end = new Date(start); end.setUTCMonth(end.getUTCMonth()+1); q = q.gte("occurred_at", start.toISOString()).lt("occurred_at", end.toISOString()); }
      const { data } = await q; return json((data || []).map((r:any)=>({ transaction_id:r.id,user_id:r.user_id,kind:r.kind,amount_paise:Number(r.amount_paise),currency:"INR",description:r.description,category:r.category,notes:r.notes,occurred_at:r.occurred_at,created_at:r.created_at,updated_at:r.updated_at,deleted_at:null })));
    }
    const txMatch = path.match(/^\/personal-transactions\/([^/]+)$/);
    if (txMatch && req.method === "PATCH") {
      const b = await body(req); const patch:any={updated_at:nowIso()}; for (const key of ["kind","description","category","notes","occurred_at"]) if (b[key] !== undefined) patch[key]=b[key]; if (b.amount_paise !== undefined) patch.amount_paise=Number(b.amount_paise); const upd=await db.from("unipool_personal_transactions").update(patch).eq("id",txMatch[1]).eq("user_id",user.user_id).is("deleted_at",null).select("*").maybeSingle(); if(!upd.data)return fail("Transaction not found",404); const r:any=upd.data; return json({transaction_id:r.id,user_id:r.user_id,kind:r.kind,amount_paise:Number(r.amount_paise),currency:"INR",description:r.description,category:r.category,notes:r.notes,occurred_at:r.occurred_at,created_at:r.created_at,updated_at:r.updated_at,deleted_at:null});
    }
    if (txMatch && req.method === "DELETE") { const upd=await db.from("unipool_personal_transactions").update({deleted_at:nowIso(),updated_at:nowIso()}).eq("id",txMatch[1]).eq("user_id",user.user_id).is("deleted_at",null).select("id").maybeSingle(); return upd.data?json({ok:true}):fail("Transaction not found",404); }
    if (path === "/personal-finance/dashboard" && req.method === "GET") {
      const month=url.searchParams.get("month")||new Date().toISOString().slice(0,7); const start=new Date(`${month}-01T00:00:00Z`); const end=new Date(start); end.setUTCMonth(end.getUTCMonth()+1); const {data}=await db.from("unipool_personal_transactions").select("*").eq("user_id",user.user_id).is("deleted_at",null).gte("occurred_at",start.toISOString()).lt("occurred_at",end.toISOString()).order("occurred_at",{ascending:false}); const rows=data||[]; let income=0,expense=0; const categories:Record<string,number>={}; for(const r of rows){if(r.kind==="income")income+=Number(r.amount_paise);else{expense+=Number(r.amount_paise);categories[r.category||"other"]=(categories[r.category||"other"]||0)+Number(r.amount_paise)}} return json({month,income_paise:income,expense_paise:expense,net_cashflow_paise:income-expense,categories,transactions:rows.slice(0,100).map((r:any)=>({transaction_id:r.id,user_id:r.user_id,kind:r.kind,amount_paise:Number(r.amount_paise),currency:"INR",description:r.description,category:r.category,notes:r.notes,occurred_at:r.occurred_at,created_at:r.created_at,updated_at:r.updated_at,deleted_at:null}))});
    }

    if (path === "/messages/conversations" && req.method === "GET") {
      const { data: memberships } = await db.from("unipool_conversation_members").select("conversation_id").eq("user_id", user.user_id); if (!(memberships || []).length) await importLegacyConversations(user);
      const { data: ms2 } = await db.from("unipool_conversation_members").select("conversation_id").eq("user_id", user.user_id); const ids=(ms2||[]).map((m:any)=>m.conversation_id); if(!ids.length)return json([]); const {data:convos}=await db.from("unipool_conversations").select("*").in("id",ids).order("updated_at",{ascending:false}); const result:any[]=[];
      for(const c of convos||[]){const {data:last}=await db.from("unipool_messages").select("*").eq("conversation_id",c.id).order("created_at",{ascending:false}).limit(1).maybeSingle(); if(c.kind==="direct"){const parts=String(c.direct_key).split("::");const other=parts[0]===user.user_id?parts[1]:parts[0];const names=await directoryMap([other]);const {count:unread}=await db.from("unipool_messages").select("id",{count:"exact",head:true}).eq("conversation_id",c.id).eq("to_user_id",user.user_id).is("read_at",null);const {data:p}=await db.from("unipool_presence").select("last_seen_at").eq("user_id",other).maybeSingle();result.push({kind:"direct",other_user_id:other,conversation_id:c.id,name:names.get(other)?.name||"Student",picture:names.get(other)?.picture||null,last_message:last?.text||"Start a conversation",last_at:last?.created_at||c.updated_at,unread:unread||0,online:p?Date.now()-new Date(p.last_seen_at).getTime()<60000:false});}else{const {count}=await db.from("unipool_conversation_members").select("user_id",{count:"exact",head:true}).eq("conversation_id",c.id);result.push({kind:"group",conversation_id:c.id,name:c.name||"Trip chat",last_message:last?.text||"Trip chat ready",last_at:last?.created_at||c.updated_at,unread:0,members_count:count||1});}}
      return json(result.sort((a,b)=>new Date(b.last_at).getTime()-new Date(a.last_at).getTime()));
    }
    if (path === "/messages" && req.method === "POST") {
      const b=await body(req);const to=String(b.to_user_id||"");const text=String(b.text||"").trim();if(!to||!text)return fail("Message cannot be empty");if(to===user.user_id)return fail("You can't message yourself");const c=await ensureDirectConversation(user.user_id,to);const ins=await db.from("unipool_messages").insert({conversation_id:c.id,from_user_id:user.user_id,to_user_id:to,pool_id:b.pool_id||null,text:text.slice(0,2000),created_at:nowIso()}).select("*").single();await db.from("unipool_conversations").update({updated_at:ins.data.created_at}).eq("id",c.id);return json({message_id:ins.data.id,from_user_id:user.user_id,to_user_id:to,pool_id:ins.data.pool_id,text:ins.data.text,created_at:ins.data.created_at,read:false});
    }
    if (path === "/messages/typing" && req.method === "POST") {const b=await body(req);const to=String(b.to_user_id||"");if(to)await db.from("unipool_typing_state").upsert({from_user_id:user.user_id,to_user_id:to,expires_at:new Date(Date.now()+5000).toISOString()});return json({ok:true});}
    const typingMatch=path.match(/^\/messages\/typing\/([^/]+)$/);if(typingMatch&&req.method==="GET"){const {data}=await db.from("unipool_typing_state").select("expires_at").eq("from_user_id",typingMatch[1]).eq("to_user_id",user.user_id).maybeSingle();return json({typing:Boolean(data&&new Date(data.expires_at).getTime()>Date.now())});}
    const directMatch=path.match(/^\/messages\/([^/]+)$/);if(directMatch&&req.method==="GET"){const other=directMatch[1];const c=await ensureDirectConversation(user.user_id,other);const {count}=await db.from("unipool_messages").select("id",{count:"exact",head:true}).eq("conversation_id",c.id);if(!count)await importLegacyThread(user,other,c.id);await db.from("unipool_messages").update({read_at:nowIso()}).eq("conversation_id",c.id).eq("to_user_id",user.user_id).is("read_at",null);await db.from("unipool_conversation_members").update({last_read_at:nowIso()}).eq("conversation_id",c.id).eq("user_id",user.user_id);const {data}=await db.from("unipool_messages").select("*").eq("conversation_id",c.id).order("created_at",{ascending:true}).limit(1000);return json((data||[]).map((m:any)=>({message_id:m.legacy_message_id||m.id,from_user_id:m.from_user_id,to_user_id:m.to_user_id,pool_id:m.pool_id,text:m.text,created_at:m.created_at,read:Boolean(m.read_at)})));}
    const presenceMatch=path.match(/^\/users\/([^/]+)\/presence$/);if(presenceMatch&&req.method==="GET"){const {data}=await db.from("unipool_presence").select("last_seen_at").eq("user_id",presenceMatch[1]).maybeSingle();return json({online:Boolean(data&&Date.now()-new Date(data.last_seen_at).getTime()<60000),last_seen:data?.last_seen_at||null});}

    const ensureMatch=path.match(/^\/messages\/trip\/ensure\/([^/]+)$/);if(ensureMatch&&req.method==="POST"){const poolId=ensureMatch[1];let {data:c}=await db.from("unipool_conversations").select("*").eq("pool_id",poolId).maybeSingle();if(!c){const rp=await renderFetch(`/api/pools/${encodeURIComponent(poolId)}`,user.token);if(!rp?.ok)return fail("Trip details are temporarily unavailable",503);const pool=await rp.json();const confirmed=(pool.confirmed_travelers||[]).map((t:any)=>t.user_id);const allowed=pool.user_id===user.user_id||confirmed.includes(user.user_id);if(!allowed)return fail("Join the trip before opening its group chat",403);const name=`${pool.from_location||"From"} → ${pool.to_location||"To"}`;const ins=await db.from("unipool_conversations").insert({kind:"group",pool_id:poolId,name,updated_at:nowIso()}).select("*").single();c=ins.data;const members=[pool.user_id,...confirmed,user.user_id].filter(Boolean);await db.from("unipool_conversation_members").upsert([...new Set(members)].map((id)=>({conversation_id:c.id,user_id:id})),{onConflict:"conversation_id,user_id"});for(const t of pool.confirmed_travelers||[])if(t.user_id&&t.name)await db.from("unipool_user_directory").upsert({user_id:t.user_id,name:t.name,email:t.email||null,updated_at:nowIso()});if(pool.user_id&&pool.user_name)await db.from("unipool_user_directory").upsert({user_id:pool.user_id,name:pool.user_name,email:pool.user_email||null,updated_at:nowIso()});}const {data:member}=await db.from("unipool_conversation_members").select("user_id").eq("conversation_id",c.id).eq("user_id",user.user_id).maybeSingle();if(!member)return fail("You're not in this trip chat",403);return json({conversation_id:c.id,name:c.name||"Trip chat"});}
    const groupMatch2=path.match(/^\/messages\/group\/([^/]+)$/);if(groupMatch2&&req.method==="GET"){const cid=groupMatch2[1];const {data:member}=await db.from("unipool_conversation_members").select("*").eq("conversation_id",cid).eq("user_id",user.user_id).maybeSingle();if(!member)return fail("Trip chat not found",404);const {data:c}=await db.from("unipool_conversations").select("*").eq("id",cid).single();const {data:members}=await db.from("unipool_conversation_members").select("*").eq("conversation_id",cid);const ids=(members||[]).map((m:any)=>m.user_id);const names=await directoryMap(ids);const readMap=new Map((members||[]).map((m:any)=>[m.user_id,m.last_read_at]));const {data:msgs}=await db.from("unipool_messages").select("*").eq("conversation_id",cid).order("created_at",{ascending:true}).limit(1000);await db.from("unipool_conversation_members").update({last_read_at:nowIso()}).eq("conversation_id",cid).eq("user_id",user.user_id);return json({conversation_id:cid,name:c.name||"Trip chat",members:ids.map((id:string)=>({user_id:id,name:names.get(id)?.name||"Student"})),messages:(msgs||[]).map((m:any)=>({message_id:m.legacy_message_id||m.id,from_user_id:m.from_user_id,text:m.text,created_at:m.created_at,read_by:ids.filter((id:string)=>{const t=readMap.get(id);return t&&new Date(t).getTime()>=new Date(m.created_at).getTime();})}))});}
    if(groupMatch2&&req.method==="POST"){const cid=groupMatch2[1];const {data:member}=await db.from("unipool_conversation_members").select("*").eq("conversation_id",cid).eq("user_id",user.user_id).maybeSingle();if(!member)return fail("Trip chat not found",404);const b=await body(req);const text=String(b.text||"").trim();if(!text)return fail("Message cannot be empty");const {data:c}=await db.from("unipool_conversations").select("*").eq("id",cid).single();const ins=await db.from("unipool_messages").insert({conversation_id:cid,from_user_id:user.user_id,pool_id:c.pool_id||null,text:text.slice(0,2000),created_at:nowIso()}).select("*").single();await db.from("unipool_conversations").update({updated_at:ins.data.created_at}).eq("id",cid);await db.from("unipool_conversation_members").update({last_read_at:ins.data.created_at}).eq("conversation_id",cid).eq("user_id",user.user_id);return json({message_id:ins.data.id,from_user_id:user.user_id,text:ins.data.text,created_at:ins.data.created_at,read_by:[user.user_id]});}

    return fail("Not Found", 404);
  } catch (e: any) {
    console.error(e);
    return fail(e?.detail || e?.message || "Unexpected error", Number(e?.status || 500));
  }
});
