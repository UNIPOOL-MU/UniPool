import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { peopleApi } from "@/src/api/people";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { RADIUS, SPACING } from "@/src/theme";

const RECENT_KEY = "unipool.search.recent.v1";
const EMPTY = { locations: [], rides: [], people: [], chats: [] };
const LOCAL_PLACES = [
  { id: "mu", name: "Mahindra University", short_name: "MU", city: "Hyderabad", kind: "university", aliases: ["mu", "mahindra", "campus"] },
  { id: "hyd", name: "Rajiv Gandhi International Airport", short_name: "RGIA · HYD", city: "Hyderabad", kind: "airport", aliases: ["rgia", "rgi airport", "hyd", "hyd airport", "hyderabad airport", "shamshabad"] },
  { id: "sc", name: "Secunderabad Junction", short_name: "SC", city: "Hyderabad", kind: "railway", aliases: ["secunderabad", "sec bad", "sc station", "secunderabad station"] },
  { id: "hyb", name: "Hyderabad Deccan (Nampally)", short_name: "HYB", city: "Hyderabad", kind: "railway", aliases: ["nampally", "hyderabad deccan", "hyb"] },
  { id: "kcg", name: "Kacheguda Railway Station", short_name: "KCG", city: "Hyderabad", kind: "railway", aliases: ["kacheguda", "kcg"] },
  { id: "del", name: "Indira Gandhi International Airport", short_name: "IGIA · DEL", city: "Delhi", kind: "airport", aliases: ["igia", "del", "del airport", "delhi airport"] },
  { id: "iitd", name: "IIT Delhi", short_name: "IITD", city: "Delhi", kind: "university", aliases: ["iitd", "iit delhi"] },
  { id: "ndls", name: "New Delhi Railway Station", short_name: "NDLS", city: "Delhi", kind: "railway", aliases: ["ndls", "new delhi station"] },
];

function parseRecent(raw: any): string[] { try { const value = JSON.parse(String(raw || "[]")); return Array.isArray(value) ? value.filter((x) => typeof x === "string").slice(0, 6) : []; } catch { return []; } }
function localMatches(q: string) { const n = q.trim().toLowerCase(); if (n.length < 2) return []; return LOCAL_PLACES.filter((p) => p.name.toLowerCase().includes(n) || p.short_name.toLowerCase().includes(n) || p.aliases.some((a) => a.includes(n) || n.includes(a))).slice(0, 5); }

export default function GlobalSearchPalette({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(EMPTY);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) { setQ(""); setResults(EMPTY); return; }
    storage.secureGet(RECENT_KEY, "[]").then((raw) => setRecent(parseRecent(raw)));
  }, [visible]);

  useEffect(() => {
    if (!visible || q.trim().length < 2) { setResults(EMPTY); return; }
    const handle = setTimeout(async () => {
      setLoading(true);
      const local = localMatches(q);
      try {
        const [serverResult, peopleResult] = await Promise.allSettled([api.globalSearch(q.trim()), peopleApi.search(q.trim())]);
        const server = serverResult.status === "fulfilled" ? serverResult.value : EMPTY;
        const directoryPeople = peopleResult.status === "fulfilled" ? peopleResult.value : [];
        const people = [...(server.people || []), ...(directoryPeople || [])].filter((person: any, index: number, all: any[]) => person?.user_id && all.findIndex((candidate) => candidate.user_id === person.user_id) === index);
        const existing = new Set((server.locations || []).map((x: any) => x.id || x.name));
        setResults({ ...server, people, locations: [...(server.locations || []), ...local.filter((x) => !existing.has(x.id) && !existing.has(x.name))] });
      } catch { setResults({ ...EMPTY, locations: local }); }
      finally { setLoading(false); }
    }, 170);
    return () => clearTimeout(handle);
  }, [q, visible]);

  if (Platform.OS !== "web") return null;
  const remember = (term: string) => { const clean = term.trim(); if (clean.length < 2) return; const next = [clean, ...recent.filter((x) => x.toLowerCase() !== clean.toLowerCase())].slice(0, 6); setRecent(next); storage.secureSet(RECENT_KEY, JSON.stringify(next)); };
  const go = (path: any) => { remember(q); onClose(); router.push(path); };
  const hasResults = Object.values(results).some((items: any) => items?.length);

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}><Pressable style={styles.panel} onPress={(e) => e.stopPropagation?.()}>
      <View style={styles.searchRow}><Ionicons name="search" size={21} color={colors.indigo} /><TextInput autoFocus value={q} onChangeText={setQ} placeholder="Search rides, people, places or chats…" placeholderTextColor={colors.muted} style={styles.input} /></View>
      <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
        {q.trim().length < 2 ? <View style={styles.start}><Text style={styles.groupLabel}>RECENT</Text>{recent.length ? <View style={styles.chips}>{recent.map((term) => <Pressable key={term} onPress={() => setQ(term)} style={styles.chip}><Ionicons name="time-outline" size={14} color={colors.muted} /><Text style={styles.chipText}>{term}</Text></Pressable>)}</View> : <Hint icon="search-outline" text="Search routes, airport or station codes, students and trip chats." styles={styles} colors={colors} />}<Text style={[styles.groupLabel, { marginTop: 16 }]}>QUICK PLACES</Text><View style={styles.chips}>{["RGIA", "MU", "Secunderabad", "Nampally", "IGIA", "IITD"].map((term) => <Pressable key={term} onPress={() => setQ(term)} style={styles.chip}><Text style={styles.chipText}>{term}</Text></Pressable>)}</View></View> : loading ? <View style={styles.loading}><ActivityIndicator color={colors.indigo} /><Text style={styles.muted}>Searching UniPool…</Text></View> : !hasResults ? <Hint icon="search-outline" text="No result yet. Try an airport code, station nickname, route or student name." styles={styles} colors={colors} /> : <>
          <Group title="Places" items={results.locations} render={(item: any) => <Result key={item.id || item.name} icon={item.kind === "airport" ? "airplane" : item.kind === "railway" ? "train" : item.kind === "university" ? "school" : "location"} title={item.name} sub={[item.short_name, item.city].filter(Boolean).join(" · ")} onPress={() => go({ pathname: "/post-request", params: { from: item.name } })} styles={styles} colors={colors} />} />
          <Group title="Rides" items={results.rides} render={(item: any) => <Result key={item.pool_id} icon="car-outline" title={`${item.from_location} → ${item.to_location}`} sub={`${item.user_name || "Traveller"} · ${new Date(item.travel_datetime).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`} onPress={() => go(`/pool/${item.pool_id}`)} styles={styles} colors={colors} />} />
          <Group title="People" items={results.people} render={(item: any) => <Result key={item.user_id} icon="person-outline" title={item.name} sub={[item.username ? `@${item.username}` : null, item.college_verified ? "Verified student" : null, item.branch_name].filter(Boolean).join(" · ")} onPress={() => go({ pathname: "/network", params: { userId: item.user_id, name: item.name } })} styles={styles} colors={colors} />} />
          <Group title="Chats" items={results.chats} render={(item: any) => <Result key={item.conversation_id} icon="chatbubbles-outline" title={item.name || "Trip chat"} sub="Open conversation" onPress={() => go(`/chat/group/${item.conversation_id}`)} styles={styles} colors={colors} />} />
        </>}
      </ScrollView>
      <View style={styles.footer}><Text style={styles.footerText}>Understands common UniPool aliases like RGIA, HYD, Nampally, NDLS and MU.</Text></View>
    </Pressable></Pressable>
  </Modal>;
}

function Group({ title, items, render }: any) { if (!items?.length) return null; return <View style={{ marginBottom: 14 }}><Text style={{ fontSize: 10, fontWeight: "900", letterSpacing: 1, opacity: .65, marginHorizontal: 14, marginBottom: 6 }}>{title.toUpperCase()}</Text>{items.map(render)}</View>; }
function Result({ icon, title, sub, onPress, styles, colors }: any) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.result, pressed && { backgroundColor: colors.surface2 }]}><View style={styles.resultIcon}><Ionicons name={icon} size={18} color={colors.indigo} /></View><View style={{ flex: 1 }}><Text numberOfLines={1} style={styles.resultTitle}>{title}</Text>{sub ? <Text numberOfLines={1} style={styles.resultSub}>{sub}</Text> : null}</View><Ionicons name="arrow-forward" size={16} color={colors.muted} /></Pressable>; }
function Hint({ icon, text, styles, colors }: any) { return <View style={styles.hint}><View style={styles.resultIcon}><Ionicons name={icon} size={20} color={colors.indigo} /></View><Text style={styles.muted}>{text}</Text></View>; }

const makeStyles = (colors: any) => StyleSheet.create({ backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.42)", alignItems: "center", paddingTop: 92, paddingHorizontal: SPACING.lg }, panel: { width: "100%", maxWidth: 690, maxHeight: 650, backgroundColor: colors.card, borderRadius: 24, borderWidth: 1, borderColor: colors.border, overflow: "hidden", shadowColor: "#000", shadowOpacity: .24, shadowRadius: 28, shadowOffset: { width: 0, height: 14 } }, searchRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: colors.border }, input: { flex: 1, color: colors.onSurface, fontSize: 16, outlineStyle: "none" } as any, results: { minHeight: 180, maxHeight: 500, paddingVertical: 12 }, loading: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 9 }, hint: { minHeight: 120, padding: 24, alignItems: "center", justifyContent: "center", gap: 10 }, muted: { color: colors.muted, fontSize: 11 }, start: { paddingHorizontal: 14, paddingVertical: 6 }, groupLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 }, chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 8 }, chip: { minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 5 }, chipText: { color: colors.onSurface, fontSize: 10, fontWeight: "800" }, result: { minHeight: 60, marginHorizontal: 8, borderRadius: RADIUS.md, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 11 }, resultIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }, resultTitle: { color: colors.onSurface, fontSize: 13, fontWeight: "800" }, resultSub: { color: colors.muted, fontSize: 10, marginTop: 2 }, footer: { minHeight: 40, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 }, footerText: { color: colors.muted, fontSize: 10, textAlign: "center" } });
