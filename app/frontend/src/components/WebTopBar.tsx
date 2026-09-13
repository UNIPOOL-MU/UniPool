import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import { useTheme } from "@/src/theme_context/ThemeContext";
import GlobalSearchPalette from "@/src/components/GlobalSearchPalette";

const NAV = [
  { label: "Home", icon: "home-outline" as const, path: "/(tabs)", match: "/" },
  { label: "Matches", icon: "people-outline" as const, path: "/(tabs)/matches", match: "/matches" },
  { label: "Circles", icon: "wallet-outline" as const, path: "/circles", match: "/circles" },
  { label: "Chats", icon: "chatbubble-outline" as const, path: "/(tabs)/messages", match: "/messages" },
  { label: "Profile", icon: "person-outline" as const, path: "/(tabs)/profile", match: "/profile" },
];

export default function WebTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { colors, isDark, toggleTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
      if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let alive = true;
    const refresh = async () => {
      try {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        const data = await api.notifications(true, 1);
        if (alive) setUnread(Number(data.unread || 0));
      } catch { if (alive) setUnread(0); }
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    const visible = () => refresh();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", visible);
    return () => { alive = false; clearInterval(timer); if (typeof document !== "undefined") document.removeEventListener("visibilitychange", visible); };
  }, [pathname]);

  if (Platform.OS !== "web") return null;
  const desktop = width >= 1260;
  const showActionText = width >= 1260;
  const showBrandText = width >= 520;
  const tap = (fn: () => void) => { Haptics.selectionAsync(); fn(); };
  const isActive = (match: string) => match === "/" ? pathname === "/" : pathname === match || pathname.startsWith(`${match}/`);

  return <>
    <View style={[styles.bar, !desktop && styles.barCompact, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <Pressable onPress={() => router.replace("/(tabs)" as any)} style={({ pressed }) => [styles.brand, pressed && styles.pressed]} accessibilityLabel="Go to UniPool home">
        <View style={[styles.logo, { backgroundColor: colors.surface2, borderColor: colors.border }]}><Ionicons name="car-sport" size={19} color={colors.saffron} /></View>
        {showBrandText ? <Text style={[styles.brandText, { color: colors.onSurface }]}>UniPool</Text> : null}
      </Pressable>

      {desktop ? <View style={[styles.nav, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        {NAV.map((item) => { const active = isActive(item.match); return <Pressable key={item.label} onPress={() => tap(() => router.replace(item.path as any))} style={({ pressed }) => [styles.navItem, active && { backgroundColor: colors.card, borderColor: colors.border }, pressed && styles.pressed]} accessibilityState={{ selected: active }} accessibilityLabel={item.label}><Ionicons name={item.icon} size={18} color={active ? (item.label === "Circles" ? colors.saffron : colors.indigo) : colors.muted} /><Text style={[styles.navText, { color: active ? colors.onSurface : colors.muted }]}>{item.label}</Text></Pressable>; })}
      </View> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={desktop ? { flexGrow: 0 } : { flex: 1, minWidth: 0 }} contentContainerStyle={[styles.actions, !desktop && styles.actionsCompact]}>
        <Pressable onPress={() => tap(() => setSearchOpen(true))} style={({ pressed }) => [styles.searchAction, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]} accessibilityLabel="Search UniPool"><Ionicons name="search" size={19} color={colors.indigo} />{showActionText ? <Text style={[styles.actionText, { color: colors.onSurface }]}>Search</Text> : null}</Pressable>
        <Pressable onPress={() => tap(() => router.push("/post-request" as any))} style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.indigo, borderColor: colors.indigo }, pressed && styles.pressed]} accessibilityLabel="Post a trip"><Ionicons name="add" size={20} color="#fff" />{showActionText ? <Text style={styles.primaryActionText}>Post trip</Text> : null}</Pressable>
        <Pressable onPress={() => tap(() => router.push("/notifications" as any))} style={({ pressed }) => [styles.iconAction, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]} accessibilityLabel={`${unread || "No"} unread notifications`}><Ionicons name={unread ? "notifications" : "notifications-outline"} size={20} color={unread ? colors.saffron : colors.indigo} />{unread ? <View style={[styles.badge, { backgroundColor: colors.error }]}><Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text></View> : null}</Pressable>
        <Pressable onPress={() => tap(() => router.push("/(tabs)/plan" as any))} style={({ pressed }) => [styles.iconAction, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]} accessibilityLabel="Open Explore"><Ionicons name="compass-outline" size={20} color={pathname === "/plan" ? colors.saffron : colors.indigo} /></Pressable>
        <Pressable onPress={() => tap(() => router.push("/(tabs)/games" as any))} style={({ pressed }) => [styles.iconAction, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]} accessibilityLabel="Open Time-pass games"><Ionicons name="game-controller-outline" size={20} color={pathname === "/games" ? colors.saffron : colors.indigo} /></Pressable>
        <Pressable onPress={() => tap(() => router.push("/settings" as any))} style={({ pressed }) => [styles.iconAction, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]} accessibilityLabel="Open settings"><Ionicons name="settings-outline" size={20} color={colors.indigo} /></Pressable>
        <Pressable onPress={() => tap(toggleTheme)} style={({ pressed }) => [styles.iconAction, { backgroundColor: colors.surface2, borderColor: colors.border }, pressed && styles.pressed]} accessibilityLabel={isDark ? "Switch to light theme" : "Switch to dark theme"}><Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={colors.indigo} /></Pressable>
      </ScrollView>
    </View>
    <GlobalSearchPalette visible={searchOpen} onClose={() => setSearchOpen(false)} />
  </>;
}

const styles = StyleSheet.create({
  bar: { height: 68, width: "100%", flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 26, borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 50 },
  barCompact: { paddingHorizontal: 12, gap: 8, height: 60 },
  actionsCompact: { gap: 4, paddingVertical: 5 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 48 }, logo: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" }, brandText: { fontSize: 18, fontWeight: "900", letterSpacing: -0.25 },
  nav: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4, borderRadius: 25, borderWidth: 1, marginHorizontal: "auto" }, navItem: { height: 42, paddingHorizontal: 16, borderRadius: 21, borderWidth: 1, borderColor: "transparent", flexDirection: "row", alignItems: "center", gap: 7 }, navText: { fontSize: 13, fontWeight: "800" },
  actions: { flexDirection: "row", alignItems: "center", gap: 7 }, searchAction: { height: 44, minWidth: 44, paddingHorizontal: 11, borderRadius: 21, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, primaryAction: { height: 44, minWidth: 44, paddingHorizontal: 11, borderRadius: 21, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 }, actionText: { fontSize: 12, fontWeight: "800" }, primaryActionText: { color: "#fff", fontSize: 12, fontWeight: "900" }, iconAction: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: "center", justifyContent: "center", position: "relative" }, badge: { position: "absolute", minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, right: -3, top: -3, alignItems: "center", justifyContent: "center" }, badgeText: { color: "#fff", fontSize: 8, fontWeight: "900" }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
