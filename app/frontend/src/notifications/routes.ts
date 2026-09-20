type RoutableNotification = {
  category?: string;
  type?: string;
  title?: string;
  action_url?: string | null;
  route?: string | null;
  metadata?: Record<string, any> | null;
};

/** Respect a specific trip/group route before using generic sender or inbox fallbacks. */
export function notificationDestination(note: RoutableNotification): string {
  const raw = note.action_url || note.route || "";
  const route = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  const category = String(note.category || note.type || "").toLowerCase();
  const isChat = /chat|message/.test(category);
  const poolId = note.metadata?.pool_id;
  const sender = note.metadata?.sender_id || note.metadata?.sender_user_id;

  if (isChat) {
    if (route.startsWith("/chat/")) return route;
    if (sender) return `/chat/${encodeURIComponent(String(sender))}`;
    return route || "/messages";
  }
  if (category.includes("request") && /new ride request/i.test(note.title || "")) return "/my-trips";
  if (route) return route;
  if (poolId) return `/pool/${encodeURIComponent(String(poolId))}`;
  return "/notifications";
}
