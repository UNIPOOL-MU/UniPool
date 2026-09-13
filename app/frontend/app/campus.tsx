import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { CampusHome, peopleApi } from "@/src/api/people";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";

const money = (paise = 0) => `${paise < 0 ? "−" : ""}₹${Math.abs(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function CampusHomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [home, setHome] = useState<CampusHome | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [nextTrip, setNextTrip] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const [h, e, trips] = await Promise.allSettled([peopleApi.campusHome(), peopleApi.campusEvents(), api.upcomingJourneys()]);
      if (h.status === "fulfilled") setHome(h.value);
      if (e.status === "fulfilled") setEvents(e.value || []);
      if (trips.status === "fulfilled") {
        const rows = Array.isArray(trips.value) ? trips.value : [];
        const sorted = [...rows].sort((a, b) => new Date(a.travel_datetime).getTime() - new Date(b.travel_datetime).getTime());
        setNextTrip(sorted[0] || null);
      }
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rsvp = async (event: any, status: "going" | "interested") => {
    setEvents((rows) => rows.map((e) => e.id === event.id ? { ...e, my_rsvp: status } : e));
    try { await peopleApi.rsvpCampusEvent(event.id, status); await load(true); } catch { await load(true); }
  };

  if (loading && !home) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.indigo} /><Text style={styles.muted}>Opening Campus Home…</Text></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.indigo} />}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={styles.eyebrow}>CAMPUS HOME</Text><Text style={styles.title}>Useful even without a ride</Text><Text style={styles.sub}>Your next ride, people, money, Circle activity, saved routes, events and Time-pass in one calm dashboard.</Text></View></View>

    {nextTrip ? <View style={styles.tripHero}><View style={styles.tripIcon}><Ionicons name="navigate" size={21} color={colors.indigo} /></View><View style={{ flex: 1 }}><Text style={styles.eyebrow}>NEXT RIDE</Text><Text style={styles.tripRoute}>{nextTrip.from_location} → {nextTrip.to_location}</Text><Text style={styles.muted}>{when(nextTrip.travel_datetime)}</Text></View><View style={styles.tripActions}><Pressable onPress={() => router.push(`/pool/${nextTrip.pool_id}` as any)} style={styles.outlineBtn}><Text style={styles.outlineText}>Details</Text></Pressable><Pressable onPress={() => router.push(`/trip-live/${nextTrip.pool_id}` as any)} style={styles.tripLiveBtn}><Ionicons name="radio-outline" size={15} color="#fff" /><Text style={styles.tripLiveText}>Coordinate</Text></Pressable></View></View> : null}

    <View style={styles.grid}>
      <Tile icon="people-outline" label="Saved people" value={String(home?.saved_people || 0)} onPress={() => router.push("/people" as any)} colors={colors} styles={styles} />
      <Tile icon="wallet-outline" label="Circles" value={String(home?.circles || 0)} onPress={() => router.push("/circles" as any)} colors={colors} styles={styles} />
      <Tile icon="stats-chart-outline" label="Month cashflow" value={money(home?.net_cashflow_paise || 0)} onPress={() => router.push("/circles/personal" as any)} colors={colors} styles={styles} />
      <Tile icon="game-controller-outline" label="Time-pass" value={`Lv ${home?.level || 1} · ${home?.total_xp || 0} XP`} onPress={() => router.push("/(tabs)/games" as any)} colors={colors} styles={styles} />
      <Tile icon="notifications-outline" label="Unread" value={String(home?.unread_notifications || 0)} onPress={() => router.push("/notifications" as any)} colors={colors} styles={styles} />
      <Tile icon="bookmark-outline" label="Saved routes" value={String(home?.saved_routes || 0)} onPress={() => router.push("/(tabs)/index" as any)} colors={colors} styles={styles} />
    </View>

    <View style={styles.quickTools}><Pressable onPress={() => router.push("/circle-tools" as any)} style={styles.tool}><Ionicons name="people-circle-outline" size={19} color={colors.saffron} /><View style={{ flex: 1 }}><Text style={styles.eventTitle}>Circle coordination</Text><Text style={styles.muted}>Recurring bills, reminders, polls, comments and shared rides.</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted} /></Pressable><Pressable onPress={() => router.push("/safety" as any)} style={styles.tool}><Ionicons name="shield-checkmark-outline" size={19} color={colors.indigo} /><View style={{ flex: 1 }}><Text style={styles.eventTitle}>Trusted contacts</Text><Text style={styles.muted}>{home?.trusted_contacts || 0} saved · trip sharing stays opt-in.</Text></View><Ionicons name="chevron-forward" size={17} color={colors.muted} /></Pressable></View>

    <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Campus moments</Text><Text style={styles.muted}>Events can become temporary travel hubs around festivals, exams and semester breaks.</Text></View></View>
    {events.length ? <View style={styles.stack}>{events.map((event) => <View key={event.id} style={styles.eventCard}><View style={styles.eventTop}><View style={styles.eventIcon}><Ionicons name="calendar-outline" size={19} color={colors.saffron} /></View><View style={{ flex: 1 }}><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.muted}>{when(event.starts_at)}{event.location ? ` · ${event.location}` : ""}</Text></View></View>{event.description ? <Text style={styles.eventBody}>{event.description}</Text> : null}<View style={styles.eventBottom}><Text style={styles.counts}>{event.counts?.going || 0} going · {event.counts?.interested || 0} interested</Text><View style={styles.actions}><Pressable onPress={() => rsvp(event, "interested")} style={[styles.chip, event.my_rsvp === "interested" && styles.chipActive]}><Text style={[styles.chipText, event.my_rsvp === "interested" && styles.chipTextActive]}>Interested</Text></Pressable><Pressable onPress={() => rsvp(event, "going")} style={[styles.chip, event.my_rsvp === "going" && styles.chipActive]}><Text style={[styles.chipText, event.my_rsvp === "going" && styles.chipTextActive]}>Going</Text></Pressable></View></View></View>)}</View> : <View style={styles.empty}><Ionicons name="calendar-clear-outline" size={28} color={colors.indigo} /><Text style={styles.emptyTitle}>No active campus events</Text><Text style={styles.muted}>When a university travel moment is published, it will show here.</Text></View>}

    <View style={styles.safety}><Ionicons name="shield-checkmark-outline" size={20} color={colors.saffron} /><View style={{ flex: 1 }}><Text style={styles.eventTitle}>Safety shortcut</Text><Text style={styles.muted}>{home?.trusted_contacts || 0} trusted contact{home?.trusted_contacts === 1 ? "" : "s"} saved.</Text></View><Pressable onPress={() => router.push("/safety" as any)}><Text style={styles.link}>Manage</Text></Pressable></View>
  </ScrollView></SafeAreaView>;
}

function Tile({ icon, label, value, onPress, colors, styles }: any) { return <Pressable onPress={onPress} style={styles.tile}><View style={styles.tileIcon}><Ionicons name={icon} size={18} color={colors.indigo} /></View><Text style={styles.tileValue}>{value}</Text><Text style={styles.tileLabel}>{label}</Text></Pressable>; }

const makeStyles = (c: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.surface }, page: { width: "100%", maxWidth: 980, alignSelf: "center", padding: SPACING.lg, paddingBottom: 130 }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  header: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 20 }, back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.border }, eyebrow: { color: c.saffron, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 }, title: { color: c.onSurface, fontFamily: FONT_DISPLAY, fontSize: 29, fontWeight: "900", marginTop: 3 }, sub: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 4, maxWidth: 700 }, muted: { color: c.muted, fontSize: 10, lineHeight: 15 },
  tripHero: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 11, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.indigo, backgroundColor: c.card, padding: 14, marginBottom: 12 }, tripIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, tripRoute: { color: c.onSurface, fontSize: 14, fontWeight: "900", marginVertical: 2 }, tripActions: { flexDirection: "row", gap: 6 }, outlineBtn: { minHeight: 36, paddingHorizontal: 11, borderRadius: 18, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }, outlineText: { color: c.indigo, fontSize: 9, fontWeight: "900" }, tripLiveBtn: { minHeight: 36, paddingHorizontal: 11, borderRadius: 18, backgroundColor: c.indigo, flexDirection: "row", alignItems: "center", gap: 5 }, tripLiveText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 }, tile: { flexGrow: 1, flexBasis: 210, minHeight: 116, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 14, justifyContent: "space-between" }, tileIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.surface2 }, tileValue: { color: c.onSurface, fontSize: 20, fontWeight: "900" }, tileLabel: { color: c.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase" },
  quickTools: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 26 }, tool: { flexGrow: 1, flexShrink: 1, minWidth: 0, flexBasis: 300, minHeight: 72, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, flexDirection: "row", alignItems: "center", gap: 9, padding: 12 }, sectionHead: { marginBottom: 10 }, sectionTitle: { color: c.onSurface, fontSize: 18, fontWeight: "900" }, stack: { gap: 9 }, eventCard: { borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 14 }, eventTop: { flexDirection: "row", alignItems: "center", gap: 10 }, eventIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, eventTitle: { color: c.onSurface, fontSize: 12, fontWeight: "900" }, eventBody: { color: c.onSurface, fontSize: 11, lineHeight: 17, marginTop: 10 }, eventBottom: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }, counts: { color: c.muted, fontSize: 9, fontWeight: "800" }, actions: { flexDirection: "row", gap: 6 }, chip: { minHeight: 32, paddingHorizontal: 11, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border }, chipActive: { backgroundColor: c.indigo, borderColor: c.indigo }, chipText: { color: c.onSurface, fontSize: 9, fontWeight: "900" }, chipTextActive: { color: "#fff" }, empty: { minHeight: 170, alignItems: "center", justifyContent: "center", gap: 7, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card }, emptyTitle: { color: c.onSurface, fontSize: 14, fontWeight: "900" }, safety: { marginTop: 22, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, padding: 14 }, link: { color: c.indigo, fontSize: 10, fontWeight: "900" },
});
