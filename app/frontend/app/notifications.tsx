import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { notificationInbox } from "@/src/notifications/inbox";
import { notificationDestination } from "@/src/notifications/routes";
import { peopleApi } from "@/src/api/people";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";

type Note = {
  notification_id: string;
  title: string;
  body: string;
  category?: string;
  type?: string;
  action_url?: string;
  read_at?: string | null;
  created_at: string;
  source?: "supabase" | "legacy";
  metadata?: Record<string, any> | null;
};

type FilterKey = "all" | "action" | "trips" | "money" | "social" | "safety" | "games";
const FILTERS: { key: FilterKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "all", label: "All", icon: "apps-outline" },
  { key: "action", label: "Needs action", icon: "alert-circle-outline" },
  { key: "trips", label: "Trips", icon: "navigate-outline" },
  { key: "money", label: "Money", icon: "wallet-outline" },
  { key: "social", label: "Social", icon: "people-outline" },
  { key: "safety", label: "Safety", icon: "shield-checkmark-outline" },
  { key: "games", label: "Games", icon: "game-controller-outline" },
];

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  match: "people-outline",
  request: "person-add-outline",
  trip: "navigate-outline",
  chat: "chatbubble-outline",
  saved_route: "notifications-outline",
  rating: "star-outline",
  digest: "calendar-outline",
  games: "game-controller-outline",
  circle: "wallet-outline",
  people: "people-circle-outline",
  safety: "shield-checkmark-outline",
  general: "information-circle-outline",
};

function categoryFor(type?: string) {
  const value = String(type || "general").toLowerCase();
  if (value.includes("safety") || value.includes("report") || value.includes("restrict") || value.includes("block") || value.includes("trusted")) return "safety";
  if (value.includes("route")) return "saved_route";
  if (value.includes("trip") || value.includes("journey") || value.includes("waitlist")) return "trip";
  if (value.includes("chat") || value.includes("message")) return "chat";
  if (value.includes("request")) return "request";
  if (value.includes("match")) return "match";
  if (value.includes("rating") || value.includes("feedback")) return "rating";
  if (value.includes("game") || value.includes("streak")) return "games";
  if (value.includes("circle") || value.includes("expense") || value.includes("settle") || value.includes("payment")) return "circle";
  if (value.includes("people") || value.includes("contact") || value.includes("invite")) return "people";
  return value in ICONS ? value : "general";
}

function needsAction(note: Note) {
  return !note.read_at && note.category === "request" && (/new ride request|wants to travel|join request/i.test(`${note.title || ""} ${note.body || ""}`) || note.action_url === "/my-trips");
}

function belongs(note: Note, filter: FilterKey) {
  const category = note.category || "general";
  if (filter === "all") return true;
  if (filter === "action") return needsAction(note);
  if (filter === "trips") return ["trip", "match", "request", "saved_route", "rating"].includes(category);
  if (filter === "money") return category === "circle";
  if (filter === "social") return ["chat", "people"].includes(category);
  if (filter === "safety") return category === "safety";
  if (filter === "games") return category === "games";
  return true;
}

function relativeTime(value: string) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const loaded = useRef(false);
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet && !loaded.current) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [peopleResult, legacyResult] = await Promise.allSettled([
        peopleApi.notifications(80), api.notifications(false, 80),
      ]);
      if (peopleResult.status === "rejected" && legacyResult.status === "rejected") {
        throw peopleResult.reason || legacyResult.reason;
      }
      const rows = peopleResult.status === "fulfilled" ? peopleResult.value : [];
      const travel = legacyResult.status === "fulfilled" ? legacyResult.value : { items: [], unread: 0 };
      const fromPeople: Note[] = (rows || []).map((note) => ({
        notification_id: note.id, title: note.title, body: note.body,
        category: categoryFor(note.type), type: note.type,
        action_url: note.route || undefined, metadata: note.metadata || null,
        read_at: note.read_at, created_at: note.created_at, source: "supabase",
      }));
      const fromTravel: Note[] = (travel.items || []).map((note: any) => ({
        notification_id: note.notification_id,
        title: note.title, body: note.body,
        category: categoryFor(note.category), type: note.category,
        action_url: note.action_url || undefined, metadata: note.data || note.metadata || null,
        read_at: note.read_at, created_at: note.created_at, source: "legacy",
      }));
      const all = [...fromPeople, ...fromTravel].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(all);
      const count = all.filter((note) => !note.read_at).length;
      setUnread(count);
      notificationInbox.setUnread(count);
      if (peopleResult.status === "rejected" || legacyResult.status === "rejected") {
        setError("One notification service is unavailable; some updates may be missing.");
      }
      loaded.current = true;
    } catch (e: any) {
      setError(e?.message || "Couldn't refresh notifications.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(loaded.current); }, [load]));

  const open = async (note: Note) => {
    if (!note.read_at) {
      setItems((prev) => prev.map((n) => n.notification_id === note.notification_id ? { ...n, read_at: new Date().toISOString() } : n));
      setUnread((n) => Math.max(0, n - 1));
      notificationInbox.setUnread(Math.max(0, unread - 1));
      try {
        if (note.source === "legacy") await api.readNotification(note.notification_id);
        else await peopleApi.readNotification(note.notification_id);
      } catch (e: any) {
        setItems((prev) => prev.map((n) => n.notification_id === note.notification_id ? { ...n, read_at: note.read_at } : n));
        setUnread((n) => n + 1);
        notificationInbox.setUnread(unread);
        setError(e?.message || "Couldn't mark notification as read.");
      }
    }
    router.push(notificationDestination(note) as any);
  };

  const readAll = async () => {
    if (markingAll) return;
    const previous = items;
    const previousUnread = unread;
    setMarkingAll(true);
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnread(0);
    notificationInbox.setUnread(0);
    try {
      await Promise.all([
        items.some((note) => note.source === "legacy") ? api.readAllNotifications() : Promise.resolve(),
        items.some((note) => note.source === "supabase") ? peopleApi.readAllNotifications() : Promise.resolve(),
      ]);
    } catch (e: any) { setItems(previous); setUnread(previousUnread); notificationInbox.setUnread(previousUnread); setError(e?.message || "Couldn't mark notifications as read."); }
    finally { setMarkingAll(false); }
  };

  const visible = items.filter((note) => belongs(note, filter)).sort((a, b) => Number(needsAction(b)) - Number(needsAction(a)) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const filteredUnread = visible.filter((note) => !note.read_at).length;

  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back"><Ionicons name="chevron-back" size={21} color={colors.onSurface} /></Pressable>
      <View style={{ flex: 1 }}><Text style={styles.eyebrow}>UPDATES</Text><Text style={styles.title}>Notifications</Text></View>
      {unread > 0 ? <Pressable onPress={readAll} disabled={markingAll} style={styles.readAll}><Text style={styles.readAllText}>Mark all read</Text></Pressable> : null}
    </View>

    {loading ? <View style={styles.center}><ActivityIndicator color={colors.indigo} /><Text style={styles.muted}>Loading your updates…</Text></View> : <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.indigo} />}
    >
      {error ? <Pressable onPress={() => load(true)} style={styles.errorCard}><Ionicons name="refresh" size={19} color={colors.indigo} /><Text style={styles.errorText}>{error} Tap to retry.</Text></Pressable> : null}
      <View style={styles.summary}>
        <View><Text style={styles.summaryNum}>{filter === "all" ? unread : filteredUnread}</Text><Text style={styles.summaryLabel}>{filter === "all" ? "unread" : `unread ${filter}`}</Text></View>
        <Text style={styles.summaryCopy}>Ride requests and trip updates from both notification services appear together.</Text>
      </View>
      <Pressable onPress={() => router.push("/my-trips" as any)} style={[styles.note, { marginBottom: 12 }]}><Ionicons name="albums-outline" size={20} color={colors.indigo} /><View style={{ flex: 1 }}><Text style={styles.noteTitle}>My Trips</Text><Text style={styles.noteBody}>Review incoming ride requests and confirmed seats.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.indigo} /></Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{FILTERS.map((item) => <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.filter, filter === item.key && styles.filterActive]}><Ionicons name={item.icon} size={14} color={filter === item.key ? "#fff" : colors.indigo} /><Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text></Pressable>)}</ScrollView>
      {visible.length === 0 ? <View style={styles.empty}><Ionicons name="notifications-off-outline" size={32} color={colors.muted} /><Text style={styles.emptyTitle}>{items.length ? `No ${filter} updates` : "You're caught up"}</Text><Text style={styles.muted}>{items.length ? "Try another filter or check back after new UniPool activity." : "New UniPool activity will appear here."}</Text></View> : <View style={styles.stack}>
        {visible.map((note) => {
          const unreadNote = !note.read_at;
          const category = note.category || "general";
          return <Pressable key={note.notification_id} onPress={() => open(note)} style={({ pressed }) => [styles.note, unreadNote && styles.noteUnread, pressed && { opacity: .76 }]}>
            <View style={styles.iconWrap}><Ionicons name={ICONS[category] || ICONS.general} size={19} color={unreadNote ? colors.indigo : colors.muted} /></View>
            <View style={{ flex: 1 }}>
              <View style={styles.noteTop}><Text style={styles.noteTitle}>{note.title}</Text><Text style={styles.time}>{relativeTime(note.created_at)}</Text></View>
              <Text style={styles.noteBody}>{note.body}</Text>
            </View>
            {unreadNote ? <View style={styles.dot} /> : null}
          </Pressable>;
        })}
      </View>}
    </ScrollView>}
  </SafeAreaView>;
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: SPACING.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.saffron, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  title: { color: colors.onSurface, fontSize: 20, fontWeight: "900", fontFamily: FONT_DISPLAY, marginTop: 2 },
  readAll: { minHeight: 38, justifyContent: "center", paddingHorizontal: 11 },
  readAllText: { color: colors.indigo, fontSize: 11, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  content: { width: "100%", maxWidth: 820, alignSelf: "center", padding: SPACING.lg, paddingBottom: 120 },
  summary: { flexDirection: "row", alignItems: "center", gap: 16, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 15, marginBottom: 10 },
  summaryNum: { color: colors.onSurface, fontSize: 26, fontWeight: "900" },
  summaryLabel: { color: colors.muted, fontSize: 9, fontWeight: "800" },
  summaryCopy: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
  filters: { gap: 7, paddingVertical: 4, marginBottom: 12 }, filter: { minHeight: 34, paddingHorizontal: 11, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, flexDirection: "row", alignItems: "center", gap: 5 }, filterActive: { backgroundColor: colors.indigo, borderColor: colors.indigo }, filterText: { color: colors.onSurface, fontSize: 9, fontWeight: "900" }, filterTextActive: { color: "#fff" },
  errorCard: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: RADIUS.md, backgroundColor: colors.surface2, padding: 11, marginBottom: 12 },
  errorText: { color: colors.onSurface, fontSize: 11, fontWeight: "700" },
  stack: { gap: 8 },
  note: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 11, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 12 },
  noteUnread: { backgroundColor: colors.surface2, borderColor: colors.indigo },
  iconWrap: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  noteTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  noteTitle: { flex: 1, color: colors.onSurface, fontSize: 12, fontWeight: "900" },
  time: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  noteBody: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.indigo },
  empty: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: 7 },
  emptyTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "900" },
  muted: { color: colors.muted, fontSize: 11 },
});
