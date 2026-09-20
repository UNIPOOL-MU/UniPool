import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RADIUS } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import SocialShareSheet from "@/src/components/SocialShareSheet";
import { recordGameResult } from "@/src/utils/gameProgress";

export default function GameShareButton({ game, result }: { game: string; result: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const recorded = useRef(false);
  const url = "https://uni-pool-five.vercel.app/games";
  const text = `${result} on ${game} in UniPool Time-pass. Think you can beat me?`;

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    recordGameResult(game, result).catch(() => {});
  }, [game, result]);

  return <>
    <Pressable onPress={() => setOpen(true)} style={[styles.button, { borderColor: colors.border, backgroundColor: colors.surface2 }]} accessibilityLabel={`Share ${game} result`}>
      <Ionicons name="share-social-outline" size={16} color={colors.indigo} />
      <Text style={[styles.text, { color: colors.onSurface }]}>Share result</Text>
    </Pressable>
    <SocialShareSheet visible={open} onClose={() => setOpen(false)} payload={{ title: `${game} result`, text, url }} />
  </>;
}

const styles = StyleSheet.create({
  button: { minHeight: 42, paddingHorizontal: 16, borderRadius: RADIUS.pill, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  text: { fontSize: 11, fontWeight: "800" },
});