import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { sharedApi } from "@/src/api/shared";
import { utilityApi } from "@/src/api/utility";
import { RADIUS, SPACING } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import SocialShareSheet, { SharePayload } from "@/src/components/SocialShareSheet";

type Convo = { kind: "direct" | "group"; other_user_id?: string; conversation_id?: string; name: string; last_message: string; unread: number; members_count?: number; last_at?: string };
const HOME = "https://uni-pool-five.vercel.app";
const convoKey = (item: Convo) => item.kind === "group" ? `group-${item.conversation_id}` : `direct-${item.other_user_id}`;

export default function FloatingChatLauncher() {
  const { width } = useWindowDimensions(); const pathname = usePathname(); const router = useRouter(); const { colors } = useTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false); const [loading, setLoading] = useState(false); const [items, setItems] = useState<Convo[]>([]); const [shareOpen, setShareOpen] = useState(false); const [sharePayload, setSharePayload] = useState<SharePayload>({ title: "Share UniPool ride", text: "Check out this UniPool ride.", url: HOME }); const [shareBusy, setShareBusy] = useState(false);
  const visible = Platform.OS === "web" && width >= 1000 && !pathname.startsWith("/chat/") && pathname !== "/";
  const poolId = pathname.startsWith("/pool/") ? decodeURIComponent(pathname.split("/")[2] || "") : "";
  const unread = items.reduce((sum, item) => sum + Number(item.unread || 0), 0);

  const load = async () => {
    setLoading(true);
    try {
      const [sharedResult, legacyResult, relationsResult] = await Promise.allSettled([sharedApi.listConversations(), api.listConversations(), utilityApi.relations()]);
      const restricted = new Set<string>(); if (relationsResult.status === "fulfilled") for (const relation of relationsResult.value || []) if (relation.relation === "restricted" && relation.user_id) restricted.add(relation.user_id);
      const merged = new Map<string, Convo>();
      if (legacyResult.status === "fulfilled") for (const item of legacyResult.value || []) merged.set(convoKey(item), item);
      if (sharedResult.status === "fulfilled") for (const item of sharedResult.value || []) if (item.kind === "direct") merged.set(convoKey(item), item);
      setItems([...merged.values()].filter((item) => item.kind === "group" || !item.other_user_id || !restricted.has(item.other_user_id)).sort((a, b) => new Date(b.last_at || 0).getTime() - new Date(a.last_at || 0).getTime()).slice(0, 5));
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { if (!visible) return; const timer = setTimeout(load, 900); return () => clearTimeout(timer); }, [visible]);
  useEffect(() => { if (open) load(); }, [open]);
  if (!visible) return null;

  const openConversation = (item: Convo) => { setOpen(false); if (item.kind === "group" && item.conversation_id) router.push(`/chat/group/${item.conversation_id}` as any); else if (item.other_user_id) router.push({ pathname: "/chat/[userId]", params: { userId: item.other_user_id, name: item.name } } as any); };
  const shareRide = async () => {
    if (!poolId || shareBusy) return; setShareBusy(true);
    try { const pool = await api.getPool(poolId); const when = new Date(pool.travel_datetime).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }); setSharePayload({ title: "Share UniPool ride", text: `${pool.from_location} → ${pool.to_location} on ${when}. Join or share this verified-student ride on UniPool.`, url: `${HOME}/pool/${poolId}` }); setShareOpen(true); }
    catch { setSharePayload({ title: "Share UniPool ride", text: "Check out this ride on UniPool.", url: `${HOME}/pool/${poolId}` }); setShareOpen(true); }
    finally { setShareBusy(false); }
  };

  return <View pointerEvents="box-none" style={styles.layer}>{open ? <View style={styles.panel}>
    <View style={styles.panelHead}><View><Text style={styles.title}>Quick chats</Text><Text style={styles.sub}>Recent ride conversations</Text></View><Pressable onPress={() => setOpen(false)} hitSlop={10}><Ionicons name="close" size={18} color={colors.muted} /></Pressable></View>
    {loading && items.length === 0 ? <View style={styles.loading}><ActivityIndicator color={colors.indigo} /></View> : items.length ? items.map((item) => <Pressable key={convoKey(item)} onPress={() => openConversation(item)} style={styles.row}><View style={styles.avatar}><Ionicons name={item.kind === "group" ? "people" : "person"} size={16} color={colors.indigo} /></View><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.name} numberOfLines={1}>{item.name}</Text><Text style={styles.preview} numberOfLines={1}>{item.last_message || (item.kind === "group" ? "Trip chat" : "Start a conversation")}</Text></View>{item.unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unread}</Text></View> : <Ionicons name="chevron-forward" size={15} color={colors.muted} />}</Pressable>) : <View style={styles.empty}><Text style={styles.emptyText}>No chats yet. Your direct and trip conversations will stay here.</Text></View>}
    <Pressable onPress={() => { setOpen(false); router.push("/(tabs)/messages" as any); }} style={styles.all}><Text style={styles.allText}>View all chats</Text><Ionicons name="arrow-forward" size={14} color={colors.indigo} /></Pressable>
  </View> : null}<View style={styles.fabStack}>{poolId ? <Pressable onPress={shareRide} style={styles.secondaryFab} accessibilityLabel="Share this ride to social media">{shareBusy ? <ActivityIndicator size="small" color={colors.indigo} /> : <Ionicons name="share-social-outline" size={19} color={colors.indigo} />}</Pressable> : null}<Pressable onPress={() => setOpen((v) => !v)} style={styles.fab} accessibilityLabel="Open quick chats"><Ionicons name={open ? "close" : "chatbubbles"} size={22} color="#fff" />{unread > 0 && !open ? <View style={styles.fabBadge}><Text style={styles.fabBadgeText}>{Math.min(unread, 99)}</Text></View> : null}</Pressable></View><SocialShareSheet visible={shareOpen} onClose={() => setShareOpen(false)} payload={sharePayload} /></View>;
}

const makeStyles = (colors: any) => StyleSheet.create({
  layer: { position: "absolute", right: 20, bottom: 58, alignItems: "flex-end", zIndex: 1000 }, panel: { width: 330, maxHeight: 430, backgroundColor: colors.card, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 10, marginBottom: 10, shadowColor: "#000", shadowOpacity: .18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12 }, panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 8 }, title: { color: colors.onSurface, fontSize: 14, fontWeight: "900" }, sub: { color: colors.muted, fontSize: 9, marginTop: 2 }, loading: { minHeight: 96, alignItems: "center", justifyContent: "center" }, row: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 8, paddingVertical: 7, borderRadius: RADIUS.lg }, avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }, name: { color: colors.onSurface, fontSize: 11, fontWeight: "900" }, preview: { color: colors.muted, fontSize: 9, marginTop: 2 }, badge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.saffron, alignItems: "center", justifyContent: "center" }, badgeText: { color: "#fff", fontSize: 9, fontWeight: "900" }, empty: { padding: SPACING.md }, emptyText: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: "center" }, all: { minHeight: 40, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, allText: { color: colors.indigo, fontSize: 10, fontWeight: "900" }, fabStack: { gap: 9, alignItems: "center" }, secondaryFab: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: .12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 }, fab: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.indigo, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: .2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 }, fabBadge: { position: "absolute", top: -4, right: -4, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.saffron, borderWidth: 2, borderColor: colors.card, alignItems: "center", justifyContent: "center" }, fabBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900" },
});
