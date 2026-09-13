import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Alert } from "@/src/utils/alert";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { api } from "@/src/api/client";
import { FONT, FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
const isWeb = Platform.OS === "web";

type Props = {
  name: string;
  rollNumber: string;
  schoolName?: string | null;
  branchName?: string | null;
  batchYear?: number | null;
  degreeLevelName?: string | null;
  email?: string;
  collegeEmail?: string | null;
  phone?: string | null;
  bloodGroup?: string | null;
  ratingAvg?: number | null;
  ratingCount?: number;
  ridesCompleted?: number;
  onProfileUpdated?: () => void | Promise<void>;
};

export default function CollegeIdCard(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const { width } = useWindowDimensions();
  const desktopLarge = isWeb && width >= 1050;
  const { colors, isDark } = useTheme();
  const modalStyles = useMemo(() => makeModalStyles(colors, isDark, desktopLarge), [colors, isDark, desktopLarge]);

  const webHandlers = isWeb ? {
    onMouseMove: (e: any) => {
      const rect = e.currentTarget.getBoundingClientRect?.();
      if (!rect) return;
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      setTilt({ x: (py - 0.5) * -9, y: (px - 0.5) * 9 });
    },
    onMouseLeave: () => setTilt({ x: 0, y: 0 }),
  } as any : {};

  return <>
    <View style={[styles.outer, desktopLarge && styles.outerDesktop]} testID="college-id-card">
      <View style={styles.strap} />
      <View style={[styles.hole, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]} />
      <Pressable testID="college-id-card-press" onPress={() => { setExpanded(true); Haptics.selectionAsync(); }} {...webHandlers} style={{ width: "100%" }}>
        <View style={[styles.tiltWrap, isWeb ? ({ transform: `perspective(850px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` } as any) : { transform: [{ rotate: "-1.2deg" }] }]}>
          <IdCardFace {...props} large={desktopLarge} />
        </View>
      </Pressable>
    </View>

    <Modal visible={expanded} animationType="fade" transparent onRequestClose={() => setExpanded(false)}>
      <View style={modalStyles.backdrop}>
        <ScrollView contentContainerStyle={modalStyles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Pressable testID="id-modal-close" onPress={() => setExpanded(false)} style={modalStyles.closeBtn} hitSlop={12}>
            <Ionicons name="close-circle" size={32} color="#fff" />
          </Pressable>
          <View style={modalStyles.bigCardWrap}><IdCardFace {...props} large={desktopLarge} /></View>
          <ProfileDetails {...props} modalStyles={modalStyles} colors={colors} />
        </ScrollView>
      </View>
    </Modal>
  </>;
}

function IdCardFace({ name, rollNumber, schoolName, branchName, batchYear, degreeLevelName, large }: Props & { large?: boolean }) {
  return <View style={styles.shadowLayer}>
    <LinearGradient colors={["#283593", "#3949AB", "#F57F17"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, large && styles.cardLarge]}>
      <View style={styles.sheen} />
      <View style={styles.topRow}>
        <View><Text style={[styles.uniName, large && styles.uniNameLarge]}>MAHINDRA UNIVERSITY</Text><Text style={styles.cardType}>STUDENT ID</Text></View>
        <View style={styles.seal}><Ionicons name="shield-checkmark" size={12} color="#1A237E" /><Text style={styles.sealText}>VERIFIED</Text></View>
      </View>
      <View style={styles.bodyRow}>
        <View style={[styles.avatar, large && styles.avatarLarge]}><Text style={[styles.avatarText, large && styles.avatarTextLarge]}>{name?.[0]?.toUpperCase() || "U"}</Text></View>
        <View style={{ flex: 1, marginLeft: 13 }}><Text style={[styles.name, large && styles.nameLarge]} numberOfLines={1}>{name}</Text><Text style={[styles.roll, large && styles.rollLarge]}>{rollNumber}</Text></View>
      </View>
      <View style={styles.divider} />
      <View style={styles.detailsRow}><Detail label="School" value={schoolName} /><Detail label="Batch" value={batchYear ? String(batchYear) : undefined} /></View>
      <View style={styles.detailsRow}><Detail label="Branch" value={branchName} /><Detail label="Level" value={degreeLevelName} /></View>
    </LinearGradient>
  </View>;
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <View style={{ flex: 1 }}><Text style={styles.detailLabel}>{label.toUpperCase()}</Text><Text style={styles.detailValue} numberOfLines={2}>{value || "—"}</Text></View>;
}

function ProfileDetails(props: Props & { modalStyles: ReturnType<typeof makeModalStyles>; colors: any }) {
  const { email, collegeEmail, phone, bloodGroup, ratingAvg, ratingCount, ridesCompleted, onProfileUpdated, modalStyles, colors } = props;
  const [editingPhone, setEditingPhone] = useState(false);
  const [editingBlood, setEditingBlood] = useState(false);
  const [phoneVal, setPhoneVal] = useState(phone || "");
  const [savedPhone, setSavedPhone] = useState(phone || "");
  const [bloodVal, setBloodVal] = useState((bloodGroup || "").toUpperCase());
  const [savedBlood, setSavedBlood] = useState((bloodGroup || "").toUpperCase());
  const [saving, setSaving] = useState<"phone" | "blood" | null>(null);

  useEffect(() => {
    setSavedPhone(phone || "");
    if (!editingPhone) setPhoneVal(phone || "");
  }, [phone, editingPhone]);
  useEffect(() => {
    const next = (bloodGroup || "").toUpperCase();
    setSavedBlood(next);
    if (!editingBlood) setBloodVal(next);
  }, [bloodGroup, editingBlood]);

  const savePhone = async () => {
    if (!/^\d{10}$/.test(phoneVal)) {
      Alert.alert("Check phone number", "Enter exactly 10 digits. Letters, spaces and extra digits are not allowed.");
      return;
    }
    setSaving("phone");
    try {
      const updated = await api.updateProfile({ phone: phoneVal });
      setSavedPhone(updated?.phone || phoneVal);
      setPhoneVal(updated?.phone || phoneVal);
      setEditingPhone(false);
      await onProfileUpdated?.();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Couldn't save phone", e?.message || "Please try again.");
    } finally { setSaving(null); }
  };

  const saveBlood = async () => {
    const normalized = bloodVal.toUpperCase();
    if (!BLOOD_GROUPS.includes(normalized as any)) {
      Alert.alert("Check blood group", "Choose one of A+, A-, B+, B-, AB+, AB-, O+ or O-.");
      return;
    }
    setSaving("blood");
    try {
      const updated = await api.updateProfile({ blood_group: normalized });
      setSavedBlood((updated?.blood_group || normalized).toUpperCase());
      setBloodVal((updated?.blood_group || normalized).toUpperCase());
      setEditingBlood(false);
      await onProfileUpdated?.();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Couldn't save blood group", e?.message || "Please try again.");
    } finally { setSaving(null); }
  };

  return <View style={modalStyles.detailsCard}>
    <Text style={modalStyles.sectionTitle}>Profile</Text>
    <Stat icon="mail-outline" label="Login email" value={email} modalStyles={modalStyles} colors={colors} />
    <Stat icon="school-outline" label="College email" value={collegeEmail} modalStyles={modalStyles} colors={colors} />

    <View style={modalStyles.statRowEditable}>
      <Ionicons name="call-outline" size={16} color={colors.muted} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={modalStyles.statLabel}>Phone</Text>
        {editingPhone ? <>
          <View style={modalStyles.editRow}>
            <TextInput
              testID="phone-input"
              value={phoneVal}
              onChangeText={(value) => setPhoneVal(value.replace(/\D/g, "").slice(0, 10))}
              maxLength={10}
              placeholder="10-digit phone number"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              inputMode="numeric"
              style={modalStyles.inlineInput}
              autoFocus
            />
            <Pressable testID="save-phone" onPress={savePhone} disabled={saving !== null || phoneVal.length !== 10} style={[modalStyles.saveIcon, phoneVal.length !== 10 && { opacity: .45 }]}>
              {saving === "phone" ? <ActivityIndicator size="small" color={colors.indigo} /> : <Ionicons name="checkmark-circle" size={24} color={colors.success} />}
            </Pressable>
            <Pressable onPress={() => { setPhoneVal(savedPhone); setEditingPhone(false); }} hitSlop={8}><Ionicons name="close-circle-outline" size={22} color={colors.muted} /></Pressable>
          </View>
          <Text style={[modalStyles.helper, phoneVal.length === 10 && { color: colors.success }]}>{phoneVal.length}/10 digits</Text>
        </> : <Pressable testID="edit-phone" onPress={() => { setPhoneVal(savedPhone); setEditingPhone(true); }} style={modalStyles.valueAction}>
          <Text style={modalStyles.statValue}>{savedPhone || "Tap to add"}</Text><Ionicons name="pencil-outline" size={15} color={colors.indigo} />
        </Pressable>}
      </View>
    </View>

    <View style={modalStyles.statRowEditable}>
      <Ionicons name="water-outline" size={16} color={colors.muted} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={modalStyles.statLabel}>Blood group</Text>
        {editingBlood ? <>
          <View style={modalStyles.bloodGrid}>{BLOOD_GROUPS.map((group) => <Pressable key={group} onPress={() => setBloodVal(group)} style={[modalStyles.bloodChip, bloodVal === group && modalStyles.bloodChipActive]}><Text style={[modalStyles.bloodText, bloodVal === group && { color: "#fff" }]}>{group}</Text></Pressable>)}</View>
          <View style={modalStyles.editActions}>
            <Pressable onPress={() => { setBloodVal(savedBlood); setEditingBlood(false); }} style={modalStyles.cancelButton}><Text style={modalStyles.cancelText}>Cancel</Text></Pressable>
            <Pressable testID="save-blood" onPress={saveBlood} disabled={saving !== null || !bloodVal} style={modalStyles.primaryButton}>{saving === "blood" ? <ActivityIndicator color="#fff" /> : <Text style={modalStyles.primaryText}>Save blood group</Text>}</Pressable>
          </View>
        </> : <Pressable testID="edit-blood" onPress={() => { setBloodVal(savedBlood); setEditingBlood(true); }} style={modalStyles.valueAction}>
          <Text style={modalStyles.statValue}>{savedBlood || "Tap to add"}</Text><Ionicons name="pencil-outline" size={15} color={colors.indigo} />
        </Pressable>}
      </View>
    </View>

    <View style={modalStyles.statsGrid}>
      <View style={modalStyles.statBox}><Ionicons name="star" size={18} color={colors.saffron} /><Text style={modalStyles.statBig}>{ratingAvg != null ? ratingAvg.toFixed(1) : "—"}</Text><Text style={modalStyles.statSmall}>{ratingCount || 0} rating{ratingCount === 1 ? "" : "s"}</Text></View>
      <View style={modalStyles.statBox}><Ionicons name="car-sport" size={18} color={colors.success} /><Text style={modalStyles.statBig}>{ridesCompleted ?? 0}</Text><Text style={modalStyles.statSmall}>completed rides</Text></View>
    </View>
  </View>;
}

function Stat({ icon, label, value, modalStyles, colors }: { icon: any; label: string; value?: string | null; modalStyles: ReturnType<typeof makeModalStyles>; colors: any }) {
  return <View style={modalStyles.statRow}><Ionicons name={icon} size={16} color={colors.muted} /><View style={{ flex: 1, marginLeft: 10 }}><Text style={modalStyles.statLabel}>{label}</Text><Text style={modalStyles.statValue}>{value || "—"}</Text></View></View>;
}

const styles = StyleSheet.create({
  outer: { alignItems: "center", width: "100%", maxWidth: 340, alignSelf: "center", paddingTop: 22 },
  outerDesktop: { maxWidth: 480, paddingTop: 28 },
  strap: { width: 66, height: 20, borderRadius: 10, backgroundColor: "rgba(26,35,126,0.5)", marginBottom: -10 },
  hole: { position: "absolute", top: 27, width: 14, height: 14, borderRadius: 7, borderWidth: 2, zIndex: 2 },
  tiltWrap: { width: "100%" },
  shadowLayer: { borderRadius: RADIUS.lg + 6, ...(isWeb ? { boxShadow: "0 18px 34px rgba(26,35,126,0.34)" } as any : { shadowColor: "#1A237E", shadowOpacity: .3, shadowRadius: 20, shadowOffset: { width: 0, height: 14 }, elevation: 10 }) },
  card: { borderRadius: RADIUS.lg + 6, padding: 18, aspectRatio: 1.55, justifyContent: "space-between", overflow: "hidden", borderWidth: 3, borderColor: "rgba(255,255,255,0.25)" },
  cardLarge: { padding: 24, aspectRatio: 1.58 },
  sheen: { position: "absolute", top: -40, left: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,255,255,0.12)", transform: [{ rotate: "35deg" }] },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  uniName: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1 }, uniNameLarge: { fontSize: 13 },
  cardType: { color: "rgba(255,255,255,0.75)", fontSize: 8, fontWeight: "700", letterSpacing: 1.4, marginTop: 2 },
  seal: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 }, sealText: { color: "#1A237E", fontSize: 8, fontWeight: "800" },
  bodyRow: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)" }, avatarLarge: { width: 58, height: 58, borderRadius: 29 },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 17 }, avatarTextLarge: { fontSize: 22 },
  name: { color: "#fff", fontSize: FONT.base, fontWeight: "800", fontFamily: FONT_DISPLAY }, nameLarge: { fontSize: 20 },
  roll: { color: "#FFECC2", fontSize: 13, fontWeight: "700", letterSpacing: 1.5, marginTop: 2 }, rollLarge: { fontSize: 16 },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.2)" }, detailsRow: { flexDirection: "row", gap: 10 },
  detailLabel: { color: "rgba(255,255,255,0.62)", fontSize: 8, fontWeight: "700", letterSpacing: .6 }, detailValue: { color: "#fff", fontSize: 11, fontWeight: "700", marginTop: 1 },
});

const makeModalStyles = (c: any, dark: boolean, desktop: boolean) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: dark ? "rgba(5,7,12,0.94)" : "rgba(15,15,20,0.86)" },
  scrollContent: { padding: SPACING.xl, paddingTop: 60, alignItems: "center", paddingBottom: 70 }, closeBtn: { position: "absolute", top: 16, right: 16, zIndex: 10 },
  bigCardWrap: { width: "100%", maxWidth: desktop ? 520 : 380, marginBottom: SPACING.xl },
  detailsCard: { width: "100%", maxWidth: desktop ? 520 : 380, backgroundColor: c.card, borderRadius: RADIUS.lg, padding: desktop ? SPACING.xl : SPACING.lg, borderWidth: 1, borderColor: c.border },
  sectionTitle: { fontSize: desktop ? FONT.xl : FONT.lg, fontWeight: "800", color: c.onSurface, marginBottom: SPACING.md, fontFamily: FONT_DISPLAY },
  statRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.border },
  statRowEditable: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  statLabel: { fontSize: 10, fontWeight: "800", color: c.muted, textTransform: "uppercase", letterSpacing: .6 }, statValue: { fontSize: FONT.base, fontWeight: "700", color: c.onSurface, marginTop: 3 },
  valueAction: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 1 }, editRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  inlineInput: { flex: 1, minHeight: 42, borderRadius: RADIUS.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, paddingHorizontal: 12, color: c.onSurface, fontSize: FONT.base, fontWeight: "700" },
  saveIcon: { minWidth: 28, alignItems: "center" }, helper: { marginTop: 5, color: c.muted, fontSize: 10, fontWeight: "700" },
  bloodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 }, bloodChip: { minWidth: 48, height: 36, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, bloodChipActive: { backgroundColor: c.indigo, borderColor: c.indigo }, bloodText: { color: c.onSurface, fontWeight: "800", fontSize: 12 },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 }, cancelButton: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border }, cancelText: { color: c.onSurface, fontWeight: "800", fontSize: 11 }, primaryButton: { minHeight: 38, paddingHorizontal: 15, borderRadius: 19, backgroundColor: c.indigo, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#fff", fontWeight: "900", fontSize: 11 },
  statsGrid: { flexDirection: "row", gap: 10, marginTop: SPACING.lg }, statBox: { flex: 1, minHeight: 88, borderRadius: RADIUS.md, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", padding: 10 }, statBig: { color: c.onSurface, fontSize: 20, fontWeight: "900", marginTop: 4 }, statSmall: { color: c.muted, fontSize: 9, fontWeight: "700", marginTop: 1 },
});
