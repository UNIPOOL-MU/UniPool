import React, { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme_context/ThemeContext";
import SocialShareSheet from "@/src/components/SocialShareSheet";

const INSTAGRAM_HANDLE = "binary.bots_01";
const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;
const CONTACT_EMAIL = "binary.bots.0110@gmail.com";
const HOME = "https://uni-pool-five.vercel.app";

export default function SiteFooter() {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const router = useRouter();
  const [referOpen, setReferOpen] = useState(false);
  if (Platform.OS !== "web" || width < 900) return null;

  const nav = (path: string) => router.push(path as any);
  return <>
    <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
      <Pressable accessibilityRole="link" accessibilityLabel={`Open BinaryBots on Instagram @${INSTAGRAM_HANDLE}`} onPress={() => Linking.openURL(INSTAGRAM_URL)} style={styles.left}>
        <Text style={[styles.copy, { color: colors.muted }]}>Made with </Text><Ionicons name="heart" size={12} color={colors.error} /><Text style={[styles.copy, { color: colors.muted }]}> by BinaryBots</Text>
      </Pressable>
      <View style={styles.links}>
        <Pressable onPress={() => nav("/people")} style={styles.link}><Ionicons name="people-outline" size={14} color={colors.muted} /><Text style={[styles.linkText, { color: colors.muted }]}>People</Text></Pressable>
        <Pressable onPress={() => nav("/terms")} style={styles.link}><Text style={[styles.linkText, { color: colors.muted }]}>Terms</Text></Pressable>
        <Pressable onPress={() => nav("/privacy")} style={styles.link}><Text style={[styles.linkText, { color: colors.muted }]}>Privacy</Text></Pressable>
        <Pressable onPress={() => nav("/faq")} style={styles.link}><Text style={[styles.linkText, { color: colors.muted }]}>FAQ</Text></Pressable>
        <Pressable onPress={() => nav("/community-guidelines")} style={styles.link}><Text style={[styles.linkText, { color: colors.muted }]}>Guidelines</Text></Pressable>
        <Pressable onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=UniPool%20contact`)} style={styles.link}><Ionicons name="mail-outline" size={14} color={colors.muted} /><Text style={[styles.linkText, { color: colors.muted }]}>Contact</Text></Pressable>
        <Pressable onPress={() => setReferOpen(true)} style={styles.link}><Ionicons name="person-add-outline" size={14} color={colors.muted} /><Text style={[styles.linkText, { color: colors.muted }]}>Refer a friend</Text></Pressable>
      </View>
    </View>
    <SocialShareSheet visible={referOpen} onClose={() => setReferOpen(false)} payload={{ title: "Refer a friend to UniPool", text: "Join me on UniPool for university travel, shared expenses and useful student tools in one place.", url: HOME }} />
  </>;
}

const styles = StyleSheet.create({
  footer: { minHeight: 46, borderTopWidth: 1, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 },
  left: { minHeight: 34, flexDirection: "row", alignItems: "center", paddingHorizontal: 2 }, copy: { fontSize: 10 },
  links: { flexDirection: "row", alignItems: "center", gap: 13, flexWrap: "wrap", justifyContent: "flex-end" }, link: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 3 }, linkText: { fontSize: 10, fontWeight: "700" },
});