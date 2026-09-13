import { sharedApi } from "@/src/api/shared";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { SPACING, RADIUS, FONT, FONT_DISPLAY } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import RatingBadge from "@/src/components/RatingBadge";
import UserBadges from "@/src/components/UserBadges";
import RatingModal from "@/src/components/RatingModal";
import ReportBlockModal from "@/src/components/ReportBlockModal";
import Confetti from "@/src/components/Confetti";
import { PoolFeedSkeleton } from "@/src/components/Skeleton";

type Pool = {
  pool_id: string; user_id: string; user_name: string; user_email: string;
  from_location: string; to_location: string; travel_datetime: string;
  companions: number; notes?: string | null; match_score?: number; match_label?: string;
  match_time_delta_minutes?: number; match_reasons?: string[];
  user_rating_avg?: number | null; user_rating_count?: number;
  user_badges?: { id: string; label: string; icon: string }[];
  conversation_id?: string; conversation_name?: string;
};

type ConfirmedRide = {
  pool_id: string; from_location: string; to_location: string; travel_datetime: string;
  other_user_id: string; other_user_name: string; other_user_email: string;
  other_user_rating_avg?: number | null; other_user_rating_count?: number;
  other_user_badges?: { id: string; label: string; icon: string }[];
  my_role: "owner" | "traveler"; conversation_id?: string; conversation_name?: string;
};

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
function tradeOffs(item: Pool) {
  const notes: string[] = [];
  const delta = Number(item.match_time_delta_minutes ?? 0);
  if (delta >= 120) notes.push(`Departure times differ by about ${Math.round(delta / 60)} hours; confirm flexibility first.`);
  else if (delta >= 60) notes.push(`Departure times are ${delta} minutes apart; check timing before committing.`);
  if (Number(item.match_score || 0) < 70) notes.push("This is a moderate fit, so confirm pickup details and travel preferences in chat.");
  return notes;
}

export default function MatchesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const loadedOnce = useRef(false);
  const [items, setItems] = useState<Pool[]>([]);
  const [confirmed, setConfirmed] = useState<ConfirmedRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [ratingTarget, setRatingTarget] = useState<{ user_id: string; user_name: string; pool_id: string } | null>(null);
  const [reportTarget, setReportTarget] = useState<{ user_id: string; user_name: string } | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const knownConfirmedKeys = useRef<Set<string> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!loadedOnce.current && !silent) setLoading(true); else setSyncing(true);
    setFatalError(null); setPartialWarning(null);
    const [matchResult, confirmedResult] = await Promise.allSettled([api.myMatches(), api.confirmedMatches()]);

    if (matchResult.status === "fulfilled") setItems(matchResult.value || []);
    else if (!loadedOnce.current) setItems([]);

    if (confirmedResult.status === "fulfilled") {
      const rides = confirmedResult.value || [];
      setConfirmed(rides);
      const keysNow = new Set<string>(rides.map((r: ConfirmedRide) => `${r.pool_id}:${r.other_user_id}`));
      if (knownConfirmedKeys.current && [...keysNow].some((k) => !knownConfirmedKeys.current!.has(k))) setConfettiKey((k) => k + 1);
      knownConfirmedKeys.current = keysNow;
    } else if (!loadedOnce.current) setConfirmed([]);

    if (matchResult.status === "rejected" && confirmedResult.status === "rejected") setFatalError("We couldn't reach your trips right now. Please try again.");
    else if (matchResult.status === "rejected") setPartialWarning("New match suggestions couldn't refresh. Showing your existing confirmed trips.");
    else if (confirmedResult.status === "rejected") setPartialWarning("Confirmed trips couldn't refresh. Match discovery is still available.");
    loadedOnce.current = true; setLoading(false); setSyncing(false); setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(loadedOnce.current); }, [load]));

  const openPerson = useCallback((userId: string, name: string) => {
    if (userId === user?.user_id) router.push("/(tabs)/profile" as any);
    else router.push({ pathname: "/network", params: { userId, name } } as any);
  }, [router, user?.user_id]);

  const openTripChat = useCallback(async (pool: { pool_id: string; conversation_id?: string }, fallbackUserId?: string, fallbackName?: string) => {
    try {
      const chat = await sharedApi.ensureTripChat(pool.pool_id);
      router.push({ pathname: "/chat/group/[conversationId]", params: { conversationId: chat.conversation_id } });
    } catch {
      if (fallbackUserId) router.push({ pathname: "/chat/[userId]", params: { userId: fallbackUserId, name: fallbackName || "Traveller" } });
      else Alert.alert("Trip chat is still syncing", "Pull to refresh in a moment. Your match has not been lost.");
    }
  }, [router]);

  const removeTraveler = (ride: ConfirmedRide) => {
    if (removingKey || !user?.user_id) return;
    const owner = ride.my_role === "owner";
    Alert.alert(owner ? "Remove this traveller?" : "Leave this shared trip?", `You and ${ride.other_user_name.split(" ")[0]} will no longer be marked as travelling together.`, [
      { text: "Cancel", style: "cancel" },
      { text: owner ? "Remove traveller" : "Leave trip", style: "destructive", onPress: async () => {
        const key = `${ride.pool_id}:${ride.other_user_id}`;
        const snapshot = confirmed;
        setRemovingKey(key);
        setConfirmed((current) => current.filter((item) => owner ? `${item.pool_id}:${item.other_user_id}` !== key : item.pool_id !== ride.pool_id));
        try {
          const removeId = ride.my_role === "owner" ? ride.other_user_id : (user?.user_id as string);
          await api.removeTraveler(ride.pool_id, removeId);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          load(true);
        } catch (e: any) {
          setConfirmed(snapshot);
          Alert.alert("Couldn't update trip", e?.message || "Please try again.");
        } finally { setRemovingKey(null); }
      } },
    ]);
  };

  const PersonLink = ({ userId, name, rating, ratingCount, badges }: { userId: string; name: string; rating?: number | null; ratingCount?: number; badges?: any[] }) => (
    <Pressable onPress={() => openPerson(userId, name)} style={({ pressed }) => [styles.personLink, pressed && styles.personLinkPressed]} accessibilityRole="button" accessibilityLabel={`Open ${name}'s profile`}>
      <View style={styles.personAvatar}><Text style={styles.personAvatarText}>{name?.[0]?.toUpperCase() || "U"}</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.personName}>{name}</Text><View style={styles.badges}><RatingBadge avg={rating} count={ratingCount} /><UserBadges badges={badges} compact /></View></View>
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </Pressable>
  );

  const header = <View style={styles.headerWrap}>
    <View style={styles.headingRow}><View style={styles.headingIcon}><Ionicons name="git-compare-outline" size={20} color={colors.indigo} /></View><View style={{ flex: 1 }}><View style={styles.titleRow}><Text style={styles.title}>Matches</Text>{syncing ? <ActivityIndicator size="small" color={colors.indigo} /> : null}</View><Text style={styles.sub}>Ranked by route, time, preferences and trust, with trade-offs shown explicitly.</Text></View></View>
    {partialWarning ? <View style={styles.warning}><Ionicons name="information-circle-outline" size={16} color={colors.warning} /><Text style={styles.warningText}>{partialWarning}</Text></View> : null}

    {confirmed.length > 0 ? <View style={styles.section}><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Confirmed journeys</Text><Text style={styles.sectionCount}>{confirmed.length}</Text></View>{confirmed.map((ride) => {
      const key = `${ride.pool_id}:${ride.other_user_id}`;
      return <View key={key} style={styles.tripCard}><View style={styles.cardTop}><View style={styles.confirmedPill}><View style={styles.liveDot} /><Text style={styles.confirmedText}>CONFIRMED</Text></View><Pressable accessibilityLabel={`More actions for ${ride.other_user_name}`} onPress={() => setReportTarget({ user_id: ride.other_user_id, user_name: ride.other_user_name })} hitSlop={10}><Ionicons name="ellipsis-horizontal" size={19} color={colors.muted} /></Pressable></View><PersonLink userId={ride.other_user_id} name={ride.other_user_name} rating={ride.other_user_rating_avg} ratingCount={ride.other_user_rating_count} badges={ride.other_user_badges} /><Route from={ride.from_location} to={ride.to_location} colors={colors} styles={styles} /><View style={styles.timeRow}><Ionicons name="time-outline" size={15} color={colors.muted} /><Text style={styles.timeText}>{fmtWhen(ride.travel_datetime)}</Text></View><View style={styles.actions}><Pressable onPress={() => router.push(`/pool/${ride.pool_id}` as any)} style={[styles.primaryAction, { flex: 1, minWidth: 0 }]}><Ionicons name="navigate-outline" size={17} color="#fff" /><Text style={styles.primaryActionText}>Trip Command Centre</Text></Pressable><Pressable accessibilityLabel="Open trip chat" onPress={() => openTripChat(ride, ride.other_user_id, ride.other_user_name)} style={styles.iconAction}><Ionicons name="chatbubbles-outline" size={18} color={colors.indigo} /></Pressable><Pressable accessibilityLabel={`Rate ${ride.other_user_name}`} onPress={() => setRatingTarget({ user_id: ride.other_user_id, user_name: ride.other_user_name, pool_id: ride.pool_id })} style={styles.iconAction}><Ionicons name="star-outline" size={18} color={colors.saffron} /></Pressable><Pressable accessibilityLabel={ride.my_role === "owner" ? "Remove confirmed traveller" : "Leave shared trip"} onPress={() => removeTraveler(ride)} disabled={removingKey === key} style={styles.iconAction}>{removingKey === key ? <ActivityIndicator size="small" color={colors.error} /> : <Ionicons name="exit-outline" size={18} color={colors.error} />}</Pressable></View></View>;
    })}</View> : null}

    <View style={styles.sectionHeading}><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.sectionTitle}>Recommended for you</Text><Text style={styles.sectionHint}>A high percentage is not a promise. Check the reasons and trade-offs below.</Text></View>{items.length > 0 ? <Text style={styles.sectionCount}>{items.length}</Text> : null}</View>
  </View>;

  if (loading) return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.loadingContent}><View style={styles.loadingHead}><View style={styles.headingIcon}><Ionicons name="git-compare-outline" size={20} color={colors.indigo} /></View><View><Text style={styles.title}>Finding your best rides</Text><Text style={styles.sub}>Comparing route, timing and trust signals...</Text></View></View><PoolFeedSkeleton count={3} /></ScrollView></SafeAreaView>;
  if (fatalError && !loadedOnce.current) return <SafeAreaView style={styles.safe} edges={["top"]}><View style={styles.errorState}><View style={styles.errorIcon}><Ionicons name="cloud-offline-outline" size={25} color={colors.error} /></View><Text style={styles.emptyTitle}>Matches are unavailable</Text><Text style={styles.emptySub}>{fatalError}</Text><Pressable onPress={() => load(false)} style={styles.primaryAction}><Ionicons name="refresh" size={16} color="#fff" /><Text style={styles.primaryActionText}>Try again</Text></Pressable></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <Confetti burstKey={confettiKey} />
    <FlatList data={items} keyExtractor={(item) => item.pool_id} contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.indigo} />} ListHeaderComponent={header} ListEmptyComponent={<View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="git-compare-outline" size={26} color={colors.indigo} /></View><Text style={styles.emptyTitle}>No compatible rides yet</Text><Text style={styles.emptySub}>Post your route and travel time. UniPool will rank genuine matches as other students post compatible journeys.</Text><Pressable onPress={() => router.push("/post-request")} style={styles.primaryAction}><Ionicons name="add" size={17} color="#fff" /><Text style={styles.primaryActionText}>Post a trip</Text></Pressable></View>}
      renderItem={({ item }) => {
        const score = item.match_score ?? 0;
        const warnings = tradeOffs(item);
        return <View style={styles.matchCard} testID={`match-card-${item.pool_id}`}>
          <View style={styles.cardTop}><View style={styles.scorePill}><Text style={styles.score}>{score}%</Text><Text style={styles.scoreLabel}>{item.match_label || "compatible"}</Text></View><Pressable accessibilityLabel={`More actions for ${item.user_name}`} onPress={() => setReportTarget({ user_id: item.user_id, user_name: item.user_name })} hitSlop={10}><Ionicons name="ellipsis-horizontal" size={19} color={colors.muted} /></Pressable></View>
          <PersonLink userId={item.user_id} name={item.user_name} rating={item.user_rating_avg} ratingCount={item.user_rating_count} badges={item.user_badges} />
          <Route from={item.from_location} to={item.to_location} colors={colors} styles={styles} />
          <View style={styles.matchMeta}><View style={styles.metaItem}><Ionicons name="time-outline" size={14} color={colors.muted} /><Text style={styles.metaText}>{fmtWhen(item.travel_datetime)}</Text></View>{item.match_time_delta_minutes != null ? <View style={styles.metaItem}><Ionicons name="swap-horizontal-outline" size={14} color={colors.muted} /><Text style={styles.metaText}>{item.match_time_delta_minutes} min apart</Text></View> : null}</View>
          {item.match_reasons?.length ? <><Text style={styles.signalLabel}>WHY IT WORKS</Text><View style={styles.reasons}>{item.match_reasons.map((reason) => <View key={reason} style={styles.reasonChip}><Ionicons name="checkmark-circle-outline" size={13} color={colors.indigo} /><Text style={styles.reasonText}>{reason}</Text></View>)}</View></> : null}
          {warnings.length ? <><Text style={styles.signalLabel}>CHECK BEFORE YOU COMMIT</Text><View style={styles.tradeoffs}>{warnings.map((warning) => <View key={warning} style={styles.tradeoff}><Ionicons name="alert-circle-outline" size={14} color={colors.saffron} /><Text style={styles.tradeoffText}>{warning}</Text></View>)}</View></> : null}
          {item.notes ? <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text> : null}
          <View style={styles.matchActions}><Pressable onPress={() => router.push(`/pool/${item.pool_id}` as any)} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>View details</Text></Pressable><Pressable onPress={() => openTripChat(item, item.user_id, item.user_name)} style={[styles.primaryAction, { flex: 1, marginTop: 0 }]}><Ionicons name="chatbubbles-outline" size={17} color="#fff" /><Text style={styles.primaryActionText}>{item.conversation_id ? "Open trip chat" : "Start trip chat"}</Text></Pressable></View>
        </View>;
      }}
    />
    {ratingTarget ? <RatingModal visible onClose={() => setRatingTarget(null)} userId={ratingTarget.user_id} userName={ratingTarget.user_name} poolId={ratingTarget.pool_id} onSubmitted={() => load(true)} /> : null}
    {reportTarget ? <ReportBlockModal visible onClose={() => setReportTarget(null)} userId={reportTarget.user_id} userName={reportTarget.user_name} onBlocked={() => load(true)} /> : null}
  </SafeAreaView>;
}

function Route({ from, to, colors, styles }: any) {
  return <View style={styles.routeBox}><View style={styles.routeLine}><View style={[styles.routeDot, { backgroundColor: colors.saffron }]} /><Text style={styles.routeText} numberOfLines={1}>{from}</Text></View><View style={styles.routeStem} /><View style={styles.routeLine}><View style={[styles.routeDot, { backgroundColor: colors.indigo }]} /><Text style={styles.routeText} numberOfLines={1}>{to}</Text></View></View>;
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface }, listContent: { width: "100%", maxWidth: 860, alignSelf: "center", padding: SPACING.lg, paddingBottom: 130 }, loadingContent: { width: "100%", maxWidth: 860, alignSelf: "center", padding: SPACING.lg, paddingBottom: 130 }, loadingHead: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: SPACING.xl },
  headerWrap: { width: "100%" }, headingRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: SPACING.xl }, headingIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }, titleRow: { flexDirection: "row", alignItems: "center", gap: 8 }, title: { color: colors.onSurface, fontSize: FONT["2xl"], fontWeight: "800", fontFamily: FONT_DISPLAY }, sub: { color: colors.muted, marginTop: 3, fontSize: FONT.base },
  warning: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: RADIUS.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, marginBottom: SPACING.lg }, warningText: { color: colors.onSurface2, fontSize: 12, lineHeight: 17, flex: 1 },
  section: { marginBottom: SPACING.xl }, sectionHeading: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }, sectionTitle: { color: colors.onSurface, fontSize: FONT.lg, fontWeight: "800" }, sectionHint: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2, maxWidth: 520 }, sectionCount: { minWidth: 26, height: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: colors.surface2, color: colors.muted, textAlign: "center", lineHeight: 26, fontSize: 12, fontWeight: "800" },
  tripCard: { backgroundColor: colors.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, padding: SPACING.lg, marginBottom: 10 }, matchCard: { width: "100%", backgroundColor: colors.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, padding: SPACING.lg, marginBottom: 12 }, cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }, confirmedPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 9, paddingVertical: 5, borderRadius: RADIUS.pill, backgroundColor: colors.surface2 }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }, confirmedText: { color: colors.success, fontSize: 10, fontWeight: "900", letterSpacing: .5 },
  scorePill: { flexDirection: "row", alignItems: "baseline", gap: 6, backgroundColor: colors.cream, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 6 }, score: { color: colors.onCream, fontSize: 14, fontWeight: "900" }, scoreLabel: { color: colors.onCream, fontSize: 11, fontWeight: "700" }, personLink: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: RADIUS.md, paddingVertical: 4, paddingHorizontal: 2, marginBottom: 8 }, personLinkPressed: { opacity: 0.72 }, personAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }, personAvatarText: { color: colors.indigo, fontSize: 13, fontWeight: "900" }, personName: { color: colors.onSurface, fontSize: FONT.xl, fontWeight: "800", fontFamily: FONT_DISPLAY }, badges: { marginTop: 4 },
  routeBox: { backgroundColor: colors.surface2, borderRadius: RADIUS.md, padding: 13, marginTop: 2 }, routeLine: { flexDirection: "row", alignItems: "center", gap: 10 }, routeDot: { width: 9, height: 9, borderRadius: 5 }, routeStem: { height: 15, width: 2, backgroundColor: colors.borderStrong, marginLeft: 3.5, marginVertical: 2 }, routeText: { flex: 1, color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  timeRow: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 10 }, timeText: { color: colors.muted, fontSize: 12 }, matchMeta: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }, metaItem: { flexDirection: "row", alignItems: "center", gap: 5 }, metaText: { color: colors.muted, fontSize: 12 }, signalLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: .8, marginTop: 13 }, reasons: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 6 }, reasonChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surface2, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8, paddingVertical: 5 }, reasonText: { color: colors.onSurface2, fontSize: 10, fontWeight: "700" },
  tradeoffs: { gap: 6, marginTop: 6 }, tradeoff: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: RADIUS.md, padding: 9, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }, tradeoffText: { flex: 1, color: colors.onSurface2, fontSize: 10, lineHeight: 15 }, notes: { color: colors.onSurface2, lineHeight: 18, fontSize: 12, marginTop: 10 },
  actions: { flexDirection: "row", gap: 8, marginTop: 13 }, matchActions: { flexDirection: "row", gap: 8, marginTop: 14 }, primaryAction: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: colors.indigo, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 10, marginTop: 13 }, primaryActionText: { flexShrink: 1, color: "#fff", fontWeight: "800", fontSize: 13 }, secondaryAction: { minHeight: 42, minWidth: 110, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: 13 }, secondaryActionText: { color: colors.indigo, fontWeight: "900", fontSize: 11 }, iconAction: { flexShrink: 0, width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 21, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginTop: 13 },
  empty: { alignItems: "center", paddingHorizontal: SPACING.xl, paddingVertical: 60, maxWidth: 520, alignSelf: "center" }, emptyIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }, emptyTitle: { color: colors.onSurface, fontSize: FONT.xl, fontWeight: "800", marginTop: 14, textAlign: "center" }, emptySub: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center", marginTop: 6 }, errorState: { flex: 1, maxWidth: 520, alignSelf: "center", alignItems: "center", justifyContent: "center", padding: SPACING.xl }, errorIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
});
