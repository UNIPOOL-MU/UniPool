import PersonName from "@/src/components/PersonName";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { DirectoryPerson, peopleApi } from "@/src/api/people";
import { useAuth } from "@/src/auth/AuthContext";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";

type Person = DirectoryPerson;

function normalize(value: any): Person[] {
  const rows = Array.isArray(value) ? value : Array.isArray(value?.people) ? value.people : [];
  return rows.filter((p: any) => p?.user_id).map((p: any) => ({ ...p, name: p.name || p.username || "Student" }));
}

export default function PeopleScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [savedPeople, setSavedPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSaved = useCallback(async () => {
    try { setSavedPeople(normalize(await peopleApi.saved())); }
    catch { setSavedPeople([]); }
    finally { setSavedLoading(false); }
  }, []);

  useEffect(() => { loadSaved(); }, [loadSaved]);

  const search = async (raw = query) => {
    const q = raw.trim();
    if (q.length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true); setError(null); setSearched(true);
    try {
      const rows = normalize(await peopleApi.search(q));
      setResults(rows.filter((p) => p.user_id !== user?.user_id));
    } catch {
      try {
        const rows = normalize(await api.globalSearch(q));
        setResults(rows.filter((p) => p.user_id !== user?.user_id));
      } catch {
        setResults([]);
        setError("Student search is temporarily unavailable.");
      }
    } finally { setLoading(false); }
  };

  const toggleSaved = async (person: Person) => {
    if (savingId) return;
    const currentlySaved = Boolean(person.saved || savedPeople.some((p) => p.user_id === person.user_id));
    setSavingId(person.user_id);
    setResults((prev) => prev.map((p) => p.user_id === person.user_id ? { ...p, saved: !currentlySaved } : p));
    setSavedPeople((prev) => currentlySaved ? prev.filter((p) => p.user_id !== person.user_id) : [{ ...person, saved: true }, ...prev.filter((p) => p.user_id !== person.user_id)]);
    try {
      if (currentlySaved) await peopleApi.unsavePerson(person.user_id);
      else await peopleApi.savePerson(person.user_id);
    } catch (e: any) {
      setResults((prev) => prev.map((p) => p.user_id === person.user_id ? { ...p, saved: currentlySaved } : p));
      await loadSaved();
      Alert.alert("Couldn't update saved people", e?.message || "Please try again.");
    } finally { setSavingId(null); }
  };

  const visible = searched ? results : savedPeople;

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={styles.eyebrow}>STUDENT NETWORK</Text><Text style={styles.title}>Find people on UniPool</Text><Text style={styles.sub}>Search by name, email, username, branch or batch. Save useful contacts and use real trip feedback as trust context where available.</Text></View></View>

    <View style={styles.searchBox}><Ionicons name="search" size={20} color={colors.indigo} /><TextInput value={query} onChangeText={(v) => { setQuery(v); if (v.trim().length < 2) { setResults([]); setSearched(false); setError(null); } }} onSubmitEditing={() => search()} returnKeyType="search" autoCapitalize="none" placeholder="Name, email, branch, batch…" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={query.trim().length < 2 || loading} onPress={() => search()} style={[styles.searchBtn, (query.trim().length < 2 || loading) && { opacity: .5 }]}>{loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.searchBtnText}>Search</Text>}</Pressable></View>

    <View style={styles.tip}><Ionicons name="shield-checkmark-outline" size={18} color={colors.saffron} /><Text style={styles.tipText}>Trust context is based on actual UniPool trip feedback when it exists. UniPool does not invent a score for students with no feedback history.</Text></View>

    {!searched ? <View style={styles.listHeader}><View><Text style={styles.listEyebrow}>SAVED PEOPLE</Text><Text style={styles.listTitle}>{savedLoading ? "Loading…" : savedPeople.length ? `${savedPeople.length} saved` : "No saved students yet"}</Text></View>{savedPeople.length ? <Pressable onPress={loadSaved}><Ionicons name="refresh" size={18} color={colors.indigo} /></Pressable> : null}</View> : null}

    {error ? <View style={styles.state}><Ionicons name="cloud-offline-outline" size={26} color={colors.error} /><Text style={styles.stateTitle}>Search unavailable</Text><Text style={styles.stateSub}>{error}</Text><Pressable onPress={() => search()}><Text style={styles.retry}>Try again</Text></Pressable></View> : searched && !loading && !results.length ? <View style={styles.state}><Ionicons name="person-add-outline" size={28} color={colors.indigo} /><Text style={styles.stateTitle}>No UniPool account found</Text><Text style={styles.stateSub}>If this is someone you want in a Circle, open that Circle and invite them by email.</Text></View> : !searched && !savedLoading && !savedPeople.length ? <View style={styles.state}><Ionicons name="bookmark-outline" size={28} color={colors.indigo} /><Text style={styles.stateTitle}>Save people you travel with</Text><Text style={styles.stateSub}>Search for a student and tap the bookmark. Saved people stay easy to find without exposing extra private information.</Text></View> : null}

    <View style={styles.grid}>{visible.map((person) => {
      const isSaved = Boolean(person.saved || savedPeople.some((p) => p.user_id === person.user_id));
      const trust = person.trust;
      return <View key={person.user_id} style={styles.card}>
        <View style={styles.personTop}><View style={styles.avatar}><Text style={styles.avatarText}>{String(person.name || "S").slice(0,1).toUpperCase()}</Text></View><View style={{ flex: 1, minWidth: 0 }}><View style={styles.nameRow}><PersonName userId={person.user_id} name={person.name} numberOfLines={1} style={styles.name} />{person.college_verified ? <Ionicons name="shield-checkmark" size={16} color={colors.indigo} /> : null}</View><Text numberOfLines={1} style={styles.meta}>{person.username ? `@${person.username}` : person.email || "UniPool student"}</Text></View><Pressable disabled={savingId === person.user_id} onPress={() => toggleSaved(person)} style={[styles.bookmark, isSaved && styles.bookmarkActive]} accessibilityLabel={isSaved ? "Remove saved person" : "Save person"}>{savingId === person.user_id ? <ActivityIndicator size="small" color={isSaved ? "#fff" : colors.indigo} /> : <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={17} color={isSaved ? "#fff" : colors.indigo} />}</Pressable></View>
        {(person.school_name || person.branch_name || person.batch_year || (trust?.overall != null && trust.count > 0)) ? <View style={styles.context}>{person.school_name ? <Tag text={person.school_name} styles={styles} /> : null}{person.branch_name ? <Tag text={person.branch_name} styles={styles} /> : null}{person.batch_year ? <Tag text={`Batch ${person.batch_year}`} styles={styles} /> : null}{trust?.overall != null && trust.count > 0 ? <Tag text={`${trust.overall.toFixed(1)}/5 trip trust · ${trust.count}`} styles={styles} accent /> : null}</View> : null}
        <View style={styles.actions}><Pressable onPress={() => router.push({ pathname: "/chat/[userId]", params: { userId: person.user_id, name: person.name || "Student" } } as any)} style={styles.primary}><Ionicons name="chatbubble-outline" size={16} color="#fff" /><Text style={styles.primaryText}>Message</Text></Pressable><Pressable onPress={() => router.push({ pathname: "/network", params: { userId: person.user_id } } as any)} style={styles.secondary}><Ionicons name="git-network-outline" size={16} color={colors.indigo} /><Text style={styles.secondaryText}>Context</Text></Pressable></View>
      </View>;
    })}</View>
  </ScrollView></SafeAreaView>;
}

function Tag({ text, styles, accent = false }: { text: string; styles: any; accent?: boolean }) { return <View style={[styles.tag, accent && styles.tagAccent]}><Text numberOfLines={1} style={[styles.tagText, accent && styles.tagAccentText]}>{text}</Text></View>; }

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface }, page: { width: "100%", maxWidth: 980, alignSelf: "center", padding: SPACING.lg, paddingBottom: 130 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 20 }, back: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.saffron, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 }, title: { color: colors.onSurface, fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: "900", marginTop: 3 }, sub: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 58, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, paddingHorizontal: 14 }, input: { flex: 1, minWidth: 0, color: colors.onSurface, fontSize: 14, outlineStyle: "none" } as any,
  searchBtn: { minHeight: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: colors.indigo, alignItems: "center", justifyContent: "center" }, searchBtnText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  tip: { flexDirection: "row", alignItems: "flex-start", gap: 9, padding: 13, marginTop: 12, borderRadius: RADIUS.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }, tipText: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 16 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 22, marginBottom: 2 }, listEyebrow: { color: colors.saffron, fontSize: 9, fontWeight: "900", letterSpacing: 1 }, listTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "900", marginTop: 3 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 18 }, card: { flexGrow: 1, flexBasis: 300, maxWidth: 470, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: 15 }, personTop: { flexDirection: "row", alignItems: "center", gap: 11 }, avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }, avatarText: { color: colors.indigo, fontSize: 17, fontWeight: "900" }, nameRow: { flexDirection: "row", alignItems: "center", gap: 5 }, name: { color: colors.onSurface, fontSize: 14, fontWeight: "900", flexShrink: 1 }, meta: { color: colors.muted, fontSize: 10, marginTop: 2 },
  bookmark: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }, bookmarkActive: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  context: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }, tag: { maxWidth: "100%", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.surface2 }, tagText: { color: colors.muted, fontSize: 9, fontWeight: "800" }, tagAccent: { borderWidth: 1, borderColor: colors.indigo }, tagAccentText: { color: colors.indigo },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 }, primary: { flex: 1, minHeight: 39, borderRadius: 20, backgroundColor: colors.indigo, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#fff", fontWeight: "900", fontSize: 10 }, secondary: { flex: 1, minHeight: 39, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }, secondaryText: { color: colors.indigo, fontWeight: "900", fontSize: 10 },
  state: { alignItems: "center", paddingVertical: 55, paddingHorizontal: 20 }, stateTitle: { color: colors.onSurface, fontWeight: "900", fontSize: 16, marginTop: 9 }, stateSub: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 4, maxWidth: 440 }, retry: { color: colors.indigo, fontWeight: "900", marginTop: 10, fontSize: 11 },
});
