import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { Alert } from "@/src/utils/alert";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";

export default function AdminScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const allowed = Boolean(user?.is_admin || user?.email?.toLowerCase() === "utkarsh7023340530@gmail.com");
  const [people, setPeople] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [peopleResult, statsResult, poolsResult] = await Promise.allSettled([api.adminPeople(), api.adminStats(), api.adminPools()]);
    if (peopleResult.status === "fulfilled") setPeople(Array.isArray(peopleResult.value) ? peopleResult.value : []);
    if (statsResult.status === "fulfilled") setStats(statsResult.value);
    if (poolsResult.status === "fulfilled") setPools(poolsResult.value || []);
    const failures = [peopleResult, statsResult, poolsResult].filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => {
      const reason = result.reason as any;
      return `${reason?.message || "Request failed"}${reason?.status ? ` (${reason.status})` : ""}`;
    });
    if (failures.length) setLoadError(failures.join(" · "));
    setLoading(false);
  }, []);
  useEffect(() => { if (allowed) load(); else setLoading(false); }, [allowed, load]);

  if (!allowed) return <SafeAreaView style={styles.safe}><View style={styles.center}><Ionicons name="lock-closed-outline" size={32} color={colors.error} /><Text style={styles.title}>Admin access required</Text><Pressable onPress={() => router.back()}><Text style={styles.link}>Go back</Text></Pressable></View></SafeAreaView>;
  const filtered = people.filter((p) => `${p.name || ""} ${p.email || ""} ${p.username || ""} ${p.branch_name || ""}`.toLowerCase().includes(query.toLowerCase()));
  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.onSurface} /></Pressable><View><Text style={styles.eyebrow}>ADMIN CONTROL CENTRE</Text><Text style={styles.title}>People & moderation</Text><Text style={styles.sub}>Review everyone on UniPool and manage active travel queries.</Text></View></View>
    {stats ? <View style={styles.stats}>{[["People", stats.total_users], ["Open queries", stats.open_pools], ["Closed", stats.closed_pools]].map(([label, value]) => <View key={String(label)} style={styles.stat}><Text style={styles.statValue}>{String(value ?? 0)}</Text><Text style={styles.statLabel}>{label}</Text></View>)}</View> : null}
    {loadError ? <View style={styles.errorCard}><Ionicons name="warning-outline" size={20} color={colors.error} /><View style={{ flex: 1 }}><Text style={styles.errorTitle}>Some admin data could not load</Text><Text style={styles.errorText}>{loadError}</Text></View><Pressable onPress={load} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View> : null}
    <View style={styles.sectionHead}><View><Text style={styles.eyebrow}>DIRECTORY</Text><Text style={styles.sectionTitle}>{people.length} registered people</Text></View><Pressable onPress={load}><Ionicons name="refresh" size={20} color={colors.indigo} /></Pressable></View>
    <View style={styles.search}><Ionicons name="search" size={18} color={colors.indigo} /><TextInput value={query} onChangeText={setQuery} placeholder="Filter by name, email or branch" placeholderTextColor={colors.muted} style={styles.input} /></View>
    {loading ? <ActivityIndicator color={colors.indigo} style={{ marginTop: 40 }} /> : filtered.map((person) => <Pressable key={person.user_id} onPress={() => router.push({ pathname: "/network", params: { userId: person.user_id, name: person.name || "Traveller" } } as any)} style={styles.person}><View style={styles.avatar}><Text style={styles.avatarText}>{String(person.name || "S").slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.name}>{person.name || person.username || "Traveller"}</Text><Text style={styles.meta}>{person.email || "No email"}{person.college_verified ? " · MU verified" : ""}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>)}
    {!loading && !filtered.length ? <Text style={styles.empty}>No people match this filter.</Text> : null}
    <Text style={[styles.eyebrow, { marginTop: 28 }]}>ACTIVE QUERIES</Text>{pools.map((pool) => <View key={pool.pool_id} style={styles.person}><View style={{ flex: 1 }}><Text style={styles.name}>{pool.from_location} → {pool.to_location}</Text><Text style={styles.meta}>{pool.user_name || pool.user_email || "Traveller"} · {pool.status || "open"}</Text></View><Pressable onPress={async () => { try { await api.adminDeletePool(pool.pool_id); await load(); } catch (e: any) { Alert.alert("Could not remove query", e?.message || "Try again."); } }}><Ionicons name="trash-outline" size={19} color={colors.error} /></Pressable></View>)}
  </ScrollView></SafeAreaView>;
}

const makeStyles = (c: any) => StyleSheet.create({ safe: { flex: 1, backgroundColor: c.surface }, page: { width: "100%", maxWidth: 980, alignSelf: "center", padding: SPACING.lg, paddingBottom: 120 }, header: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 24 }, back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }, eyebrow: { color: c.saffron, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }, title: { color: c.onSurface, fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: "900", marginTop: 3 }, sub: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }, stats: { flexDirection: "row", gap: 10, marginBottom: 24 }, stat: { flex: 1, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.md, padding: 14 }, statValue: { color: c.onSurface, fontSize: 22, fontWeight: "900" }, statLabel: { color: c.muted, fontSize: 10, marginTop: 3 }, sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }, sectionTitle: { color: c.onSurface, fontSize: 17, fontWeight: "900", marginTop: 3 }, search: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 52, paddingHorizontal: 13, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.md, marginBottom: 12 }, input: { flex: 1, minWidth: 0, color: c.onSurface, fontSize: 13, outlineStyle: "none" } as any, person: { flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.md, padding: 13, marginBottom: 8 }, avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, avatarText: { color: c.indigo, fontWeight: "900", fontSize: 16 }, name: { color: c.onSurface, fontWeight: "900", fontSize: 13 }, meta: { color: c.muted, fontSize: 10, marginTop: 3 }, empty: { color: c.muted, textAlign: "center", padding: 35 }, errorCard: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: c.error, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md, backgroundColor: c.card }, errorTitle: { color: c.onSurface, fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: "700" }, errorText: { color: c.muted, fontSize: 12, marginTop: 3, flexShrink: 1 }, retry: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: c.indigo }, retryText: { color: c.onPrimary, fontWeight: "700", fontSize: 12 }, center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, link: { color: c.indigo, fontWeight: "900" } });
