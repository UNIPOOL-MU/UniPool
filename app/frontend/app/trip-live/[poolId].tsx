import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { circlesApi } from "@/src/api/circles";
import { moneyV3Api, TripPreferences } from "@/src/api/moneyV3";
import { tripApi, TripLiveMember, TripPoll, TripState } from "@/src/api/trip";
import { useAuth } from "@/src/auth/AuthContext";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";

const STATUS = [
  ["getting_ready", "Getting ready", "git-compare-outline"],
  ["on_the_way", "On my way", "car-outline"],
  ["at_pickup", "I'm here", "location-outline"],
  ["running_late", "Running late", "time-outline"],
] as const;
const FLEX = [0, 30, 60, 120];
const CABS = ["any", "sedan", "xl", "two-cabs"];
const money = (paise = 0) => `₹${(Number(paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function TripLiveScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pool, setPool] = useState<any>(null);
  const [state, setState] = useState<TripState | null>(null);
  const [live, setLive] = useState<TripLiveMember[]>([]);
  const [polls, setPolls] = useState<TripPoll[]>([]);
  const [prefs, setPrefs] = useState<TripPreferences | null>(null);
  const [circles, setCircles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("6:00 PM, 6:30 PM");
  const [fare, setFare] = useState("");

  const load = useCallback(async () => {
    if (!poolId) return;
    setLoading(true);
    const [p, s, l, q, pr, c] = await Promise.allSettled([
      api.getPool(poolId), tripApi.state(poolId), tripApi.live(poolId), tripApi.polls(poolId), moneyV3Api.tripPreferences(poolId), circlesApi.list(),
    ]);
    if (p.status === "fulfilled") setPool(p.value);
    if (s.status === "fulfilled") { setState(s.value); setFare(s.value.final_fare_paise ? String(Number(s.value.final_fare_paise) / 100) : ""); }
    if (l.status === "fulfilled") setLive(l.value || []);
    if (q.status === "fulfilled") setPolls(q.value || []);
    if (pr.status === "fulfilled") setPrefs(pr.value);
    if (c.status === "fulfilled") setCircles(Array.isArray(c.value) ? c.value : []);
    setLoading(false);
  }, [poolId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const mine = pool?.user_id === user?.user_id;
  const meLive = live.find((m) => m.user_id === user?.user_id);
  const openPerson = (userId: string, name?: string | null) => {
    if (userId === user?.user_id) router.push("/(tabs)/profile" as any);
    else router.push({ pathname: "/network", params: { userId, name: name || "Traveller" } } as any);
  };

  const updateStatus = async (status: string) => {
    if (!poolId) return; setBusy(status);
    try { await tripApi.updateLive(poolId, { status }); await load(); }
    catch (e: any) { Alert.alert("Couldn't update trip status", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  const shareLocation = async () => {
    if (!poolId) return;
    const geo = typeof navigator !== "undefined" ? (navigator as any).geolocation : null;
    if (!geo) return Alert.alert("Location sharing unavailable", Platform.OS === "web" ? "Your browser does not expose location to UniPool." : "Temporary live location is currently available in the web/PWA version. Status updates still work here.");
    setBusy("location");
    geo.getCurrentPosition(async (position: any) => {
      try {
        await tripApi.updateLive(poolId, { status: meLive?.status || "on_the_way", latitude: Number(position.coords.latitude), longitude: Number(position.coords.longitude), share_minutes: 30 });
        await load();
        Alert.alert("Location shared", "Your location will automatically expire in 30 minutes unless you share it again.");
      } catch (e: any) { Alert.alert("Couldn't share location", e?.message || "Try again"); }
      finally { setBusy(null); }
    }, (error: any) => { setBusy(null); Alert.alert("Location not shared", error?.message || "Allow location access and try again."); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 });
  };

  const stopLocation = async () => {
    if (!poolId) return; setBusy("stop-location");
    try { await tripApi.stopLiveLocation(poolId); await load(); }
    catch (e: any) { Alert.alert("Couldn't stop location", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  const updatePrefs = async (patch: Partial<TripPreferences>) => {
    if (!poolId || !prefs) return;
    const next = { ...prefs, ...patch }; setPrefs(next); setBusy("prefs");
    try { setPrefs(await moneyV3Api.setTripPreferences(poolId, next)); }
    catch (e: any) { Alert.alert("Couldn't save matching preferences", e?.message || "Try again"); await load(); }
    finally { setBusy(null); }
  };

  const createPoll = async () => {
    const options = pollOptions.split(",").map((v) => v.trim()).filter(Boolean).slice(0, 5);
    if (!poolId || pollQuestion.trim().length < 3 || options.length < 2) return Alert.alert("Check poll", "Add a question and at least two comma-separated options.");
    setBusy("poll");
    try { await tripApi.addPoll(poolId, pollQuestion.trim(), options); setPollQuestion(""); await load(); }
    catch (e: any) { Alert.alert("Couldn't create poll", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  const vote = async (pollId: string, optionIndex: number) => {
    setBusy(`vote-${pollId}`);
    try { await tripApi.votePoll(pollId, optionIndex); await load(); }
    catch (e: any) { Alert.alert("Couldn't vote", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  const saveFare = async () => {
    const rupees = Number(fare);
    if (!poolId || !mine || !Number.isFinite(rupees) || rupees <= 0) return Alert.alert("Check fare", "Enter the final total cab fare.");
    setBusy("fare");
    try { setState(await tripApi.setFare(poolId, Math.round(rupees * 100), "Final trip fare")); }
    catch (e: any) { Alert.alert("Couldn't save final fare", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  const importFare = async (circle: any) => {
    if (!poolId) return; setBusy(`circle-${circle.group_id}`);
    try {
      const result = await moneyV3Api.addTripFareToCircle(poolId, circle.group_id, { paid_by: user?.user_id, description: `${pool?.from_location || "Trip"} → ${pool?.to_location || "fare"}` });
      Alert.alert(result?.already_exists ? "Already in Circle" : "Added to Circle", result?.already_exists ? "This trip fare was already imported." : `Added ${money(result.amount_paise)} across ${result.participants} confirmed traveller${result.participants === 1 ? "" : "s"}.`);
    } catch (e: any) { Alert.alert("Couldn't add fare to Circle", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  if (loading && !pool) return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={colors.indigo} /><Text style={styles.muted}>Opening live coordination...</Text></View></SafeAreaView>;
  if (!pool) return null;

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={styles.eyebrow}>LIVE TRIP</Text><Text style={styles.title}>{pool.from_location} → {pool.to_location}</Text><Text style={styles.sub}>Stage: {(state?.stage || "confirmed").replace(/_/g, " ")} · temporary coordination only</Text></View></View>

    <View style={styles.privacy}><Ionicons name="lock-closed-outline" size={18} color={colors.saffron} /><Text style={styles.privacyText}>Live location is opt-in, visible only to confirmed trip participants through UniPool's trip service, and expires automatically. Status-only coordination does not share coordinates.</Text></View>

    <Text style={styles.sectionTitle}>Where everyone is</Text>
    <View style={styles.statusGrid}>{STATUS.map(([value, label, icon]) => <Pressable key={value} disabled={!!busy} onPress={() => updateStatus(value)} style={[styles.status, meLive?.status === value && styles.statusActive]}><Ionicons name={icon} size={17} color={meLive?.status === value ? "#fff" : colors.indigo} /><Text style={[styles.statusText, meLive?.status === value && { color: "#fff" }]}>{label}</Text></Pressable>)}</View>
    <View style={styles.liveCard}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{meLive?.location_active ? "Your live location is active" : "Share temporary live location"}</Text><Text style={styles.muted}>{meLive?.location_active && meLive.location_expires_at ? `Expires ${new Date(meLive.location_expires_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Optional 30-minute sharing for pickup coordination."}</Text></View>{meLive?.location_active ? <Pressable onPress={stopLocation} style={styles.secondary}><Text style={styles.secondaryText}>{busy === "stop-location" ? "Stopping..." : "Stop"}</Text></Pressable> : <Pressable onPress={shareLocation} style={styles.primary}><Text style={styles.primaryText}>{busy === "location" ? "Sharing..." : "Share 30 min"}</Text></Pressable>}</View>
    <View style={styles.memberList}>{live.map((member) => <Pressable key={member.user_id} onPress={() => openPerson(member.user_id, member.name)} style={({ pressed }) => [styles.member, pressed && styles.memberPressed]} accessibilityRole="button" accessibilityLabel={`Open ${member.name || "traveller"}'s profile`}><View style={styles.avatar}><Text style={styles.avatarText}>{String(member.name || "S").slice(0,1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.memberName}>{member.name || "Student"}{member.user_id === user?.user_id ? " · you" : ""}</Text><Text style={styles.muted}>{(member.status || "No status").replace(/_/g, " ")}{member.location_active ? " · live location active" : ""}</Text></View>{member.location_active ? <Ionicons name="location" size={17} color={colors.success} /> : null}<Ionicons name="chevron-forward" size={16} color={colors.muted} /></Pressable>)}</View>

    <Text style={styles.sectionTitle}>Matching preferences</Text>
    {prefs ? <View style={styles.card}><Text style={styles.label}>Time flexibility</Text><View style={styles.wrap}>{FLEX.map((mins) => <Chip key={mins} active={prefs.time_flex_minutes === mins} text={mins === 0 ? "Exact" : `±${mins} min`} onPress={() => updatePrefs({ time_flex_minutes: mins })} styles={styles} />)}</View><Text style={styles.label}>Cab preference</Text><View style={styles.wrap}>{CABS.map((cab) => <Chip key={cab} active={prefs.cab_preference === cab} text={cab === "any" ? "Any cab" : cab.replace("-", " ")} onPress={() => updatePrefs({ cab_preference: cab })} styles={styles} />)}</View><View style={styles.prefRow}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Luggage flexible</Text><Text style={styles.muted}>Okay adjusting luggage/cab choice for a better match.</Text></View><Switch value={prefs.luggage_flexible} onValueChange={(value) => updatePrefs({ luggage_flexible: value })} trackColor={{ false: colors.border, true: colors.indigo }} /></View><View style={styles.prefRow}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Prefer a quiet ride</Text><Text style={styles.muted}>A soft preference, never a public label.</Text></View><Switch value={prefs.quiet_ride} onValueChange={(value) => updatePrefs({ quiet_ride: value })} trackColor={{ false: colors.border, true: colors.indigo }} /></View><Text style={styles.label}>Maximum detour</Text><View style={styles.wrap}>{[0, 2, 5, 10].map((km) => <Chip key={km} active={Number(prefs.max_detour_km) === km} text={km === 0 ? "No detour" : `${km} km`} onPress={() => updatePrefs({ max_detour_km: km })} styles={styles} />)}</View></View> : null}

    <Text style={styles.sectionTitle}>Ride polls</Text>
    <View style={styles.card}><TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder="Leave at 6:00 or 6:30? Gate 1 or Gate 2?" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={pollOptions} onChangeText={setPollOptions} placeholder="Options, separated by commas" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={busy === "poll"} onPress={createPoll} style={styles.primaryWide}><Text style={styles.primaryText}>{busy === "poll" ? "Creating..." : "Create trip poll"}</Text></Pressable></View>
    <View style={styles.polls}>{polls.map((poll) => <View key={poll.id} style={styles.poll}><Text style={styles.cardTitle}>{poll.question}</Text><View style={styles.pollOptions}>{(poll.options || []).map((option, index) => <Pressable key={option} disabled={busy === `vote-${poll.id}`} onPress={() => vote(poll.id, index)} style={[styles.pollOption, poll.my_vote === index && styles.pollOptionActive]}><Text style={[styles.pollOptionText, poll.my_vote === index && { color: "#fff" }]}>{option}</Text><Text style={[styles.pollCount, poll.my_vote === index && { color: "rgba(255,255,255,.8)" }]}>{poll.counts?.[index] || 0}</Text></Pressable>)}</View></View>)}</View>

    <Text style={styles.sectionTitle}>Final fare</Text>
    <View style={styles.card}><View style={styles.fareRow}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{state?.final_fare_paise ? `${money(state.final_fare_paise)} total` : "Final fare not set"}</Text><Text style={styles.muted}>{state?.estimated_share_paise ? `≈ ${money(state.estimated_share_paise)} each across ${state.member_count || 1} participant${state.member_count === 1 ? "" : "s"}` : "Once the ride ends, record the final cab fare and split it across confirmed travellers."}</Text></View>{mine ? <View style={styles.fareEdit}><TextInput value={fare} onChangeText={setFare} keyboardType="decimal-pad" placeholder="₹ total" placeholderTextColor={colors.muted} style={styles.fareInput} /><Pressable onPress={saveFare} style={styles.primary}><Text style={styles.primaryText}>Save</Text></Pressable></View> : null}</View>{state?.final_fare_paise && circles.length ? <><Text style={[styles.label, { marginTop: 12 }]}>Add to a Circle</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wrap}>{circles.map((circle) => <Pressable key={circle.group_id} disabled={busy === `circle-${circle.group_id}`} onPress={() => importFare(circle)} style={styles.circleChip}><Text style={styles.circleEmoji}>{circle.emoji || "💸"}</Text><Text style={styles.circleText}>{circle.name}</Text></Pressable>)}</ScrollView></> : null}</View>
  </ScrollView></SafeAreaView>;
}

function Chip({ active, text, onPress, styles }: any) { return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && { color: "#fff" }]}>{text}</Text></Pressable>; }

const makeStyles = (c: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.surface }, page: { width: "100%", maxWidth: 900, alignSelf: "center", padding: SPACING.lg, paddingBottom: 140 }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }, header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 }, back: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }, eyebrow: { color: c.saffron, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: c.onSurface, fontFamily: FONT_DISPLAY, fontSize: 24, fontWeight: "900", marginTop: 3 }, sub: { color: c.muted, fontSize: 10, marginTop: 3, textTransform: "capitalize" }, muted: { color: c.muted, fontSize: 10, lineHeight: 15 }, privacy: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: RADIUS.lg, padding: 13, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border, marginBottom: 20 }, privacyText: { flex: 1, color: c.muted, fontSize: 10, lineHeight: 16 }, sectionTitle: { color: c.onSurface, fontSize: 16, fontWeight: "900", marginTop: 8, marginBottom: 9 }, statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 9 }, status: { flexGrow: 1, flexBasis: 150, minHeight: 42, borderRadius: 21, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, statusActive: { backgroundColor: c.indigo, borderColor: c.indigo }, statusText: { color: c.onSurface, fontSize: 9, fontWeight: "900" }, liveCard: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, padding: 13, marginBottom: 8 }, primary: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, backgroundColor: c.indigo, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#fff", fontSize: 9, fontWeight: "900" }, secondary: { minHeight: 36, borderRadius: 18, paddingHorizontal: 12, borderWidth: 1, borderColor: c.error, alignItems: "center", justifyContent: "center" }, secondaryText: { color: c.error, fontSize: 9, fontWeight: "900" }, memberList: { gap: 7, marginBottom: 18 }, member: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, paddingHorizontal: 10 }, memberPressed: { opacity: 0.72 }, avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, avatarText: { color: c.indigo, fontWeight: "900" }, memberName: { color: c.onSurface, fontSize: 10, fontWeight: "900" }, card: { borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 14, gap: 9, marginBottom: 14 }, cardTitle: { color: c.onSurface, fontSize: 12, fontWeight: "900" }, label: { color: c.muted, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: .5 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chip: { minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 11, alignItems: "center", justifyContent: "center" }, chipActive: { backgroundColor: c.indigo, borderColor: c.indigo }, chipText: { color: c.onSurface, fontSize: 9, fontWeight: "900", textTransform: "capitalize" }, prefRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }, input: { minHeight: 43, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 11, color: c.onSurface }, primaryWide: { minHeight: 40, borderRadius: 20, backgroundColor: c.indigo, alignItems: "center", justifyContent: "center" }, polls: { gap: 8, marginBottom: 14 }, poll: { borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 13, gap: 9 }, pollOptions: { gap: 6 }, pollOption: { minHeight: 38, borderRadius: 12, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, pollOptionActive: { backgroundColor: c.indigo, borderColor: c.indigo }, pollOptionText: { color: c.onSurface, fontSize: 10, fontWeight: "800" }, pollCount: { color: c.muted, fontSize: 9, fontWeight: "900" }, fareRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }, fareEdit: { flexDirection: "row", alignItems: "center", gap: 6 }, fareInput: { width: 95, minHeight: 36, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, color: c.onSurface, paddingHorizontal: 9 }, circleChip: { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10 }, circleEmoji: { fontSize: 14 }, circleText: { color: c.onSurface, fontSize: 9, fontWeight: "900" },
});
