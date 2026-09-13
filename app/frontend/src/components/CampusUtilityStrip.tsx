import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { CampusHome, peopleApi } from "@/src/api/people";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { RADIUS } from "@/src/theme";

function money(paise = 0) {
  const amount = paise / 100;
  const sign = amount < 0 ? "-" : "";
  return `${sign}₹${Math.abs(amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function CampusUtilityStrip() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [home, setHome] = useState<CampusHome | null>(null);

  useEffect(() => {
    let active = true;
    peopleApi.campusHome().then((data) => { if (active) setHome(data); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const items = [
    {
      label: "Campus Home",
      sub: home ? `${home.unread_notifications} unread · ${home.saved_routes} routes` : "Your campus dashboard",
      icon: "grid-outline" as const,
      route: "/campus",
    },
    {
      label: "People",
      sub: home ? `${home.saved_people} saved student${home.saved_people === 1 ? "" : "s"}` : "Find students",
      icon: "people-outline" as const,
      route: "/people",
    },
    {
      label: "Circles",
      sub: home ? `${home.circles} Circle${home.circles === 1 ? "" : "s"}` : "Groups + shared money",
      icon: "wallet-outline" as const,
      route: "/circles",
    },
    {
      label: "Personal Money",
      sub: home ? `${money(home.net_cashflow_paise)} net this month` : "Budget + cashflow",
      icon: "stats-chart-outline" as const,
      route: "/circles/personal",
    },
  ];

  return (
    <View style={[styles.shell, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: "100%", minWidth: 0 }} contentContainerStyle={styles.row}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>CAMPUS</Text>
          <Text style={styles.introText}>People · groups · money</Text>
        </View>
        {items.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => router.push(item.route as any)}
            style={({ pressed }) => [styles.item, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.7 }]}
          >
            <View style={[styles.icon, { backgroundColor: colors.surface2 }]}>
              <Ionicons name={item.icon} size={17} color={item.label === "Circles" ? colors.saffron : colors.indigo} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.label, { color: colors.onSurface }]}>{item.label}</Text>
              <Text numberOfLines={1} style={[styles.sub, { color: colors.muted }]}>{item.sub}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  shell: { width: "100%", minWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  row: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingVertical: 9,
    alignItems: "center",
    gap: 8,
  },
  intro: { minWidth: 126, paddingRight: 7 },
  eyebrow: { color: colors.saffron, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  introText: { color: colors.muted, fontSize: 9, marginTop: 2 },
  item: {
    width: 170,
    flexShrink: 0,
    minWidth: 160,
    maxWidth: 205,
    height: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 9,
  },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 10, fontWeight: "900" },
  sub: { fontSize: 8, marginTop: 1 },
});
