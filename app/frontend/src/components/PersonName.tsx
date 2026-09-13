import React from "react";
import { Platform, Text, TextProps } from "react-native";
import { useRouter } from "expo-router";

// Stop nested card actions: selecting a name always opens that account.
export default function PersonName({ userId, name, beforeOpen, children, ...props }: TextProps & { userId?: string | null; name?: string | null; beforeOpen?: () => void }) {
  const router = useRouter();
  if (!userId) return <Text {...props}>{children || name || "Traveller"}</Text>;
  const open = () => { beforeOpen?.(); router.push({ pathname: "/network", params: { userId, name: name || "Traveller" } } as any); };
  const keyboard = Platform.OS === "web" ? { tabIndex: 0, onKeyDown: (event: React.KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); open(); } } } : {};
  return <Text {...props} {...keyboard} accessibilityRole="link" accessibilityLabel={`Open ${name || "traveller"}'s profile`} onPress={(event) => {
    event.stopPropagation();
    open();
  }}>{children || name || "Traveller"}</Text>;
}
