import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { FONT, FONT_DISPLAY } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import { usePushNotifications } from "@/src/hooks/use-push-notifications";

const SEEN_KEY = "unipool_experience_seen_v1";
const TRIP_MODE_KEY = "unipool_trip_mode";

export default function ExperienceDock() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const push = usePushNotifications();
  const [open, setOpen] = useState(false);
  const [tripMode, setTripMode] = useState(false);
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    (async () => {
      const [seen, savedTrip] = await Promise.all([
        storage.secureGet(SEEN_KEY, "0"),
        storage.secureGet(TRIP_MODE_KEY, "0"),
      ]);
      setFirstRun(seen !== "1");
      setTripMode(savedTrip === "1");
    })();
  }, []);

  const toggleTripMode = async () => {
    const next = !tripMode;
    setTripMode(next);
    await storage.secureSet(TRIP_MODE_KEY, next ? "1" : "0");
    Haptics.selectionAsync();
  };

  const dismiss = async () => {
    setOpen(false);
    setFirstRun(false);
    await storage.secureSet(SEEN_KEY, "1");
  };

  const action = (fn: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(false);
    fn();
  };

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Open UniPool setup and trip tools" onPress={() => { Haptics.selectionAsync(); setOpen(true); }} style={[styles.fab, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.onSurface }]}>
        <LinearGradient colors={isDark ? ["#FFB84D", "#F59E0B"] : ["#FFC14D", "#F28C16"]} style={styles.fabInner}>
          <Ionicons name={firstRun ? "compass-outline" : "options-outline"} size={19} color="#fff" />
        </LinearGradient>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={dismiss}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <View style={[styles.icon, { backgroundColor: colors.cream }]}><Ionicons name="compass-outline" size={20} color={colors.onCream} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.onSurface }]}>Make your UniPool better</Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>A few quick settings for smoother trips.</Text>
              </View>
              <Pressable onPress={dismiss} hitSlop={10}><Ionicons name="close" size={22} color={colors.muted} /></Pressable>
            </View>

            <View style={[styles.progress, { backgroundColor: colors.surface2 }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.saffron, width: firstRun ? "45%" : "100%" }]} />
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <View style={styles.row}>
                <Ionicons name="shield-checkmark" size={20} color={colors.success} />
                <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.onSurface }]}>Trust & safety</Text><Text style={[styles.rowSub, { color: colors.muted }]}>Verify your college identity and use report/block when needed.</Text></View>
              </View>
              <Pressable onPress={() => action(() => router.push("/(tabs)/profile"))} style={[styles.smallButton, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.smallButtonText, { color: colors.indigo }]}>Open profile</Text></Pressable>
            </View>

            <View style={[styles.section, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <View style={styles.row}>
                <Ionicons name="notifications" size={20} color={colors.saffron} />
                <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.onSurface }]}>Ride notifications</Text><Text style={[styles.rowSub, { color: colors.muted }]}>{push.subscribed ? "You'll be notified about important ride updates." : "Get request, match and trip updates without checking manually."}</Text></View>
              </View>
              {push.supported && !push.subscribed ? <Pressable disabled={push.busy} onPress={() => push.subscribe()} style={[styles.smallButton, { backgroundColor: colors.indigo, borderColor: colors.indigo }]}><Text style={[styles.smallButtonText, { color: "#fff" }]}>{push.busy ? "Enabling…" : "Enable notifications"}</Text></Pressable> : null}
            </View>

            <Pressable onPress={toggleTripMode} style={[styles.tripCard, { borderColor: tripMode ? colors.saffron : colors.border, backgroundColor: tripMode ? colors.cream : colors.surface2 }]}>
              <View style={[styles.tripIcon, { backgroundColor: tripMode ? colors.saffron : colors.card }]}><Ionicons name="navigate" size={19} color={tripMode ? "#fff" : colors.indigo} /></View>
              <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.onSurface }]}>Trip mode</Text><Text style={[styles.rowSub, { color: colors.muted }]}>{tripMode ? "On · keep ride tools close while travelling." : "Off · turn on when you're actually travelling."}</Text></View>
              <View style={[styles.switch, { backgroundColor: tripMode ? colors.saffron : colors.borderStrong }]}><View style={[styles.knob, { backgroundColor: "#fff", transform: [{ translateX: tripMode ? 14 : 0 }] }]} /></View>
            </Pressable>

            <View style={styles.actions}>
              <Pressable onPress={() => action(() => router.push("/post-request"))} style={[styles.primary, { backgroundColor: colors.saffron }]}><Ionicons name="add" size={18} color="#fff" /><Text style={styles.primaryText}>Post a smarter pool</Text></Pressable>
              <Pressable onPress={dismiss} style={[styles.secondary, { borderColor: colors.border }]}><Text style={[styles.secondaryText, { color: colors.onSurface }]}>Done</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: { position: "absolute", right: 18, bottom: 92, width: 50, height: 50, borderRadius: 25, borderWidth: 1, overflow: "hidden", elevation: 8, shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } },
  fabInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(8,12,20,0.46)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 20, paddingBottom: 28, maxHeight: "88%" },
  handle: { alignSelf: "center", width: 42, height: 4, borderRadius: 2, backgroundColor: "#B7C3D3", marginBottom: 18 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  title: { fontSize: FONT.xl, fontWeight: "900", fontFamily: FONT_DISPLAY },
  subtitle: { fontSize: FONT.sm, marginTop: 3 },
  progress: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 18, marginBottom: 14 },
  progressFill: { height: "100%", borderRadius: 3 },
  section: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  rowTitle: { fontSize: FONT.base, fontWeight: "800" },
  rowSub: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  smallButton: { alignSelf: "flex-start", marginTop: 11, borderRadius: 999, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8 },
  smallButtonText: { fontSize: 12, fontWeight: "800" },
  tripCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 14 },
  tripIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  switch: { width: 38, height: 22, borderRadius: 11, padding: 3, justifyContent: "center" },
  knob: { width: 16, height: 16, borderRadius: 8 },
  actions: { flexDirection: "row", gap: 10 },
  primary: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 999, paddingVertical: 13 },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  secondary: { minWidth: 70, alignItems: "center", justifyContent: "center", borderRadius: 999, borderWidth: 1, paddingHorizontal: 15 },
  secondaryText: { fontWeight: "800", fontSize: 13 },
});
