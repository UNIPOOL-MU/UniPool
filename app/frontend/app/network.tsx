import PersonName from "@/src/components/PersonName";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { peopleApi } from "@/src/api/people";
import { api } from "@/src/api/client";
import { feedbackApi, FeedbackSummary } from "@/src/api/feedback";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { RADIUS, SPACING, FONT_DISPLAY } from "@/src/theme";

type Reliability = { score: number; label: string; completed_trips: number; average_rating?: number | null; rating_count: number; response_rate?: number | null; cancellation_rate: number };
type PublicRating = { average?: number | null; count?: number; rides_completed?: number; badges?: any[] };

export default function TravelNetworkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string; name?: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const otherUserId = params.userId || null;
  const [loading, setLoading] = useState(true);
  const [reliability, setReliability] = useState<Reliability | null>(null);
  const [publicRating, setPublicRating] = useState<PublicRating | null>(null);
  const [structured, setStructured] = useState<FeedbackSummary | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileFallback, setProfileFallback] = useState(false);
  const [context, setContext] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setProfile(null); setProfileError(null); setProfileFallback(false);
    try {
      if (otherUserId) {
        const [rel, ctx, feedback, person, ratings] = await Promise.allSettled([api.userReliability(otherUserId), api.mutualContext(otherUserId), feedbackApi.summary(otherUserId), peopleApi.profile(otherUserId), api.getUserRatings(otherUserId)]);
        const contextValue = ctx.status === "fulfilled" ? ctx.value : null;
        const directoryProfile = person.status === "fulfilled" ? person.value : null;
        const authoritativeProfile = contextValue?.profile;
        if (authoritativeProfile && (authoritativeProfile.college_verified || !directoryProfile)) setProfile(authoritativeProfile);
        else if (directoryProfile) setProfile(directoryProfile);
        else { setProfile({ user_id: otherUserId, name: params.name || "Traveller" }); setProfileFallback(true); }
        setProfileError(null);
        setReliability(rel.status === "fulfilled" ? rel.value : null);
        setContext(contextValue);
        setStructured(feedback.status === "fulfilled" ? feedback.value : null);
        setPublicRating(ratings.status === "fulfilled" ? ratings.value : null);
        setHistory([]);
      } else {
        const [rel, trips] = await Promise.all([api.myReliability(), api.travelHistory(60)]);
        setReliability(rel); setPublicRating(null); setHistory(trips || []); setContext(null); setStructured(null);
      }
    } catch { setProfileError("Could not load profile. Please try again."); } finally { setLoading(false); }
  }, [otherUserId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const repeatTrip = (trip: any) => {
    api.recordEvent("repeat_trip_start", { source: "travel_network" }).catch(() => {});
    router.push({ pathname: "/post-request", params: { from: trip.from_location, to: trip.to_location } });
  };

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={21} color={colors.onSurface} /></Pressable>
      <View style={{ flex: 1 }}><Text style={styles.eyebrow}>{otherUserId ? "TRAVELLER CONTEXT" : "YOUR NETWORK"}</Text><Text style={styles.title}>{otherUserId ? profile?.name || params.name || "Traveller" : "Travel history & reliability"}</Text></View>
      {otherUserId ? <Pressable onPress={() => router.push({ pathname: "/chat/[userId]", params: { userId: otherUserId, name: params.name || "Traveller" } })} style={styles.chatBtn}><Ionicons name="chatbubble-outline" size={18} color={colors.indigo} /></Pressable> : null}
    </View>

    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.indigo} /><Text style={styles.muted}>Building travel context…</Text></View> : <ScrollView contentContainerStyle={styles.content}>
      {otherUserId ? <View style={styles.contextCard}><Text style={styles.sectionTitle}>Basic details</Text>{profileError ? <><Text style={styles.muted}>{profileError}</Text><Pressable accessibilityLabel="Retry profile" onPress={load}><Text style={styles.repeatText}>Try again</Text></Pressable></> : <><>{profile?.picture ? <Image accessibilityLabel="Profile photo" source={{ uri: profile.picture }} style={{ width: 64, height: 64, borderRadius: 32, marginBottom: 10 }} /> : null}</><Text style={styles.cardTitle}>{profile?.name || params.name || "Traveller"}</Text>{profile?.username ? <Text style={styles.muted}>@{profile.username}</Text> : null}<Text style={styles.muted}>{profile?.college_verified ? "MU ID verified" : profileFallback ? "Basic profile details are not available yet" : "University ID not verified"}</Text>{[profile?.school_name, profile?.program_name, profile?.branch_name, profile?.batch_year ? `Batch ${profile.batch_year}` : null].filter(Boolean).map((detail: string) => <Text key={detail} style={styles.muted}>{detail}</Text>)}</>}</View> : null}
      {!otherUserId && reliability ? <View style={styles.scoreCard}><View style={styles.scoreCircle}><Text style={styles.score}>{reliability.score}</Text><Text style={styles.scoreUnit}>/100</Text></View><View style={{ flex: 1 }}><Text style={styles.scoreLabel}>{reliability.label}</Text><Text style={styles.scoreSub}>This private self-view combines your completed travel, ratings, request responses and cancellations.</Text></View></View> : null}

      {otherUserId ? <View style={styles.trustCard}><View style={styles.trustTop}><View style={styles.trustIcon}><Ionicons name="shield-checkmark-outline" size={22} color={colors.indigo} /></View><View style={{ flex: 1 }}><Text style={styles.scoreLabel}>Trip feedback</Text><Text style={styles.scoreSub}>{structured?.count ? `${structured.count} completed-trip feedback record${structured.count === 1 ? "" : "s"}.` : "No structured trip feedback yet. UniPool does not invent a public score."}</Text></View>{structured?.overall != null && structured.count > 0 ? <View style={styles.overall}><Text style={styles.overallValue}>{structured.overall.toFixed(1)}</Text><Text style={styles.overallUnit}>/5</Text></View> : null}</View>{structured?.count ? <View style={styles.trustGrid}><TrustMetric label="Punctuality" value={structured.punctuality} styles={styles} /><TrustMetric label="Coordination" value={structured.coordination} styles={styles} /><TrustMetric label="Behaviour" value={structured.behaviour} styles={styles} /></View> : null}</View> : null}

      {otherUserId ? <View style={styles.publicProfileCard}><Text style={styles.sectionTitle}>Travel profile</Text><Text style={styles.muted}>Public signals from completed UniPool trips</Text><View style={styles.metricGrid}><Metric icon="car-outline" label="Completed trips" value={publicRating?.rides_completed != null ? String(publicRating.rides_completed) : reliability?.completed_trips != null ? String(reliability.completed_trips) : "—"} colors={colors} styles={styles} /><Metric icon="star-outline" label="Trip rating" value={publicRating?.average != null ? `${Number(publicRating.average).toFixed(1)}/10` : reliability?.average_rating != null ? `${reliability.average_rating}/10` : "New"} colors={colors} styles={styles} /><Metric icon="chatbubble-ellipses-outline" label="Reviews" value={String(publicRating?.count ?? reliability?.rating_count ?? 0)} colors={colors} styles={styles} /></View>{publicRating?.badges?.length ? <Text style={styles.badgeText}>{publicRating.badges.map((badge: any) => badge.name || badge.label || badge).join(" · ")}</Text> : null}</View> : reliability ? <View style={styles.metricGrid}><Metric icon="car-outline" label="Completed" value={String(reliability.completed_trips)} colors={colors} styles={styles} /><Metric icon="star-outline" label="Legacy rating" value={reliability.average_rating == null ? "New" : `${reliability.average_rating}/10`} colors={colors} styles={styles} /><Metric icon="flash-outline" label="Response" value={reliability.response_rate == null ? "—" : `${reliability.response_rate}%`} colors={colors} styles={styles} /><Metric icon="close-circle-outline" label="Cancellation" value={`${reliability.cancellation_rate}%`} colors={colors} styles={styles} /></View> : null}

      {otherUserId ? <>
        <Text style={styles.sectionTitle}>Why this person may feel familiar</Text>
        <View style={styles.contextCard}>
          {(context?.academic || []).map((item: string) => <Pill key={item} icon="school-outline" text={item} colors={colors} styles={styles} />)}
          {context?.shared_trips > 0 ? <Pill icon="car-sport-outline" text={`${context.shared_trips} past trip${context.shared_trips === 1 ? "" : "s"} together`} colors={colors} styles={styles} /> : null}
          {(context?.mutual_travellers || []).map((person: any) => <Text key={person.user_id} style={styles.pillText}>Both travelled with <PersonName userId={person.user_id} name={person.name} /></Text>)}
          {!(context?.academic?.length || context?.shared_trips || context?.mutual_travellers?.length) ? <Text style={styles.muted}>No shared academic or travel context yet. Treat a new connection as new rather than inferring trust.</Text> : null}
        </View>
      </> : <>
        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Past trips</Text><Text style={styles.muted}>{history.length} shown</Text></View>
        {history.length === 0 ? <View style={styles.empty}><Ionicons name="trail-sign-outline" size={25} color={colors.indigo} /><Text style={styles.cardTitle}>Your travel history starts after completed rides</Text><Text style={styles.muted}>Trips are only counted once they are genuinely completed.</Text></View> : <View style={styles.stack}>{history.map((trip) => <View key={trip.pool_id} style={styles.tripCard}><Pressable onPress={() => router.push(`/pool/${trip.pool_id}` as any)} style={styles.tripMain}><View style={styles.tripTop}><View style={styles.tripIcon}><Ionicons name="navigate" size={15} color={colors.indigo} /></View><Text style={styles.tripDate}>{new Date(trip.travel_datetime).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</Text></View><Text style={styles.route}>{trip.from_location} → {trip.to_location}</Text><Text style={styles.muted}>{(trip.co_travellers || []).length ? <>With {(trip.co_travellers || []).map((person: any, index: number) => <React.Fragment key={person.user_id}>{index ? ", " : ""}<PersonName userId={person.user_id} name={person.name}>{person.name?.split(" ")[0]}</PersonName></React.Fragment>)}</> : "Solo listing"}</Text></Pressable><View style={styles.tripActions}><Pressable onPress={() => router.push(`/pool/${trip.pool_id}` as any)} style={styles.smallAction}><Ionicons name="receipt-outline" size={14} color={colors.muted} /><Text style={styles.smallActionText}>Details</Text></Pressable><Pressable onPress={() => repeatTrip(trip)} style={styles.repeatButton}><Ionicons name="repeat" size={14} color={colors.saffron} /><Text style={styles.repeatText}>Repeat route</Text></Pressable></View></View>)}</View>}
      </>}
    </ScrollView>}
  </SafeAreaView>;
}

function Metric({ icon, label, value, colors, styles }: any) { return <View style={styles.metric}><Ionicons name={icon} size={17} color={colors.indigo} /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function TrustMetric({ label, value, styles }: any) { return <View style={styles.trustMetric}><Text style={styles.trustValue}>{value == null ? "—" : Number(value).toFixed(1)}</Text><Text style={styles.trustLabel}>{label}</Text></View>; }
function Pill({ icon, text, colors, styles }: any) { return <View style={styles.pill}><Ionicons name={icon} size={15} color={colors.success} /><Text style={styles.pillText}>{text}</Text></View>; }

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface }, header: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: SPACING.lg, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }, back: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }, chatBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }, eyebrow: { color: colors.saffron, fontSize: 8, fontWeight: "900", letterSpacing: 1 }, title: { color: colors.onSurface, fontSize: 16, fontWeight: "900", fontFamily: FONT_DISPLAY, marginTop: 2 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }, content: { width: "100%", maxWidth: 820, alignSelf: "center", padding: SPACING.lg, paddingBottom: 100 }, muted: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  scoreCard: { flexDirection: "row", gap: 16, alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 18, marginBottom: 10 }, scoreCircle: { width: 78, height: 78, borderRadius: 39, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2, borderWidth: 3, borderColor: colors.success }, score: { color: colors.onSurface, fontSize: 27, fontWeight: "900" }, scoreUnit: { color: colors.muted, fontSize: 8, fontWeight: "800", marginTop: -3 }, scoreLabel: { color: colors.onSurface, fontSize: 18, fontWeight: "900" }, scoreSub: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  trustCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: 16, marginBottom: 10 }, trustTop: { flexDirection: "row", alignItems: "center", gap: 11 }, trustIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }, overall: { alignItems: "flex-end" }, overallValue: { color: colors.onSurface, fontSize: 23, fontWeight: "900" }, overallUnit: { color: colors.muted, fontSize: 8, fontWeight: "800" }, trustGrid: { flexDirection: "row", gap: 7, marginTop: 13 }, trustMetric: { flex: 1, backgroundColor: colors.surface2, borderRadius: 13, padding: 10 }, trustValue: { color: colors.onSurface, fontSize: 17, fontWeight: "900" }, trustLabel: { color: colors.muted, fontSize: 8, fontWeight: "800", marginTop: 3 },
  publicProfileCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: 13, marginBottom: 10 }, badgeText: { color: colors.saffron, fontSize: 10, fontWeight: "800", marginTop: 2 }, metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 24 }, metric: { flexGrow: 1, flexBasis: 140, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: 13, gap: 5 }, metricValue: { color: colors.onSurface, fontSize: 17, fontWeight: "900" }, metricLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", textTransform: "uppercase" }, sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }, sectionTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "900", marginBottom: 9 }, contextCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: 13, gap: 8 }, pill: { flexDirection: "row", alignItems: "center", gap: 7, padding: 9, borderRadius: 12, backgroundColor: colors.surface2 }, pillText: { color: colors.onSurface, fontSize: 11, fontWeight: "800" }, stack: { gap: 9 }, tripCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, overflow: "hidden" }, tripMain: { padding: 13 }, tripTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, tripIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }, tripDate: { color: colors.muted, fontSize: 9, fontWeight: "800" }, route: { color: colors.onSurface, fontSize: 13, fontWeight: "900", marginVertical: 11 }, tripActions: { minHeight: 45, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7, paddingHorizontal: 10 }, smallAction: { minHeight: 31, paddingHorizontal: 9, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surface2 }, smallActionText: { color: colors.muted, fontSize: 9, fontWeight: "800" }, repeatButton: { minHeight: 31, paddingHorizontal: 10, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surface2 }, repeatText: { color: colors.saffron, fontSize: 9, fontWeight: "900" }, empty: { minHeight: 150, alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: 20 }, cardTitle: { color: colors.onSurface, fontSize: 12, fontWeight: "900", textAlign: "center" },
});
