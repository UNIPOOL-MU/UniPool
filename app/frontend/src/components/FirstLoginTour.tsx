import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/src/auth/AuthContext";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";

const STEPS = [
  {
    icon: "car-sport-outline" as const,
    eyebrow: "RIDES",
    title: "Post a trip or find one that already fits",
    body: "Add where you’re going and when. UniPool helps surface students travelling a compatible route instead of making you hunt through group chats.",
  },
  {
    icon: "people-outline" as const,
    eyebrow: "MATCH & CHAT",
    title: "Coordinate with the people you’re actually travelling with",
    body: "Review the traveller context, send or accept requests, then use the shared trip chat and live coordination tools once the ride is confirmed.",
  },
  {
    icon: "shield-checkmark-outline" as const,
    eyebrow: "SAFETY",
    title: "Share only what you choose, for as long as you choose",
    body: "Trip status and temporary live location sharing are opt-in. You can also keep trusted contacts and report problems from the safety tools.",
  },
  {
    icon: "wallet-outline" as const,
    eyebrow: "MONEY",
    title: "Split the fare without creating another spreadsheet",
    body: "Use Circles for shared expenses and settlements, or Personal Money for your own student budget. They stay separate on purpose.",
  },
];

export default function FirstLoginTour() {
  const { user, completeOnboarding } = useAuth();
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);

  // Only new accounts explicitly marked unfinished are eligible. Legacy
  // responses without this field must not restart a completed tour.
  const visible = Boolean(user) && user?.signup_tour_eligible === true && user?.onboarding_completed === false;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const progress = useMemo(() => `${step + 1} / ${STEPS.length}`, [step]);

  const finish = async () => {
    if (closing) return;
    setClosing(true);
    await completeOnboarding();
    setClosing(false);
  };

  if (!user) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={finish}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.topRow}>
            <View style={[styles.iconWrap, { backgroundColor: colors.surface2 }]}>
              <Ionicons name={current.icon} size={28} color={colors.indigo} />
            </View>
            <Text style={[styles.progress, { color: colors.onSurface2 }]}>{progress}</Text>
          </View>

          <Text style={[styles.eyebrow, { color: colors.saffron }]}>{current.eyebrow}</Text>
          <Text style={[styles.title, { color: colors.onSurface }]}>{current.title}</Text>
          <Text style={[styles.body, { color: colors.onSurface2 }]}>{current.body}</Text>

          <View style={styles.dots} accessibilityLabel={`Tour step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  { backgroundColor: index === step ? colors.indigo : colors.surface3 },
                  index === step && styles.dotActive,
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable testID="tour-skip" onPress={finish} disabled={closing} style={styles.skipBtn}>
              <Text style={[styles.skipText, { color: colors.onSurface2 }]}>Skip tour</Text>
            </Pressable>
            <Pressable
              testID={last ? "tour-done" : "tour-next"}
              onPress={last ? finish : () => setStep((value) => Math.min(value + 1, STEPS.length - 1))}
              disabled={closing}
              style={[styles.nextBtn, { backgroundColor: colors.indigo }, closing && { opacity: 0.65 }]}
            >
              <Text style={styles.nextText}>{last ? "Start using UniPool" : "Next"}</Text>
              {!last ? <Ionicons name="arrow-forward" size={17} color="#fff" /> : null}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(3, 10, 24, 0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 540,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: 26,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconWrap: { width: 58, height: 58, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  progress: { fontSize: 12, fontWeight: "800" },
  eyebrow: { marginTop: 24, fontSize: 12, letterSpacing: 1.5, fontWeight: "800" },
  title: { marginTop: 8, fontSize: 28, lineHeight: 35, fontWeight: "800", fontFamily: FONT_DISPLAY },
  body: { marginTop: 12, fontSize: 15, lineHeight: 23 },
  dots: { marginTop: 26, flexDirection: "row", gap: 7 },
  dot: { width: 8, height: 8, borderRadius: 999 },
  dotActive: { width: 24 },
  actions: { marginTop: 26, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.md },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 4 },
  skipText: { fontWeight: "800", fontSize: 13 },
  nextBtn: { minHeight: 46, borderRadius: RADIUS.md, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  nextText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});