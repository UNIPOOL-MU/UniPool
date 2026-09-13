import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { SPACING, RADIUS, FONT, FONT_DISPLAY } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import PressableScale from "@/src/components/PressableScale";
import RatingBadge from "@/src/components/RatingBadge";
import UserBadges from "@/src/components/UserBadges";
import PoolMapView from "@/src/components/PoolMapView";
import { PoolFeedSkeleton } from "@/src/components/Skeleton";
import ReportBlockModal from "@/src/components/ReportBlockModal";

type ConfirmedTraveler = { user_id: string; name: string; email: string };
type Pool = {
  pool_id: string; user_id: string; user_name: string; user_email: string;
  from_location: string; to_location: string;
  from_location_canonical?: string | null; to_location_canonical?: string | null; route_key?: string | null;
  from_coords?: { lat: number; lng: number } | null; to_coords?: { lat: number; lng: number } | null;
  travel_datetime: string; gender_preference: string; companions: number; total_seats?: number; status?: string; trip_status?: string;
  luggage?: string | null; notes?: string | null; match_score?: number; match_label?: string; match_reasons?: string[];
  user_rating_avg?: number | null; user_rating_count?: number; user_badges?: { id: string; label: string; icon: string }[];
  confirmed_travelers?: ConfirmedTraveler[];
  my_request_status?: "pending" | "waitlisted" | "accepted" | "declined" | "cancelled" | null;
};
type Journey = { pool_id: string; from_location: string; to_location: string; travel_datetime: string; phase?: string; seats?: { available: number } };
type ConfirmedRide = { pool_id: string; from_location: string; to_location: string; travel_datetime: string; pool_status?: string; other_user_id?: string; other_user_name?: string; my_role?: "owner" | "traveler" };
type SavedRoute = { saved_route_id: string; route_key?: string; label?: string; from_location: string; to_location: string; active_rides?: number };

const FILTERS = ["All", "Today", "Tomorrow", "This week", "Airport", "Railway"];
function formatDT(iso: string) { return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); }
function dayKey(value: Date | string) { const d = typeof value === "string" ? new Date(value) : value; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function seatSummary(pool: Pool) { const total = Math.max(1, Number(pool.total_seats || 4)); const occupied = 1 + Number(pool.companions || 0) + (pool.confirmed_travelers?.length || 0); return { total, available: Math.max(0, total - occupied) }; }
function future(iso: string) { return new Date(iso).getTime() >= Date.now() - 30 * 60 * 1000; }
function journeyFromConfirmed(ride: ConfirmedRide): Journey { return { pool_id: ride.pool_id, from_location: ride.from_location, to_location: ride.to_location, travel_datetime: ride.travel_datetime, phase: "confirmed" }; }
function journeyFromPool(pool: Pool): Journey { return { pool_id: pool.pool_id, from_location: pool.from_location, to_location: pool.to_location, travel_datetime: pool.travel_datetime, phase: pool.trip_status || ((pool.confirmed_travelers?.length || 0) > 0 ? "confirmed" : "planning"), seats: { available: seatSummary(pool).available } }; }

export default function HomeFeed() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const desktop = width >= 1180;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const loadedOnce = useRef(false);
  const loggedView = useRef(false);
  const [pools, setPools] = useState<Pool[]>([]);
  const [upcoming, setUpcoming] = useState<Journey[]>([]);
  const [recentConfirmed, setRecentConfirmed] = useState<ConfirmedRide | null>(null);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [requesting, setRequesting] = useState<Set<string>>(new Set());
  const [reportTarget, setReportTarget] = useState<{ user_id: string; user_name: string } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!loadedOnce.current && !silent) setLoading(true); else setSyncing(true);
    setError(null);
    const results = await Promise.allSettled([
      api.listPools(),
      api.upcomingJourneys(),
      api.confirmedMatches(),
      api.myPools(),
      api.savedRoutes(),
      api.notifications(true, 1),
    ]);
    const list = results[0].status === "fulfilled" ? (results[0] as PromiseFulfilledResult<Pool[]>).value || [] : null;
    const mobilityJourneys = results[1].status === "fulfilled" ? (results[1] as PromiseFulfilledResult<Journey[]>).value || [] : [];
    const confirmed = results[2].status === "fulfilled" ? (results[2] as PromiseFulfilledResult<ConfirmedRide[]>).value || [] : [];
    const mine = results[3].status === "fulfilled" ? (results[3] as PromiseFulfilledResult<Pool[]>).value || [] : [];
    const saved = results[4].status === "fulfilled" ? (results[4] as PromiseFulfilledResult<SavedRoute[]>).value || [] : null;
    const activity = results[5].status === "fulfilled" ? (results[5] as PromiseFulfilledResult<any>).value : null;

    if (list) setPools(list);
    if (saved) setSavedRoutes(saved);
    if (activity) setUnread(Number(activity.unread || 0));

    const byPool = new Map<string, Journey>();
    mine.filter((pool) => future(pool.travel_datetime) && pool.trip_status !== "cancelled" && pool.trip_status !== "completed").forEach((pool) => byPool.set(pool.pool_id, journeyFromPool(pool)));
    confirmed.filter((ride) => future(ride.travel_datetime)).forEach((ride) => byPool.set(ride.pool_id, journeyFromConfirmed(ride)));
    mobilityJourneys.filter((journey) => future(journey.travel_datetime) && !["cancelled", "completed"].includes(String(journey.phase || ""))).forEach((journey) => byPool.set(journey.pool_id, journey));
    const mergedUpcoming = [...byPool.values()].sort((a, b) => new Date(a.travel_datetime).getTime() - new Date(b.travel_datetime).getTime());
    setUpcoming(mergedUpcoming);

    const recent = [...confirmed]
      .filter((ride) => !future(ride.travel_datetime))
      .sort((a, b) => new Date(b.travel_datetime).getTime() - new Date(a.travel_datetime).getTime())[0] || null;
    setRecentConfirmed(recent);

    if (!list && !loadedOnce.current) setError("We couldn't load rides right now.");
    if (!loggedView.current && list) {
      loggedView.current = true;
      api.recordEvent("home_view", { rides: list.length, has_upcoming: mergedUpcoming.length > 0 }).catch(() => {});
    }
    loadedOnce.current = true;
    setLoading(false); setSyncing(false); setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(loadedOnce.current); }, [load]));

  const sendRequest = useCallback(async (pool: Pool) => {
    const previous = pool.my_request_status || null;
    const optimistic = seatSummary(pool).available > 0 ? "pending" : "waitlisted";
    setRequesting((current) => new Set(current).add(pool.pool_id));
    setPools((current) => current.map((item) => item.pool_id === pool.pool_id ? { ...item, my_request_status: optimistic } : item));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await api.requestToJoin(pool.pool_id);
      const status = result?.status === "waitlisted" ? "waitlisted" : "pending";
      setPools((current) => current.map((item) => item.pool_id === pool.pool_id ? { ...item, my_request_status: status } : item));
      api.recordEvent("ride_request", { pool_id: pool.pool_id, status }).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (status === "waitlisted") Alert.alert("You're on the waitlist", "This ride is full right now. UniPool will move you to pending automatically if a seat opens.");
    } catch (e: any) {
      setPools((current) => current.map((item) => item.pool_id === pool.pool_id ? { ...item, my_request_status: previous as any } : item));
      Alert.alert("Couldn't send request", e?.message || "Please try again.");
    } finally {
      setRequesting((current) => { const next = new Set(current); next.delete(pool.pool_id); return next; });
    }
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const weekOut = Date.now() + 7 * 86400000;
    const query = search.trim().toLowerCase();
    return pools.filter((pool) => {
      const tripTime = new Date(pool.travel_datetime);
      if (filter === "Today" && dayKey(tripTime) !== dayKey(now)) return false;
      if (filter === "Tomorrow" && dayKey(tripTime) !== dayKey(tomorrow)) return false;
      if (filter === "This week" && (tripTime.getTime() < Date.now() || tripTime.getTime() > weekOut)) return false;
      if (filter === "Airport" && !/airport|rgia|rgi|hyd|blr|del|bom|maa|ccu|pnq|goi/i.test(`${pool.from_location} ${pool.to_location}`)) return false;
      if (filter === "Railway" && !/railway|station|junction|jn\b|secunderabad|nampally|kacheguda|ndls/i.test(`${pool.from_location} ${pool.to_location}`)) return false;
      if (query && !`${pool.from_location} ${pool.to_location} ${pool.user_name}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [pools, filter, search]);

  const forYou = useMemo(() => pools.filter((pool) => pool.user_id !== user?.user_id && Number(pool.match_score || 0) >= 60).sort((a, b) => Number(b.match_score || 0) - Number(a.match_score || 0)).slice(0, 4), [pools, user?.user_id]);
  const leavingSoon = useMemo(() => pools.filter((pool) => { const ms = new Date(pool.travel_datetime).getTime() - Date.now(); return ms > 0 && ms <= 2 * 3600000; }).length, [pools]);
  const nextJourney = upcoming[0];
  const savedActive = savedRoutes.reduce((sum, route) => sum + Number(route.active_rides || 0), 0);

  const openPool = (pool: Pool) => {
    api.recordEvent("pool_open", { pool_id: pool.pool_id, source: "home", match_score: pool.match_score || null }).catch(() => {});
    router.push({ pathname: "/pool/[poolId]", params: { poolId: pool.pool_id } });
  };

  const nextTripCard = nextJourney ? <Pressable onPress={() => router.push(`/pool/${nextJourney.pool_id}` as any)} style={styles.nextTrip} accessibilityLabel={`Open next journey from ${nextJourney.from_location} to ${nextJourney.to_location}`}>
    <View style={styles.nextTripIcon}><Ionicons name="navigate" size={20} color={colors.indigo} /></View>
    <View style={{ flex: 1 }}><Text style={styles.nextLabel}>NEXT TRIP · {formatDT(nextJourney.travel_datetime)}</Text><Text numberOfLines={1} style={styles.nextRoute}>{nextJourney.from_location} → {nextJourney.to_location}</Text></View>
    <View style={styles.phaseChip}><Text style={styles.phaseText}>{(nextJourney.phase || "planning").replace(/_/g, " ")}</Text></View>
    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
  </Pressable> : null;

  const recentTripCard = recentConfirmed ? <Pressable onPress={() => router.push(`/pool/${recentConfirmed.pool_id}` as any)} style={styles.railCard}>
    <View style={styles.railIcon}><Ionicons name="checkmark-circle-outline" size={20} color={colors.success} /></View>
    <Text style={styles.railEyebrow}>RECENT CONFIRMED TRIP</Text>
    <Text style={styles.railTitle}>{recentConfirmed.from_location} → {recentConfirmed.to_location}</Text>
    <Text style={styles.railEmpty}>{formatDT(recentConfirmed.travel_datetime)}{recentConfirmed.other_user_name ? ` · with ${recentConfirmed.other_user_name.split(" ")[0]}` : ""}</Text>
  </Pressable> : null;

  const top = <View style={styles.top}>
    <View style={styles.greetingRow}>
      <View style={{ flex: 1 }}><Text style={styles.eyebrow}>UNIPOOL</Text><View style={styles.greetingLine}><Text style={styles.greeting}>Hi, {user?.name?.split(" ")[0] || "traveller"}</Text>{syncing ? <ActivityIndicator size="small" color={colors.indigo} /> : null}</View><Text style={styles.subtitle}>Your next journey, strongest matches and live student routes.</Text></View>
      <View style={styles.headerActions}><Pressable accessibilityLabel={showMap ? "Show ride list" : "Show rides on map"} onPress={() => { Haptics.selectionAsync(); setShowMap((value) => !value); }} style={[styles.iconButton, showMap && styles.iconButtonActive]}><Ionicons name={showMap ? "list-outline" : "map-outline"} size={19} color={showMap ? "#fff" : colors.indigo} /></Pressable><Pressable accessibilityLabel="Open Explore" onPress={() => router.push("/(tabs)/plan")} style={styles.iconButton}><Ionicons name="compass-outline" size={19} color={colors.saffron} /></Pressable></View>
    </View>

    {!desktop ? nextTripCard : null}
    {!desktop ? <View style={styles.smartStats}><Pressable onPress={() => router.push("/(tabs)/matches")} style={styles.smartStat}><Ionicons name="sparkles-outline" size={16} color={colors.indigo} /><Text style={styles.smartValue}>{forYou.length}</Text><Text style={styles.smartLabel}>strong matches</Text></Pressable><Pressable onPress={() => setFilter("Today")} style={styles.smartStat}><Ionicons name="time-outline" size={16} color={colors.saffron} /><Text style={styles.smartValue}>{leavingSoon}</Text><Text style={styles.smartLabel}>leaving soon</Text></Pressable><Pressable onPress={() => router.push("/(tabs)/plan")} style={styles.smartStat}><Ionicons name="notifications-outline" size={16} color={colors.success} /><Text style={styles.smartValue}>{savedActive}</Text><Text style={styles.smartLabel}>saved-route rides</Text></Pressable></View> : null}

    {forYou.length > 0 ? <View style={styles.forYouSection}><View style={styles.sectionRow}><View><Text style={styles.sectionTitle}>Best for you</Text><Text style={styles.sectionSub}>Ranked by the real UniPool compatibility engine.</Text></View><Pressable onPress={() => router.push("/(tabs)/matches")}><Text style={styles.seeAll}>See matches</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.matchRail}>{forYou.map((pool) => <Pressable key={`best-${pool.pool_id}`} onPress={() => openPool(pool)} style={styles.matchCard}><View style={styles.matchTop}><Text style={styles.matchScore}>{Math.round(Number(pool.match_score || 0))}%</Text><Text style={styles.matchLabel}>{pool.match_label || "Good fit"}</Text></View><Text numberOfLines={1} style={styles.matchRoute}>{pool.from_location}</Text><Ionicons name="arrow-down" size={13} color={colors.muted} /><Text numberOfLines={1} style={styles.matchRoute}>{pool.to_location}</Text><Text style={styles.matchWhen}>{formatDT(pool.travel_datetime)}</Text>{pool.match_reasons?.length ? <Text numberOfLines={2} style={styles.matchReasons}>{pool.match_reasons.slice(0, 2).join(" · ")}</Text> : null}</Pressable>)}</ScrollView></View> : null}

    <View style={styles.searchBox}><Ionicons name="search-outline" size={18} color={colors.muted} /><TextInput testID="pool-search" value={search} onChangeText={setSearch} placeholder="Search a route or traveller" placeholderTextColor={colors.muted} style={styles.searchInput} />{search ? <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Clear ride search"><Ionicons name="close-circle" size={18} color={colors.muted} /></Pressable> : null}</View>
    {!desktop ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{FILTERS.map((item) => { const active = item === filter; return <Pressable key={item} testID={`chip-${item.toLowerCase().replace(" ", "-")}`} onPress={() => { setFilter(item); Haptics.selectionAsync(); }} style={[styles.filterChip, active && styles.filterChipActive]}><Text style={[styles.filterText, active && styles.filterTextActive]}>{item}</Text></Pressable>; })}</ScrollView> : null}
    {!desktop && !loading && !error ? <View style={styles.resultsRow}><Text style={styles.resultsText}>{filtered.length} {filtered.length === 1 ? "ride" : "rides"}</Text>{(search || filter !== "All") ? <Pressable onPress={() => { setSearch(""); setFilter("All"); }}><Text style={styles.clearText}>Reset</Text></Pressable> : null}</View> : null}
  </View>;

  const emptyState = <View style={styles.stateCard}><View style={styles.stateIcon}><Ionicons name="navigate-outline" size={25} color={colors.indigo} /></View><Text style={styles.stateTitle}>{search || filter !== "All" ? "No rides match that filter" : "No open rides yet"}</Text><Text style={styles.stateText}>{search || filter !== "All" ? "Try another route or reset the filters." : "Post your journey and UniPool will start looking for compatible travellers."}</Text>{!search && filter === "All" ? <Pressable onPress={() => router.push("/post-request")} style={styles.retryButton}><Ionicons name="add" size={16} color="#fff" /><Text style={styles.retryText}>Post a trip</Text></Pressable> : null}</View>;

  const desktopBody = <ScrollView contentContainerStyle={styles.desktopPage} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.indigo} />}>
    {top}
    <View style={styles.desktopLayout}>
      <View style={styles.leftRail}>
        <View style={styles.railCard}><Text style={styles.railEyebrow}>FILTER RIDES</Text><View style={styles.verticalFilters}>{FILTERS.map((item) => { const active = item === filter; return <Pressable key={`desktop-${item}`} onPress={() => setFilter(item)} style={[styles.verticalFilter, active && styles.verticalFilterActive]}><Text style={[styles.verticalFilterText, active && styles.verticalFilterTextActive]}>{item}</Text>{active ? <Ionicons name="checkmark" size={14} color={colors.indigo} /> : null}</Pressable>; })}</View></View>
        {savedRoutes.length ? <View style={styles.railCard}><View style={styles.railHeading}><Text style={styles.railEyebrow}>SAVED ROUTES</Text><Pressable onPress={() => router.push("/(tabs)/plan")}><Text style={styles.seeAll}>Manage</Text></Pressable></View>{savedRoutes.slice(0, 5).map((route) => <Pressable key={route.saved_route_id} onPress={() => setSearch(`${route.from_location} ${route.to_location}`)} style={styles.railRoute}><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.railRouteTitle}>{route.label || `${route.from_location} → ${route.to_location}`}</Text><Text style={styles.railRouteSub}>{route.active_rides || 0} active rides</Text></View><Ionicons name="chevron-forward" size={15} color={colors.muted} /></Pressable>)}</View> : <Pressable onPress={() => router.push("/(tabs)/plan")} style={styles.railCard}><Text style={styles.railEyebrow}>SAVED ROUTES</Text><Text style={styles.railTitle}>Watch a regular route</Text><Text style={styles.railEmpty}>Open Explore to save a route and get relevant ride alerts.</Text></Pressable>}
      </View>

      <View style={styles.centerFeed}><View style={styles.desktopFeedHeading}><View><Text style={styles.sectionTitle}>Live rides</Text><Text style={styles.sectionSub}>{filtered.length} {filtered.length === 1 ? "journey" : "journeys"} matching this view</Text></View>{(search || filter !== "All") ? <Pressable onPress={() => { setSearch(""); setFilter("All"); }}><Text style={styles.clearText}>Reset</Text></Pressable> : null}</View>{filtered.length ? filtered.map((item) => <PoolCard key={item.pool_id} pool={item} mine={item.user_id === user?.user_id} busy={requesting.has(item.pool_id)} onOpen={() => openPool(item)} onRequest={() => sendRequest(item)} onReport={() => setReportTarget({ user_id: item.user_id, user_name: item.user_name })} colors={colors} styles={styles} />) : emptyState}</View>

      <View style={styles.rightRail}>
        {nextTripCard || recentTripCard || <Pressable onPress={() => router.push("/post-request")} style={styles.railCard}><View style={styles.railIcon}><Ionicons name="calendar-outline" size={20} color={colors.indigo} /></View><Text style={styles.railTitle}>No upcoming trip</Text><Text style={styles.railEmpty}>Post a journey to start matching.</Text><Text style={styles.seeAll}>Post trip →</Text></Pressable>}
        <Pressable onPress={() => router.push("/notifications" as any)} style={styles.railCard}><View style={styles.railHeading}><View style={styles.railIcon}><Ionicons name={unread ? "notifications" : "notifications-outline"} size={19} color={unread ? colors.saffron : colors.indigo} /></View>{unread ? <View style={styles.unreadPill}><Text style={styles.unreadText}>{unread}</Text></View> : null}</View><Text style={styles.railTitle}>{unread ? `${unread} unread update${unread === 1 ? "" : "s"}` : "You're caught up"}</Text><Text style={styles.railEmpty}>Requests, matches, trip changes and chat activity.</Text></Pressable>
        <View style={styles.railCard}><Text style={styles.railEyebrow}>LIVE NETWORK</Text><View style={styles.networkStat}><Ionicons name="sparkles-outline" size={15} color={colors.indigo} /><Text style={styles.networkValue}>{forYou.length}</Text><Text style={styles.networkLabel}>strong matches</Text></View><View style={styles.networkStat}><Ionicons name="time-outline" size={15} color={colors.saffron} /><Text style={styles.networkValue}>{leavingSoon}</Text><Text style={styles.networkLabel}>leaving soon</Text></View><View style={styles.networkStat}><Ionicons name="bookmark-outline" size={15} color={colors.success} /><Text style={styles.networkValue}>{savedActive}</Text><Text style={styles.networkLabel}>saved-route rides</Text></View></View>
      </View>
    </View>
  </ScrollView>;

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    {loading && !loadedOnce.current ? <ScrollView contentContainerStyle={desktop ? styles.desktopPage : styles.page}>{top}<PoolFeedSkeleton count={3} /></ScrollView> : error && pools.length === 0 ? <ScrollView contentContainerStyle={desktop ? styles.desktopPage : styles.page}>{top}<View style={styles.stateCard}><View style={styles.stateIcon}><Ionicons name="cloud-offline-outline" size={25} color={colors.error} /></View><Text style={styles.stateTitle}>Rides couldn't load</Text><Text style={styles.stateText}>{error}</Text><Pressable onPress={() => load(false)} style={styles.retryButton}><Ionicons name="refresh" size={16} color="#fff" /><Text style={styles.retryText}>Try again</Text></Pressable></View></ScrollView> : showMap ? <View style={styles.mapPage}>{top}<View style={styles.mapWrap}><PoolMapView pools={filtered} /></View></View> : desktop ? desktopBody : <FlatList data={filtered} keyExtractor={(item) => item.pool_id} contentContainerStyle={styles.listPage} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.indigo} />} ListHeaderComponent={top} ListEmptyComponent={emptyState} renderItem={({ item }) => <PoolCard pool={item} mine={item.user_id === user?.user_id} busy={requesting.has(item.pool_id)} onOpen={() => openPool(item)} onRequest={() => sendRequest(item)} onReport={() => setReportTarget({ user_id: item.user_id, user_name: item.user_name })} colors={colors} styles={styles} />}/>} 

    <PressableScale testID="create-pool-fab" accessibilityLabel="Post a trip" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); api.recordEvent("post_trip_start", { source: "home_fab" }).catch(() => {}); router.push("/post-request"); }} style={styles.fab} scaleTo={0.96}><Ionicons name="add" size={20} color="#fff" /><Text style={styles.fabText}>Post trip</Text></PressableScale>
    {reportTarget ? <ReportBlockModal visible onClose={() => setReportTarget(null)} userId={reportTarget.user_id} userName={reportTarget.user_name} onBlocked={() => load(true)} /> : null}
  </SafeAreaView>;
}

function PoolCard({ pool, mine, busy, onOpen, onRequest, onReport, colors, styles }: any) {
  const travelers = pool.confirmed_travelers || [];
  const score = Number(pool.match_score || 0);
  const seats = seatSummary(pool);
  const seatText = seats.available ? `${seats.available} seat${seats.available === 1 ? "" : "s"} left` : mine ? "Full" : "Waitlist";
  return <Pressable testID={`pool-card-${pool.pool_id}`} accessibilityRole="button" accessibilityLabel={`${pool.from_location} to ${pool.to_location}, ${seatText}`} onPress={onOpen} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
    <View style={styles.cardHeader}><View style={styles.person}><View style={styles.avatar}><Text style={styles.avatarText}>{pool.user_name?.[0]?.toUpperCase() || "U"}</Text></View><View style={{ flex: 1 }}><View style={styles.nameRow}><Text style={styles.name}>{pool.user_name}{mine ? " · You" : ""}</Text>{!mine && score > 0 ? <View style={styles.matchPill}><Text style={styles.matchPillText}>{score}% match</Text></View> : null}</View><View style={styles.identityRow}><RatingBadge avg={pool.user_rating_avg} count={pool.user_rating_count} /><UserBadges badges={pool.user_badges} compact /></View></View></View>{!mine ? <Pressable accessibilityLabel={`More actions for ${pool.user_name}`} onPress={(event: any) => { event.stopPropagation?.(); onReport(); }} hitSlop={10}><Ionicons name="ellipsis-horizontal" size={19} color={colors.muted} /></Pressable> : null}</View>
    <View style={styles.routeBox}><View style={styles.routeRow}><View style={[styles.routeDot, { backgroundColor: colors.saffron }]} /><Text style={styles.routeText} numberOfLines={1}>{pool.from_location_canonical || pool.from_location}</Text></View><View style={styles.routeStem} /><View style={styles.routeRow}><View style={[styles.routeDot, { backgroundColor: colors.indigo }]} /><Text style={styles.routeText} numberOfLines={1}>{pool.to_location_canonical || pool.to_location}</Text></View></View>
    <View style={styles.detailRow}><View style={styles.detail}><Ionicons name="time-outline" size={14} color={colors.muted} /><Text style={styles.detailText}>{formatDT(pool.travel_datetime)}</Text></View><View style={styles.detail}><Ionicons name="people-outline" size={14} color={seats.available ? colors.muted : colors.saffron} /><Text style={styles.detailText}>{seatText}</Text></View>{pool.luggage ? <View style={styles.detail}><Ionicons name="bag-handle-outline" size={14} color={colors.muted} /><Text style={styles.detailText}>{pool.luggage}</Text></View> : null}</View>
    {pool.match_reasons?.length && !mine ? <View style={styles.reasonRow}>{pool.match_reasons.slice(0, 3).map((reason: string) => <View key={reason} style={styles.reasonPill}><Text style={styles.reasonText}>{reason}</Text></View>)}</View> : null}
    {pool.notes ? <Text style={styles.notes} numberOfLines={2}>{pool.notes}</Text> : null}
    {travelers.length > 0 ? <View style={styles.travelTogether}><Ionicons name="people-circle-outline" size={16} color={colors.success} /><Text style={styles.travelTogetherText} numberOfLines={1}>{travelers.map((traveller: ConfirmedTraveler) => traveller.name.split(" ")[0]).join(", ")} confirmed</Text></View> : null}
    {!mine ? <RequestButton pool={pool} busy={busy} onRequest={onRequest} colors={colors} styles={styles} /> : <View style={styles.ownTrip}><Text style={styles.ownTripText}>Your trip</Text><Ionicons name="chevron-forward" size={16} color={colors.muted} /></View>}
  </Pressable>;
}

function RequestButton({ pool, busy, onRequest, colors, styles }: any) {
  if (pool.my_request_status === "accepted") return <View style={styles.accepted}><Ionicons name="checkmark-circle" size={17} color={colors.success} /><Text style={styles.acceptedText}>You're travelling together</Text></View>;
  if (pool.my_request_status === "waitlisted") return <View style={styles.waitlisted}><Ionicons name="hourglass-outline" size={16} color={colors.saffron} /><Text style={styles.waitlistedText}>You're on the waitlist</Text></View>;
  if (pool.my_request_status === "pending") return <View style={styles.pending}><Ionicons name="time-outline" size={16} color={colors.indigo} /><Text style={styles.pendingText}>Request sent</Text></View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={pool.my_request_status === "declined" ? "Request to join again" : "Request to join this ride"} onPress={(event: any) => { event.stopPropagation?.(); onRequest(); }} disabled={busy} style={[styles.requestButton, busy && { opacity: .6 }]}>{busy ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="person-add-outline" size={16} color="#fff" /><Text style={styles.requestText}>{pool.my_request_status === "declined" ? "Request again" : "Request to join"}</Text></>}</Pressable>;
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  page: { width: "100%", maxWidth: 940, alignSelf: "center", padding: SPACING.lg, paddingBottom: 130 },
  listPage: { width: "100%", maxWidth: 940, alignSelf: "center", padding: SPACING.lg, paddingBottom: 130 },
  desktopPage: { width: "100%", maxWidth: 1500, alignSelf: "center", paddingHorizontal: 28, paddingTop: 22, paddingBottom: 130 },
  desktopLayout: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  leftRail: { width: 230, gap: 12 },
  centerFeed: { flex: 1, minWidth: 0, maxWidth: 760 },
  rightRail: { width: 280, gap: 12 },
  desktopFeedHeading: { minHeight: 46, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  railCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: 13 },
  railHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  railEyebrow: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: .9, marginTop: 8 },
  railIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  railTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "900", marginTop: 8 },
  railEmpty: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  verticalFilters: { gap: 4, marginTop: 8 },
  verticalFilter: { minHeight: 39, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  verticalFilterActive: { backgroundColor: colors.surface2 },
  verticalFilterText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  verticalFilterTextActive: { color: colors.onSurface, fontWeight: "900" },
  railRoute: { minHeight: 48, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  railRouteTitle: { color: colors.onSurface, fontSize: 10, fontWeight: "900" },
  railRouteSub: { color: colors.muted, fontSize: 8, marginTop: 2 },
  unreadPill: { minWidth: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.error },
  unreadText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  networkStat: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 34, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  networkValue: { color: colors.onSurface, fontSize: 13, fontWeight: "900" },
  networkLabel: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  mapPage: { flex: 1, width: "100%", maxWidth: 1240, alignSelf: "center", padding: SPACING.lg, paddingBottom: 100 },
  mapWrap: { flex: 1, minHeight: 360, borderRadius: RADIUS.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  top: { width: "100%", marginBottom: 18 },
  greetingRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }, greetingLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: { color: colors.saffron, fontSize: 10, letterSpacing: 1.3, fontWeight: "900" }, greeting: { color: colors.onSurface, fontFamily: FONT_DISPLAY, fontSize: FONT["2xl"], fontWeight: "900", marginTop: 2 }, subtitle: { color: colors.muted, fontSize: 13, marginTop: 3 },
  headerActions: { flexDirection: "row", gap: 8 }, iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, iconButtonActive: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  nextTrip: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: 12, marginBottom: 10 }, nextTripIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, nextLabel: { color: colors.saffron, fontSize: 8, fontWeight: "900", letterSpacing: .7 }, nextRoute: { color: colors.onSurface, fontSize: 12, fontWeight: "900", marginTop: 2 }, phaseChip: { maxWidth: 90, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: colors.surface2 }, phaseText: { color: colors.success, fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  smartStats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }, smartStat: { flexGrow: 1, flexBasis: 150, minHeight: 62, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.md, paddingHorizontal: 11 }, smartValue: { color: colors.onSurface, fontSize: 16, fontWeight: "900" }, smartLabel: { flex: 1, color: colors.muted, fontSize: 9, lineHeight: 12, fontWeight: "700" },
  forYouSection: { marginBottom: 16 }, sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 }, sectionTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "900" }, sectionSub: { color: colors.muted, fontSize: 9, marginTop: 2 }, seeAll: { color: colors.indigo, fontSize: 10, fontWeight: "900", marginTop: 8 }, matchRail: { gap: 8, paddingBottom: 2 }, matchCard: { width: 210, minHeight: 150, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: 12 }, matchTop: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 9 }, matchScore: { color: colors.indigo, fontSize: 16, fontWeight: "900" }, matchLabel: { color: colors.muted, fontSize: 9, fontWeight: "800" }, matchRoute: { color: colors.onSurface, fontSize: 11, fontWeight: "900", marginVertical: 3 }, matchWhen: { color: colors.muted, fontSize: 9, marginTop: 8 }, matchReasons: { color: colors.saffron, fontSize: 8, lineHeight: 12, fontWeight: "800", marginTop: 5 },
  searchBox: { height: 48, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: colors.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14 }, searchInput: { flex: 1, color: colors.onSurface, fontSize: 14, outlineStyle: "none" } as any, filterRow: { gap: 8, paddingTop: 12, paddingBottom: 3 }, filterChip: { minHeight: 34, justifyContent: "center", paddingHorizontal: 13, borderRadius: RADIUS.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, filterChipActive: { backgroundColor: colors.cream, borderColor: colors.saffron }, filterText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, filterTextActive: { color: colors.onCream, fontWeight: "900" }, resultsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }, resultsText: { color: colors.muted, fontSize: 12, fontWeight: "700" }, clearText: { color: colors.indigo, fontSize: 11, fontWeight: "900" },
  card: { backgroundColor: colors.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, padding: 15, marginBottom: 10 }, cardPressed: { transform: [{ scale: .997 }], opacity: .96 }, cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }, person: { flex: 1, flexDirection: "row", gap: 10, alignItems: "center" }, avatar: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, avatarText: { color: colors.indigo, fontSize: 14, fontWeight: "900" }, nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }, name: { color: colors.onSurface, fontWeight: "900", fontSize: 12 }, identityRow: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 3 }, matchPill: { borderRadius: 11, backgroundColor: colors.cream, paddingHorizontal: 7, paddingVertical: 3 }, matchPillText: { color: colors.onCream, fontSize: 8, fontWeight: "900" },
  routeBox: { marginTop: 14, paddingVertical: 3 }, routeRow: { flexDirection: "row", alignItems: "center", gap: 9 }, routeDot: { width: 8, height: 8, borderRadius: 4 }, routeText: { flex: 1, color: colors.onSurface, fontSize: 13, fontWeight: "800" }, routeStem: { width: 1, height: 15, backgroundColor: colors.borderStrong, marginLeft: 3.5, marginVertical: 3 }, detailRow: { flexDirection: "row", gap: 12, flexWrap: "wrap", marginTop: 12 }, detail: { flexDirection: "row", alignItems: "center", gap: 4 }, detailText: { color: colors.muted, fontSize: 10, fontWeight: "700" }, reasonRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10 }, reasonPill: { backgroundColor: colors.surface2, borderRadius: 11, paddingHorizontal: 7, paddingVertical: 4 }, reasonText: { color: colors.muted, fontSize: 8, fontWeight: "800" }, notes: { color: colors.onSurface2, fontSize: 10, lineHeight: 15, marginTop: 10 }, travelTogether: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10 }, travelTogetherText: { flex: 1, color: colors.success, fontSize: 9, fontWeight: "800" },
  requestButton: { minHeight: 39, marginTop: 13, borderRadius: 20, backgroundColor: colors.indigo, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, requestText: { color: "#fff", fontSize: 11, fontWeight: "900" }, accepted: { minHeight: 39, marginTop: 13, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, acceptedText: { color: colors.success, fontSize: 10, fontWeight: "900" }, waitlisted: { minHeight: 39, marginTop: 13, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, waitlistedText: { color: colors.saffron, fontSize: 10, fontWeight: "900" }, pending: { minHeight: 39, marginTop: 13, borderRadius: 20, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }, pendingText: { color: colors.indigo, fontSize: 10, fontWeight: "900" }, ownTrip: { minHeight: 36, marginTop: 13, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }, ownTripText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  stateCard: { minHeight: 220, alignItems: "center", justifyContent: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: 20 }, stateIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", marginBottom: 10 }, stateTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "900", textAlign: "center" }, stateText: { color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 5, maxWidth: 380 }, retryButton: { minHeight: 38, borderRadius: 19, backgroundColor: colors.indigo, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, marginTop: 12 }, retryText: { color: "#fff", fontWeight: "900", fontSize: 10 },
  fab: { position: "absolute", right: 20, bottom: 88, minHeight: 46, borderRadius: 23, paddingHorizontal: 16, backgroundColor: colors.saffron, flexDirection: "row", alignItems: "center", gap: 7, shadowColor: "#000", shadowOpacity: .18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }, fabText: { color: "#fff", fontSize: 11, fontWeight: "900" },
});