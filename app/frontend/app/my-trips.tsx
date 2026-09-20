import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { Alert } from "@/src/utils/alert";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";

type Trip = {
  pool_id: string;
  from_location?: string;
  to_location?: string;
  travel_datetime?: string;
  status?: string;
  trip_status?: string;
  phase?: string;
  user_name?: string;
  pool_status?: string;
  confirmed_travelers?: any[];
};
type Request = Trip & {
  request_id: string;
  requester_name?: string;
  status: string;
};

const formatDate = (value?: string) => {
  if (!value) return "Date to be confirmed";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })
    : "Date to be confirmed";
};
const isPast = (trip: Trip) => {
  const state = trip.trip_status || trip.phase || trip.status || trip.pool_status;
  return state === "completed" || state === "cancelled" || state === "closed"
    || Boolean(trip.travel_datetime && new Date(trip.travel_datetime).getTime() < Date.now() - 2 * 60 * 60 * 1000);
};

export default function MyTripsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const loaded = useRef(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posted, setPosted] = useState<Trip[]>([]);
  const [outgoing, setOutgoing] = useState<Request[]>([]);
  const [confirmed, setConfirmed] = useState<Trip[]>([]);
  const [incoming, setIncoming] = useState<Request[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!loaded.current && !quiet) setLoading(true);
    else setRefreshing(true);
    const results = await Promise.allSettled([
      api.myPools(), api.myRequests(), api.confirmedMatches(), api.incomingRequests(),
    ]);
    const data = (index: number) => results[index].status === "fulfilled"
      ? (results[index] as PromiseFulfilledResult<any>).value : null;
    if (Array.isArray(data(0))) setPosted(data(0));
    if (Array.isArray(data(1))) setOutgoing(data(1));
    if (Array.isArray(data(2))) setConfirmed(data(2));
    if (Array.isArray(data(3))) setIncoming(data(3));
    const failed = results.filter((result) => result.status === "rejected").length;
    setError(failed ? (failed === results.length ? "Trips couldn't load. Check your connection and retry." : "Some trip details are unavailable. Pull down to retry.") : null);
    loaded.current = true;
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respond = (request: Request, action: "accept" | "decline") => {
    Alert.alert(action === "accept" ? "Accept this traveller?" : "Decline this request?",
      `${request.requester_name || "This traveller"} · ${request.from_location || "From"} → ${request.to_location || "To"}`, [
        { text: "Not now", style: "cancel" },
        { text: action === "accept" ? "Accept" : "Decline", style: action === "decline" ? "destructive" : "default", onPress: async () => {
          if (working) return;
          setWorking(request.request_id);
          try {
            if (action === "accept") await api.acceptRequest(request.request_id);
            else await api.declineRequest(request.request_id);
            await load(true);
          } catch (e: any) {
            Alert.alert("Couldn't update the request", e?.message || "Try again.");
          } finally { setWorking(null); }
        } },
      ]);
  };
  const cancel = (request: Request) => {
    Alert.alert("Cancel your request?", "You can request this ride again if it is still open.", [
      { text: "Keep request", style: "cancel" },
      { text: "Cancel request", style: "destructive", onPress: async () => {
        if (working) return;
        setWorking(request.request_id);
        try { await api.cancelRequest(request.request_id); await load(true); }
        catch (e: any) { Alert.alert("Couldn't cancel the request", e?.message || "Try again."); }
        finally { setWorking(null); }
      } },
    ]);
  };

  const ownedActive = posted.filter((trip) => !isPast(trip));
  const history = posted.filter(isPast);
  const awaiting = outgoing.filter((request) => request.status === "pending" || request.status === "waitlisted");
  const accepted = outgoing.filter((request) => request.status === "accepted");
  const confirmedByPool = new Map<string, Trip>();
  [...accepted, ...confirmed].forEach((trip) => {
    if (trip.pool_id && !posted.some((p) => p.pool_id === trip.pool_id)) {
      confirmedByPool.set(trip.pool_id, { ...confirmedByPool.get(trip.pool_id), ...trip });
    }
  });
  const confirmedTrips = [...confirmedByPool.values()].filter((trip) => !isPast(trip));
  const previousRequests = outgoing.filter((request) => request.status === "declined" || request.status === "cancelled");
  const pastConfirmed = [...confirmedByPool.values()].filter(isPast);
  const pendingIncoming = incoming.filter((request) => request.status === "pending" || request.status === "waitlisted");
  const openTrip = (poolId: string) => router.push(`/pool/${encodeURIComponent(poolId)}` as any);

  const tripCard = (trip: Trip, status: string, action?: React.ReactNode) => (
    <View key={trip.pool_id} style={styles.card}>
      <Pressable style={{ flex: 1 }} onPress={() => openTrip(trip.pool_id)} accessibilityLabel="Open trip details">
        <Text style={styles.route}>{trip.from_location || "From"} → {trip.to_location || "To"}</Text>
        <Text style={styles.meta}>{formatDate(trip.travel_datetime)}</Text>
        <Text style={styles.status}>{status}</Text>
      </Pressable>
      {action || <Pressable onPress={() => openTrip(trip.pool_id)} accessibilityLabel="Open trip"><Ionicons name="chevron-forward" size={20} color={colors.indigo} /></Pressable>}
    </View>
  );

  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Go back"><Ionicons name="chevron-back" size={21} color={colors.onSurface} /></Pressable>
      <View style={{ flex: 1 }}><Text style={styles.eyebrow}>YOUR JOURNEYS</Text><Text style={styles.title}>My Trips</Text></View>
      <Pressable onPress={() => router.push("/notifications" as any)} accessibilityLabel="Open trip notifications" style={styles.back}><Ionicons name="notifications-outline" size={20} color={colors.indigo} /></Pressable>
    </View>
    {loading && !loaded.current ? <View style={styles.center}><ActivityIndicator color={colors.indigo} /><Text style={styles.meta}>Finding your trips…</Text></View>
      : <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.indigo} />}>
        {error ? <Pressable style={styles.warning} onPress={() => load(true)}><Text style={styles.warningText}>{error} Tap to retry.</Text></Pressable> : null}
        <Pressable onPress={() => router.push("/post-request" as any)} style={styles.primary}><Ionicons name="add-circle-outline" size={19} color="#fff" /><Text style={styles.primaryText}>Post a trip</Text></Pressable>
        <Text style={styles.intro}>Everything you have posted, requested or confirmed — with the next action in one place.</Text>

        <Text style={styles.section}>Needs your response · {pendingIncoming.length}</Text>
        {pendingIncoming.length ? pendingIncoming.map((request) => <View key={request.request_id} style={styles.card}>
          <Pressable style={{ flex: 1 }} onPress={() => openTrip(request.pool_id)}>
            <Text style={styles.route}>{request.requester_name || "Traveller"} wants to join</Text>
            <Text style={styles.meta}>{request.from_location || "From"} → {request.to_location || "To"}</Text>
            <Text style={styles.status}>{request.status === "waitlisted" ? "Waitlisted — ride is full" : "Awaiting your decision"}</Text>
          </Pressable>
          <View style={styles.actions}>
            {request.status === "pending" ? <Pressable disabled={Boolean(working)} style={styles.smallPrimary} onPress={() => respond(request, "accept")}><Text style={styles.smallPrimaryText}>Accept</Text></Pressable> : null}
            <Pressable disabled={Boolean(working)} onPress={() => respond(request, "decline")}><Text style={styles.link}>Decline</Text></Pressable>
          </View>
        </View>) : <Text style={styles.empty}>No seat requests need a response.</Text>}

        <Text style={styles.section}>Upcoming confirmed · {confirmedTrips.length}</Text>
        {confirmedTrips.length ? confirmedTrips.map((trip) => tripCard(trip, "Your seat is confirmed · Open trip details")) : <Text style={styles.empty}>Accepted rides will appear here.</Text>}

        <Text style={styles.section}>Requests you've sent · {awaiting.length}</Text>
        {awaiting.length ? awaiting.map((request) => <View key={request.request_id} style={styles.card}>
          <Pressable style={{ flex: 1 }} onPress={() => openTrip(request.pool_id)}>
            <Text style={styles.route}>{request.from_location || "From"} → {request.to_location || "To"}</Text>
            <Text style={styles.meta}>{formatDate(request.travel_datetime)}</Text>
            <Text style={styles.status}>{request.status === "waitlisted" ? "Waitlisted · Not confirmed" : "Pending · Not confirmed"}</Text>
          </Pressable>
          <Pressable disabled={Boolean(working)} onPress={() => cancel(request)}><Text style={styles.link}>Cancel</Text></Pressable>
        </View>) : <Text style={styles.empty}>No pending requests. Find a ride on Home.</Text>}

        <Text style={styles.section}>Trips you've posted · {ownedActive.length}</Text>
        {ownedActive.length ? ownedActive.map((trip) => tripCard(trip, (trip.trip_status || trip.status || "open").replace(/_/g, " ") + " · Manage trip")) : <Text style={styles.empty}>Post a trip to start matching with other travellers.</Text>}

        <Text style={styles.section}>History · {history.length + pastConfirmed.length + previousRequests.length}</Text>
        {[...history, ...pastConfirmed].length ? [...history, ...pastConfirmed].map((trip) => tripCard(trip, trip.trip_status || trip.status || "Past trip")) : null}
        {previousRequests.map((request) => <View key={request.request_id} style={styles.card}><View style={{ flex: 1 }}><Text style={styles.route}>{request.from_location || "From"} → {request.to_location || "To"}</Text><Text style={styles.meta}>{formatDate(request.travel_datetime)}</Text><Text style={styles.status}>Request {request.status}</Text></View><Pressable onPress={() => openTrip(request.pool_id)}><Ionicons name="chevron-forward" size={18} color={colors.indigo} /></Pressable></View>)}
        {!history.length && !pastConfirmed.length && !previousRequests.length ? <Text style={styles.empty}>Your completed trips and request updates will show here.</Text> : null}
      </ScrollView>}
  </SafeAreaView>;
}

const makeStyles = (c: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.surface },
  header: { minHeight: 68, paddingHorizontal: SPACING.lg, backgroundColor: c.card, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: c.saffron, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: c.onSurface, fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: "900" },
  content: { width: "100%", maxWidth: 850, alignSelf: "center", padding: SPACING.lg, paddingBottom: 110 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  intro: { color: c.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  primary: { minHeight: 46, paddingHorizontal: 15, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: c.indigo, marginBottom: 12 },
  primaryText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  section: { marginTop: 22, marginBottom: 8, fontSize: 16, fontWeight: "900", color: c.onSurface },
  card: { minHeight: 86, marginBottom: 8, padding: 13, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, flexDirection: "row", alignItems: "center", gap: 12 },
  route: { color: c.onSurface, fontSize: 13, fontWeight: "900" },
  meta: { color: c.muted, fontSize: 11, marginTop: 5 },
  status: { color: c.indigo, fontSize: 11, marginTop: 5, fontWeight: "700" },
  empty: { color: c.muted, fontSize: 12, lineHeight: 18, paddingVertical: 12 },
  actions: { alignItems: "flex-end", gap: 12 },
  smallPrimary: { backgroundColor: c.indigo, paddingHorizontal: 13, paddingVertical: 9, borderRadius: RADIUS.md },
  smallPrimaryText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  link: { color: c.indigo, fontSize: 11, fontWeight: "900" },
  warning: { padding: 14, borderWidth: 1, borderColor: c.error, borderRadius: RADIUS.md, backgroundColor: c.card },
  warningText: { color: c.error, fontSize: 12 },
});
