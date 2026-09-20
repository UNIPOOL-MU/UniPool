import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { SPACING, RADIUS, FONT_DISPLAY } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { api } from "@/src/api/client";

type Journey = { pool_id: string; from_location: string; to_location: string; travel_datetime: string; phase?: string; countdown_minutes?: number; is_owner?: boolean; seats?: { total: number; occupied: number; available: number }; meeting_point?: { label?: string } | null; fare?: { amount?: number; currency?: string; per_person?: number } | null };
type SavedRoute = { saved_route_id: string; label: string; from_location: string; to_location: string; alerts_enabled: boolean; active_rides?: number };
type RecurringRoute = { template_id: string; from_location: string; to_location: string; weekday: number; hour: number; minute: number; active: boolean };
type RouteInsight = { route_key: string; from_location: string; to_location: string; trips_120d: number; peak_hour?: number | null };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const timeLabel = (hour: number, minute = 0) => { const d = new Date(); d.setHours(hour, minute, 0, 0); return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); };
const phaseLabel = (value?: string) => (value || "planning").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function normalizeJourney(pool: any, currentUserId?: string): Journey | null {
  if (!pool?.pool_id || !pool?.travel_datetime) return null;
  const confirmed = Array.isArray(pool.confirmed_travelers) ? pool.confirmed_travelers : [];
  const occupied = 1 + confirmed.length;
  const total = Number(pool.total_seats || pool.seats?.total || Math.max(4, occupied));
  return {
    pool_id: pool.pool_id,
    from_location: pool.from_location || "From",
    to_location: pool.to_location || "To",
    travel_datetime: pool.travel_datetime,
    phase: pool.trip_state || pool.phase || "planning",
    is_owner: Boolean(currentUserId && pool.user_id === currentUserId),
    seats: pool.seats || { total, occupied, available: Math.max(0, total - occupied) },
    meeting_point: pool.meeting_point || null,
    fare: pool.fare || null,
  };
}

export default function ExploreScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const loadedOnce = useRef(false);
  const [loading, setLoading] = useState(true);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [saved, setSaved] = useState<SavedRoute[]>([]);
  const [recurring, setRecurring] = useState<RecurringRoute[]>([]);
  const [insights, setInsights] = useState<RouteInsight[]>([]);
  const [availability, setAvailability] = useState({ journeys: true, saved: true, recurring: true, insights: true });
  const [showSave, setShowSave] = useState(false);
  const [saveFrom, setSaveFrom] = useState("Mahindra University");
  const [saveTo, setSaveTo] = useState("Rajiv Gandhi International Airport");
  const [savingRoute, setSavingRoute] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [repeatFrom, setRepeatFrom] = useState("Mahindra University");
  const [repeatTo, setRepeatTo] = useState("Rajiv Gandhi International Airport");
  const [weekday, setWeekday] = useState(4);
  const [repeatTime, setRepeatTime] = useState("18:00");
  const [savingRepeat, setSavingRepeat] = useState(false);

  const load = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    const results = await Promise.allSettled([
      api.upcomingJourneys(), api.savedRoutes(), api.recurringRoutes(), api.routeInsights(), api.myPools(), api.confirmedMatches(),
    ]);
    const fulfilled = (i: number) => results[i].status === "fulfilled" ? (results[i] as PromiseFulfilledResult<any>).value : null;
    const ownPools = Array.isArray(fulfilled(4)) ? fulfilled(4) : [];
    const confirmed = Array.isArray(fulfilled(5)) ? fulfilled(5) : [];
    const directJourneys = Array.isArray(fulfilled(0)) ? fulfilled(0) : [];
    let nextJourneys: Journey[] = directJourneys;
    if (!nextJourneys.length) {
      const merged = new Map<string, any>();
      [...ownPools, ...confirmed].forEach((p: any) => p?.pool_id && merged.set(p.pool_id, p));
      nextJourneys = [...merged.values()].map((p) => normalizeJourney(p)).filter(Boolean) as Journey[];
      nextJourneys.sort((a, b) => new Date(a.travel_datetime).getTime() - new Date(b.travel_datetime).getTime());
    }
    setJourneys(nextJourneys);
    if (Array.isArray(fulfilled(1))) setSaved(fulfilled(1));
    if (Array.isArray(fulfilled(2))) setRecurring(fulfilled(2));
    if (Array.isArray(fulfilled(3))) setInsights(fulfilled(3));
    setAvailability({ journeys: results[0].status === "fulfilled" || results[4].status === "fulfilled" || results[5].status === "fulfilled", saved: results[1].status === "fulfilled", recurring: results[2].status === "fulfilled", insights: results[3].status === "fulfilled" });
    loadedOnce.current = true; setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const go = (path: string) => { Haptics.selectionAsync(); router.push(path as any); };
  const now = Date.now();
  const upcoming = journeys.filter((j) => new Date(j.travel_datetime).getTime() >= now - 15 * 60_000);
  const recent = journeys.filter((j) => new Date(j.travel_datetime).getTime() < now - 15 * 60_000).sort((a, b) => new Date(b.travel_datetime).getTime() - new Date(a.travel_datetime).getTime());
  const nextJourney = upcoming[0] || null;

  const saveRoute = async () => {
    if (!saveFrom.trim() || !saveTo.trim()) return;
    setSavingRoute(true);
    try { await api.saveRoute({ from_location: saveFrom.trim(), to_location: saveTo.trim(), alerts_enabled: true, time_window_minutes: 180 }); setShowSave(false); await load(); }
    catch (e: any) { Alert.alert("Couldn't save route", e.message || "Try again"); }
    finally { setSavingRoute(false); }
  };
  const addRecurring = async () => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(repeatTime.trim());
    if (!repeatFrom.trim() || !repeatTo.trim() || !match || Number(match[1]) > 23 || Number(match[2]) > 59) return Alert.alert("Check the time", "Choose a valid time, for example 18:00.");
    setSavingRepeat(true);
    try { await api.createRecurringRoute({ from_location: repeatFrom.trim(), to_location: repeatTo.trim(), weekday, hour: Number(match[1]), minute: Number(match[2]), total_seats: 4, companions: 0, gender_preference: "any", active: true }); setShowRecurring(false); await load(); }
    catch (e: any) { Alert.alert("Couldn't create recurring ride", e.message || "Try again"); }
    finally { setSavingRepeat(false); }
  };
  const removeSaved = async (id: string) => { const previous = saved; setSaved((x) => x.filter((r) => r.saved_route_id !== id)); try { await api.deleteSavedRoute(id); } catch (e: any) { setSaved(previous); Alert.alert("Couldn't remove route", e.message); } };
  const toggleRecurring = async (route: RecurringRoute) => { try { await api.updateRecurringRoute(route.template_id, { active: !route.active }); setRecurring((rows) => rows.map((r) => r.template_id === route.template_id ? { ...r, active: !r.active } : r)); } catch (e: any) { Alert.alert("Couldn't update recurring ride", e.message); } };

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.headingRow}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>EXPLORE</Text><Text style={styles.title}>Your mobility hub</Text><Text style={styles.subtitle}>Routes, recurring rides, travel history and useful tools. Each section stays usable even if another service is unavailable.</Text></View><Pressable onPress={() => go("/post-request")} style={styles.postButton}><Ionicons name="add" size={18} color="#fff" /><Text style={styles.postButtonText}>Post trip</Text></Pressable></View>
      <Pressable onPress={() => go("/my-trips")} accessibilityLabel="Open My Trips" style={{ marginBottom: 14, padding: 14, borderRadius: RADIUS.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 10 }}><Ionicons name="albums-outline" size={19} color={colors.indigo} /><View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, fontWeight: "900" }}>My Trips</Text><Text style={{ color: colors.muted, fontSize: 11 }}>Posted, requested and confirmed rides — with next actions.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.indigo} /></Pressable>

      {loading && !loadedOnce.current ? <View style={styles.loadingCard}><ActivityIndicator color={colors.indigo} /><Text style={styles.muted}>Loading travel tools…</Text></View> : null}

      <Section title="Next journey" sub={nextJourney ? "Everything important for your next real ride." : recent.length ? "No future ride right now. Your most recent confirmed trip is still available below." : "Your confirmed/upcoming rides will appear here."} styles={styles}>
        {nextJourney ? <Pressable onPress={() => go(`/pool/${nextJourney.pool_id}`)} style={styles.heroTrip}><View style={styles.heroTop}><View style={styles.phasePill}><View style={styles.liveDot} /><Text style={styles.phaseText}>{phaseLabel(nextJourney.phase)}</Text></View><Text style={styles.when}>{when(nextJourney.travel_datetime)}</Text></View><Text numberOfLines={1} style={styles.routeBig}>{nextJourney.from_location}</Text><View style={styles.routeArrow}><View style={styles.routeLine} /><Ionicons name="arrow-forward" size={16} color={colors.saffron} /></View><Text numberOfLines={1} style={styles.routeBig}>{nextJourney.to_location}</Text><View style={styles.statRow}><MiniStat icon="people" text={nextJourney.seats ? `${nextJourney.seats.available} seats left` : "Seat details"} colors={colors} /><MiniStat icon="location" text={nextJourney.meeting_point?.label || "Set meeting point"} colors={colors} /><MiniStat icon="cash" text={nextJourney.fare?.per_person ? `₹${nextJourney.fare.per_person}/person` : "Add fare"} colors={colors} /></View><View style={styles.openRow}><Text style={styles.openText}>Open Trip Command Centre</Text><Ionicons name="arrow-forward-circle" size={22} color={colors.indigo} /></View></Pressable> : recent[0] ? <Pressable onPress={() => go(`/pool/${recent[0].pool_id}`)} style={styles.emptyCard}><Ionicons name="checkmark-circle-outline" size={24} color={colors.success} /><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Recent confirmed trip</Text><Text style={styles.cardSub}>{recent[0].from_location} → {recent[0].to_location} · {when(recent[0].travel_datetime)}</Text></View><Ionicons name="chevron-forward" size={20} color={colors.muted} /></Pressable> : <Pressable onPress={() => go("/post-request")} style={styles.emptyCard}><Ionicons name="navigate-outline" size={24} color={colors.indigo} /><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{availability.journeys ? "No upcoming journey" : "Post your next journey"}</Text><Text style={styles.cardSub}>Create a trip and UniPool will match and coordinate it.</Text></View><Ionicons name="add-circle" size={25} color={colors.saffron} /></Pressable>}
      </Section>

      <Section title="Saved routes" sub="Follow corridors you care about and get alerts when matching rides appear." action={availability.saved ? "Add route" : undefined} onAction={() => setShowSave((v) => !v)} styles={styles}>
        {!availability.saved ? <InlineUnavailable text="Saved-route alerts are temporarily unavailable. Your other Explore tools still work." colors={colors} styles={styles} /> : <>{showSave ? <View style={styles.formCard}><TextInput value={saveFrom} onChangeText={setSaveFrom} placeholder="From" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={saveTo} onChangeText={setSaveTo} placeholder="To" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={savingRoute} onPress={saveRoute} style={styles.primaryBtn}>{savingRoute ? <ActivityIndicator color="#fff" /> : <><Ionicons name="notifications" size={16} color="#fff" /><Text style={styles.primaryBtnText}>Save + alert me</Text></>}</Pressable></View> : null}{saved.length ? <View style={styles.stack}>{saved.map((route) => <View key={route.saved_route_id} style={styles.routeCard}><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.cardTitle}>{route.label || `${route.from_location} → ${route.to_location}`}</Text><Text style={styles.cardSub}>{route.active_rides || 0} upcoming ride{route.active_rides === 1 ? "" : "s"}</Text></View><Pressable onPress={() => removeSaved(route.saved_route_id)} hitSlop={10}><Ionicons name="trash-outline" size={18} color={colors.muted} /></Pressable></View>)}</View> : !showSave ? <Text style={styles.muted}>No saved routes yet.</Text> : null}</>}
      </Section>

      <Section title="Recurring journeys" sub="For routes you repeat every week." action={availability.recurring ? "Add weekly" : undefined} onAction={() => setShowRecurring((v) => !v)} styles={styles}>
        {!availability.recurring ? <InlineUnavailable text="Recurring rides are temporarily unavailable." colors={colors} styles={styles} /> : <>{showRecurring ? <View style={styles.formCard}><TextInput value={repeatFrom} onChangeText={setRepeatFrom} placeholder="From" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={repeatTo} onChangeText={setRepeatTo} placeholder="To" placeholderTextColor={colors.muted} style={styles.input} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{WEEKDAYS.map((day, index) => <Pressable key={day} onPress={() => setWeekday(index)} style={[styles.dayChip, weekday === index && styles.dayChipActive]}><Text style={[styles.dayText, weekday === index && { color: "#fff" }]}>{day}</Text></Pressable>)}</ScrollView><TextInput value={repeatTime} onChangeText={setRepeatTime} placeholder="18:00" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={savingRepeat} onPress={addRecurring} style={styles.primaryBtn}>{savingRepeat ? <ActivityIndicator color="#fff" /> : <><Ionicons name="repeat" size={16} color="#fff" /><Text style={styles.primaryBtnText}>Create recurring ride</Text></>}</Pressable></View> : null}<View style={styles.stack}>{recurring.map((route) => <Pressable key={route.template_id} onPress={() => toggleRecurring(route)} style={[styles.routeCard, !route.active && { opacity: .58 }]}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{route.from_location} → {route.to_location}</Text><Text style={styles.cardSub}>{WEEKDAYS[route.weekday]} · {timeLabel(route.hour, route.minute)} · {route.active ? "Active" : "Paused"}</Text></View><Ionicons name={route.active ? "pause-circle-outline" : "play-circle-outline"} size={22} color={colors.indigo} /></Pressable>)}</View>{!recurring.length && !showRecurring ? <Text style={styles.muted}>No recurring journeys yet.</Text> : null}</>}
      </Section>

      <Section title="Travel network" sub="Reliability, completed rides and people you've travelled with." styles={styles}><Pressable onPress={() => go("/network")} style={styles.networkCard}><View style={styles.networkIcon}><Ionicons name="git-network-outline" size={24} color={colors.indigo} /></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Travel history & reliability</Text><Text style={styles.cardSub}>See completed journeys and mutual traveller context.</Text></View><Ionicons name="chevron-forward" size={20} color={colors.muted} /></Pressable></Section>

      <Section title="Route intelligence" sub="Patterns from recent UniPool travel activity." styles={styles}>{!availability.insights ? <InlineUnavailable text="Route trends are unavailable right now." colors={colors} styles={styles} /> : <View style={styles.toolGrid}>{insights.slice(0, 4).map((item) => <View key={item.route_key} style={styles.insightCard}><Ionicons name="analytics" size={19} color={colors.saffron} /><Text numberOfLines={2} style={styles.cardTitle}>{item.from_location} → {item.to_location}</Text><Text style={styles.cardSub}>{item.trips_120d} trips · {item.peak_hour == null ? "building a pattern" : `peak around ${timeLabel(item.peak_hour)}`}</Text></View>)}{insights.length === 0 ? <Text style={styles.muted}>Route trends will appear as the network grows.</Text> : null}</View>}</Section>

      <Section title="Useful right now" styles={styles}><View style={styles.toolGrid}><Tool icon="wallet-outline" title="Circles" sub="Split shared college expenses" onPress={() => go("/circles")} colors={colors} styles={styles} accent /><Tool icon="flame-outline" title="Route demand" sub="See busy corridors" onPress={() => go("/heatmap")} colors={colors} styles={styles} /><Tool icon="chatbubbles-outline" title="Trip chats" sub="Coordinate journeys" onPress={() => go("/(tabs)/messages")} colors={colors} styles={styles} /><Tool icon="shield-checkmark-outline" title="Student ID" sub="Identity and trust" onPress={() => go("/(tabs)/profile")} colors={colors} styles={styles} /></View></Section>
    </ScrollView>
  </SafeAreaView>;
}

function Section({ title, sub, action, onAction, children, styles }: any) { return <View style={styles.section}><View style={styles.sectionHead}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{title}</Text>{sub ? <Text style={styles.sectionSub}>{sub}</Text> : null}</View>{action ? <Pressable onPress={onAction}><Text style={styles.actionLink}>{action}</Text></Pressable> : null}</View>{children}</View>; }
function MiniStat({ icon, text, colors }: any) { return <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Ionicons name={icon} size={14} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700" }}>{text}</Text></View>; }
function Tool({ icon, title, sub, onPress, colors, styles, accent }: any) { return <Pressable onPress={onPress} style={styles.toolCard}><View style={[styles.toolIcon, accent && { backgroundColor: colors.cream }]}><Ionicons name={icon} size={20} color={accent ? colors.saffron : colors.indigo} /></View><Text style={styles.cardTitle}>{title}</Text><Text style={styles.cardSub}>{sub}</Text></Pressable>; }
function InlineUnavailable({ text, colors, styles }: any) { return <View style={styles.inlineUnavailable}><Ionicons name="cloud-offline-outline" size={17} color={colors.muted} /><Text style={styles.cardSub}>{text}</Text></View>; }

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface }, content: { width: "100%", maxWidth: 1120, alignSelf: "center", padding: 24, paddingBottom: 140 },
  headingRow: { flexDirection: "row", alignItems: "flex-start", gap: 18, marginBottom: 28 }, eyebrow: { color: colors.saffron, fontSize: 10, fontWeight: "900", letterSpacing: 1.3 }, title: { color: colors.onSurface, fontSize: 32, fontWeight: "900", fontFamily: FONT_DISPLAY, marginTop: 5 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7, maxWidth: 760 },
  postButton: { minHeight: 44, borderRadius: RADIUS.pill, backgroundColor: colors.indigo, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 18 }, postButtonText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  loadingCard: { minHeight: 92, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 24 }, muted: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  section: { marginBottom: 30 }, sectionHead: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginBottom: 12 }, sectionTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "900" }, sectionSub: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 }, actionLink: { color: colors.indigo, fontSize: 11, fontWeight: "900" },
  heroTrip: { borderRadius: RADIUS.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 20 }, heroTop: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 14 }, phasePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface2, paddingHorizontal: 9, paddingVertical: 6, borderRadius: RADIUS.pill }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }, phaseText: { color: colors.onSurface2, fontSize: 9, fontWeight: "900" }, when: { color: colors.muted, fontSize: 10, fontWeight: "700" }, routeBig: { color: colors.onSurface, fontSize: 19, fontWeight: "900" }, routeArrow: { flexDirection: "row", alignItems: "center", gap: 6, width: 100, marginVertical: 8 }, routeLine: { height: 1, flex: 1, backgroundColor: colors.border }, statRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 14 }, openRow: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 18, paddingTop: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, openText: { color: colors.indigo, fontSize: 11, fontWeight: "900" },
  emptyCard: { borderRadius: RADIUS.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 17, flexDirection: "row", alignItems: "center", gap: 12 }, cardTitle: { color: colors.onSurface, fontSize: 12, fontWeight: "900" }, cardSub: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  formCard: { gap: 9, backgroundColor: colors.card, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 }, input: { minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, color: colors.onSurface, paddingHorizontal: 12 }, primaryBtn: { minHeight: 43, borderRadius: RADIUS.pill, backgroundColor: colors.indigo, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, primaryBtnText: { color: "#fff", fontSize: 11, fontWeight: "900" }, stack: { gap: 8 }, routeCard: { minHeight: 68, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 13, flexDirection: "row", alignItems: "center", gap: 10 },
  dayChip: { minWidth: 42, minHeight: 34, borderRadius: RADIUS.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }, dayChipActive: { backgroundColor: colors.indigo, borderColor: colors.indigo }, dayText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  networkCard: { borderRadius: RADIUS.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }, networkIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  toolGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 }, toolCard: { flexGrow: 1, flexBasis: 210, minHeight: 120, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 15 }, toolIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", marginBottom: 10 }, insightCard: { flexGrow: 1, flexBasis: 220, minHeight: 108, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 15, gap: 6 },
  inlineUnavailable: { minHeight: 58, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 13, flexDirection: "row", alignItems: "center", gap: 9 },
});
