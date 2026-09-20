import React, { useMemo } from "react";
import { Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { shareText } from "@/src/utils/share";
import { Alert } from "@/src/utils/alert";
import { Ionicons } from "@expo/vector-icons";
import { RADIUS, SPACING } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";

export type SharePayload = { title: string; text: string; url?: string };

async function copyText(value: string) {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  return false;
}


export default function SocialShareSheet({ visible, onClose, payload }: { visible: boolean; onClose: () => void; payload: SharePayload }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const fullText = [payload.text, payload.url].filter(Boolean).join("\n");
  const encodedText = encodeURIComponent(fullText);
  const encodedUrl = encodeURIComponent(payload.url || "https://uni-pool-five.vercel.app");

  const open = async (url: string) => { try { await Linking.openURL(url); } catch (e: any) { Alert.alert("Couldn't open sharing app", e?.message || "Please try again."); } finally { onClose(); } };
  const instagram = async () => {
    const copied = await copyText(fullText).catch(() => false);
    if (copied) Alert.alert("Caption copied", "Paste it into Instagram, Stories, or a DM.");
    await open("https://www.instagram.com/");
  };
  const copy = async () => {
    const copied = await copyText(fullText).catch(() => false);
    if (copied) Alert.alert("Copied", "Share it anywhere you like."); else await shareText(payload);
    onClose();
  };

  const options = [
    { key: "share", label: "Share", icon: "share-social-outline" as const, action: async () => { await shareText(payload); onClose(); } },
    { key: "whatsapp", label: "WhatsApp", icon: "logo-whatsapp" as const, action: () => open(`https://wa.me/?text=${encodedText}`) },
    { key: "x", label: "X", icon: "logo-twitter" as const, action: () => open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(payload.text)}&url=${encodedUrl}`) },
    { key: "facebook", label: "Facebook", icon: "logo-facebook" as const, action: () => open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodeURIComponent(payload.text)}`) },
    { key: "instagram", label: "Instagram", icon: "logo-instagram" as const, action: instagram },
    { key: "copy", label: "Copy", icon: "copy-outline" as const, action: copy },
  ];

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
        <View style={styles.handle} />
        <Text style={styles.title}>{payload.title}</Text>
        <Text style={styles.preview} numberOfLines={3}>{payload.text}</Text>
        <View style={styles.grid}>
          {options.map((item) => <Pressable key={item.key} onPress={item.action} style={styles.option} accessibilityRole="button" accessibilityLabel={`Share via ${item.label}`}>
            <View style={styles.iconWrap}><Ionicons name={item.icon} size={20} color={colors.indigo} /></View>
            <Text style={styles.optionText}>{item.label}</Text>
          </Pressable>)}
        </View>
        <Pressable onPress={onClose} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
      </Pressable>
    </Pressable>
  </Modal>;
}

const makeStyles = (colors: any) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.46)", justifyContent: "flex-end", alignItems: "center" },
  sheet: { width: "100%", maxWidth: 560, backgroundColor: colors.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: colors.border, padding: SPACING.lg, paddingBottom: 28 },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: 16 },
  title: { color: colors.onSurface, fontSize: 18, fontWeight: "900" },
  preview: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 18 },
  option: { flexGrow: 1, flexBasis: 82, minHeight: 80, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", gap: 7, padding: 9 },
  iconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  optionText: { color: colors.onSurface, fontSize: 10, fontWeight: "800" },
  cancel: { marginTop: 12, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.pill },
  cancelText: { color: colors.muted, fontWeight: "800", fontSize: 12 },
});