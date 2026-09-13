import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "@/src/theme_context/ThemeContext";

const ICONS: Record<string, { active: any; inactive: any }> = {
  index: { active: "home", inactive: "home-outline" },
  matches: { active: "people", inactive: "people-outline" },
  plan: { active: "compass", inactive: "compass-outline" },
  messages: { active: "chatbubble", inactive: "chatbubble-outline" },
  profile: { active: "person", inactive: "person-outline" },
};

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const desktopWeb = Platform.OS === "web" && width >= 1260;
  const barBackground = isDark ? "rgba(23,26,29,0.96)" : "rgba(255,255,255,0.97)";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarShowLabel: true,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: colors.indigo,
          tabBarInactiveTintColor: colors.muted,
          tabBarLabelStyle: styles.label,
          tabBarItemStyle: styles.item,
          tabBarStyle: desktopWeb ? { display: "none" } : [
            styles.bar,
            {
              borderTopColor: colors.border,
              backgroundColor: Platform.OS === "android" ? barBackground : "transparent",
            },
          ],
          tabBarBackground: () => desktopWeb ? null : (
            <BlurView
              intensity={isDark ? 16 : 20}
              tint={isDark ? "dark" : "light"}
              style={[StyleSheet.absoluteFill, { backgroundColor: barBackground }]}
            />
          ),
          tabBarIcon: ({ color, focused }) => {
            const icon = ICONS[route.name] || { active: "ellipse", inactive: "ellipse-outline" };
            return (
              <View style={styles.iconArea}>
                <Ionicons name={focused ? icon.active : icon.inactive} size={21} color={color} />
                <View style={[styles.activeDot, { backgroundColor: focused ? colors.saffron : "transparent" }]} />
              </View>
            );
          },
        })}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="matches" options={{ title: "Matches" }} />
        <Tabs.Screen name="plan" options={{ title: "Explore" }} />
        <Tabs.Screen name="messages" options={{ title: "Chats" }} />
        <Tabs.Screen name="profile" options={{ title: "Profile" }} />
        <Tabs.Screen name="games" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    height: 72,
    paddingTop: 7,
    paddingBottom: Platform.OS === "ios" ? 8 : 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0,
    shadowOpacity: 0,
  },
  item: { paddingVertical: 2 },
  label: { fontSize: 10, fontWeight: "700", marginTop: 0 },
  iconArea: { minWidth: 34, height: 30, alignItems: "center", justifyContent: "center" },
  activeDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
});
