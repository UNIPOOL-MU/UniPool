import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform, ScrollView } from "react-native";
import { shareText } from "@/src/utils/share";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";

import { SPACING, RADIUS, FONT, FONT_DISPLAY } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { api } from "@/src/api/client";

type ConfirmedTraveler = { user_id: string; name: string; email: string };
type Pool = {
  pool_id: string; user_id: string; user_name: string;
  from_location: string; to_location: string; travel_datetime: string;
  companions: number; confirmed_travelers?: ConfirmedTraveler[];
};

const WEB_BASE_URL = "https://uni-pool-ruddy.vercel.app";
const TORN_DOTS = 16;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
function receiptCode(poolId: string) {
  return poolId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
}

export default function TripReceiptScreen() {
  const { poolId } = useLocalSearchParams<{ poolId: string }>();
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  const [pool, setPool] = useState<Pool | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setPool(await api.getPool(poolId as string)); }
    catch { Alert.alert("Not found", "This trip couldn't be loaded."); router.back(); }
    finally { setLoading(false); }
  }, [poolId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const share = async () => {
    if (!pool) return;
    const travelers = pool.confirmed_travelers || [];
    const names = travelers.length > 0 ? ` with ${travelers.map((t) => t.name.split(" ")[0]).join(", ")}` : "";
    const text = `🚗 UniPool trip: ${pool.from_location} → ${pool.to_location} on ${fmtDate(pool.travel_datetime)}${names}. #UniPool`;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await shareText({ title: "UniPool trip", text });
  };

  if (loading || !pool) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.indigo} />
        </View>
      </SafeAreaView>
    );
  }

  const travelers = pool.confirmed_travelers || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable testID="receipt-back" onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Trip Receipt</Text>
        <Pressable testID="receipt-share" onPress={share} hitSlop={10}>
          <Ionicons name="share-outline" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.receiptWrap} testID="trip-receipt-card">
          <LinearGradient colors={isDark ? [colors.card, "#241F30"] : [colors.indigo, "#283593"]} style={styles.topBand}>
            <Ionicons name="car-sport" size={22} color="#fff" />
            <Text style={styles.brand}>UniPool</Text>
            <Text style={styles.brandSub}>TRIP RECEIPT</Text>
          </LinearGradient>

          <View style={styles.body}>
            <View style={styles.routeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.routeLabel}>FROM</Text>
                <Text style={styles.routeValue}>{pool.from_location}</Text>
              </View>
              <Ionicons name="arrow-forward" size={16} color={colors.muted} style={{ marginHorizontal: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.routeLabel}>TO</Text>
                <Text style={styles.routeValue}>{pool.to_location}</Text>
              </View>
            </View>

            <View style={styles.dashedDivider} />

            <View style={styles.metaRow}>
              <MetaItem label="Date" value={fmtDate(pool.travel_datetime)} colors={colors} />
              <MetaItem label="Time" value={fmtTime(pool.travel_datetime)} colors={colors} />
            </View>

            <View style={styles.dashedDivider} />

            <Text style={styles.sectionLabel}>Traveled with</Text>
            {travelers.length > 0 ? (
              travelers.map((t) => (
                <View key={t.user_id} style={styles.travelerRow}>
                  <Ionicons name="person-circle" size={16} color={colors.indigo} />
                  <Text style={styles.travelerName}>{t.name}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.soloText}>Solo ride</Text>
            )}
            {pool.companions > 0 && (
              <Text style={styles.companionsNote}>+{pool.companions} companion{pool.companions === 1 ? "" : "s"}</Text>
            )}

            <View style={styles.dashedDivider} />

            <View style={styles.codeRow}>
              <Text style={styles.codeLabel}>REF</Text>
              <Text style={styles.codeValue}>{receiptCode(pool.pool_id)}</Text>
            </View>
            <Text style={styles.thanks}>Thanks for pooling — see you on the next ride 🚗</Text>
          </View>

          <View style={styles.tornRow}>
            {Array.from({ length: TORN_DOTS }).map((_, i) => (
              <View key={i} style={styles.tornDot} />
            ))}
          </View>
        </View>

        <Pressable testID="receipt-share-btn" onPress={share} style={styles.shareBtn}>
          <Ionicons name="share-social" size={18} color="#fff" />
          <Text style={styles.shareBtnText}>Share this trip</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaItem({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 9, fontWeight: "700", letterSpacing: 0.6, color: colors.muted }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: FONT.base, fontWeight: "700", marginTop: 2, color: colors.onSurface }}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card,
  },
  headerTitle: { fontSize: FONT.lg, fontWeight: "800", color: colors.onSurface },
  scrollContent: { padding: SPACING.lg, alignItems: "center", paddingBottom: 60 },
  receiptWrap: {
    width: "100%", maxWidth: 380, backgroundColor: colors.card, borderRadius: RADIUS.lg, overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  topBand: { alignItems: "center", paddingVertical: SPACING.xl, gap: 4 },
  brand: { color: "#fff", fontSize: FONT.xl, fontWeight: "800", fontFamily: FONT_DISPLAY, marginTop: 6 },
  brandSub: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  body: { padding: SPACING.lg },
  routeRow: { flexDirection: "row", alignItems: "center" },
  routeLabel: { fontSize: 9, fontWeight: "700", color: colors.muted, letterSpacing: 0.6 },
  routeValue: { fontSize: FONT.base, fontWeight: "700", color: colors.onSurface, marginTop: 3 },
  dashedDivider: { borderStyle: "dashed", borderWidth: 1, borderColor: colors.border, marginVertical: SPACING.md },
  metaRow: { flexDirection: "row" },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 0.5, marginBottom: 8 },
  travelerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  travelerName: { fontSize: FONT.base, fontWeight: "600", color: colors.onSurface },
  soloText: { fontSize: FONT.base, color: colors.muted, fontStyle: "italic" },
  companionsNote: { fontSize: 12, color: colors.muted, marginTop: 4 },
  codeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  codeLabel: { fontSize: 10, fontWeight: "700", color: colors.muted, letterSpacing: 1 },
  codeValue: { fontSize: FONT.base, fontWeight: "800", color: colors.saffron, letterSpacing: 2, fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }) },
  thanks: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: SPACING.md, fontStyle: "italic" },
  tornRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, marginTop: -10 },
  tornDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.surface },
  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.indigo, borderRadius: RADIUS.pill, paddingVertical: 14, paddingHorizontal: 32,
    marginTop: SPACING.xl, width: "100%", maxWidth: 380,
  },
  shareBtnText: { color: "#fff", fontWeight: "800", fontSize: FONT.base },
});
