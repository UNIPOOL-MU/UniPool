import React, { useEffect, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useAuth } from "@/src/auth/AuthContext";
import { peopleApi, PeopleNotification } from "@/src/api/people";
import { notificationInbox } from "@/src/notifications/inbox";
import { useTheme } from "@/src/theme_context/ThemeContext";

export default function MessageAlerts() {
  const { user } = useAuth(); const { colors } = useTheme();
  const pathname = usePathname(); const router = useRouter();
  const [message, setMessage] = useState<PeopleNotification | null>(null);
  useEffect(() => {
    if (!user) { notificationInbox.publish([]); setMessage(null); return; }
    setMessage(null);
    let alive = true, busy = false; let seen: Set<string> | null = null;
    async function refresh() {
      if (busy) return; busy = true;
      try {
        const items = await peopleApi.notifications(100);
        if (!alive) return;
        notificationInbox.publish(items);
        const incoming = seen ? items.filter(item => item.type === "message" && !item.read_at && !seen!.has(item.id)) : [];
        seen = new Set(items.map(item => item.id));
        for (const item of incoming.reverse()) {
          if (item.route?.split("?")[0] === pathname) { await peopleApi.readNotification(item.id); continue; }
          setMessage(item);
          if (Platform.OS === "web" && typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              const registration = await navigator.serviceWorker?.getRegistration() || await navigator.serviceWorker?.register("/sw.js");
              if (registration) await registration.showNotification(item.title, { body: item.body, tag: item.id, data: { url: item.route || "/notifications" } });
            } catch {}
          }
        }
      } catch {} finally { busy = false; }
    }
    refresh(); const timer = setInterval(refresh, 5000);
    const visible = () => refresh();
    if (Platform.OS === "web") document.addEventListener("visibilitychange", visible);
    return () => { alive = false; clearInterval(timer); if (Platform.OS === "web") document.removeEventListener("visibilitychange", visible); };
  }, [user?.user_id, pathname]);
  if (!message) return null;
  return <View style={{ position: "absolute", top: 72, left: 16, right: 16, maxWidth: 480, alignSelf: "center", backgroundColor: colors.card, borderColor: colors.indigo, borderWidth: 1, borderRadius: 16, padding: 14, zIndex: 1000, flexDirection: "row", gap: 12 }}>
    <Pressable accessibilityLabel="Open new message" onPress={() => { router.push((message.route || "/notifications") as any); setMessage(null); }} style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.onSurface, fontWeight: "800" }}>{message.title}</Text><Text numberOfLines={2} style={{ color: colors.muted }}>{message.body}</Text></Pressable>
    <Pressable accessibilityLabel="Dismiss message notification" onPress={() => setMessage(null)} style={{ minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "center" }}><Text style={{ color: colors.indigo }}>✕</Text></Pressable>
  </View>;
}
