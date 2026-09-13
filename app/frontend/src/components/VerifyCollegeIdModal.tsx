import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Alert } from "@/src/utils/alert";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { SPACING, RADIUS, FONT, FONT_DISPLAY } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { api } from "@/src/api/client";

export default function VerifyCollegeIdModal({
  visible, onClose, onVerified,
}: {
  visible: boolean;
  onClose: () => void;
  onVerified: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const reset = () => { setStep("email"); setEmail(""); setCode(""); };

  const sendCode = async () => {
    if (!email.trim()) return Alert.alert("Enter your college email", "e.g. se22ucam015@mahindrauniversity.edu.in");
    setSending(true);
    try {
      await api.verifyCollegeIdStart(email.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep("code");
    } catch (e: any) {
      Alert.alert("Couldn't send code", e?.message || "Please check the email and try again.");
    } finally {
      setSending(false);
    }
  };

  const confirmCode = async () => {
    if (code.trim().length !== 6) return Alert.alert("Enter the 6-digit code", "Check your college inbox for the code we sent.");
    setConfirming(true);
    try {
      await api.verifyCollegeIdConfirm(code.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      onVerified();
    } catch (e: any) {
      Alert.alert("Couldn't verify", e?.message || "Please try again.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => { reset(); onClose(); }}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable testID="verify-modal-close" onPress={() => { reset(); onClose(); }} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.onSurface} />
          </Pressable>

          <Ionicons name="shield-checkmark-outline" size={44} color={colors.indigo} />

          {step === "email" ? (
            <>
              <Text style={styles.title}>Verify your college ID</Text>
              <Text style={styles.sub}>
                Enter your @mahindrauniversity.edu.in email — even if you signed in a different way. We'll send a code to confirm it's yours.
              </Text>
              <TextInput
                testID="college-email-input"
                value={email}
                onChangeText={setEmail}
                placeholder="se22ucam015@mahindrauniversity.edu.in"
                placeholderTextColor={colors.muted}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                autoFocus
              />
              <Pressable testID="send-code-btn" onPress={sendCode} disabled={sending} style={[styles.submitBtn, sending && { opacity: 0.6 }]}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Send code</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Enter the code</Text>
              <Text style={styles.sub}>We sent a 6-digit code to {email}. It expires in 15 minutes.</Text>
              <TextInput
                testID="college-code-input"
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={colors.muted}
                style={[styles.input, styles.codeInput]}
                keyboardType="number-pad"
                autoFocus
              />
              <Pressable testID="confirm-code-btn" onPress={confirmCode} disabled={confirming} style={[styles.submitBtn, confirming && { opacity: 0.6 }]}>
                {confirming ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Confirm</Text>}
              </Pressable>
              <Pressable testID="change-email-btn" onPress={() => { setStep("email"); setCode(""); }} hitSlop={8} style={{ marginTop: SPACING.md }}>
                <Text style={styles.fallbackLink}>Wrong email? Go back</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,20,25,0.6)", alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  card: { backgroundColor: "#fff", borderRadius: RADIUS.lg, padding: SPACING.xl, width: "100%", maxWidth: 400, alignItems: "center" },
  closeBtn: { position: "absolute", top: SPACING.md, right: SPACING.md },
  title: { fontSize: FONT.xl, fontWeight: "800", color: colors.onSurface, marginTop: SPACING.sm, fontFamily: FONT_DISPLAY },
  sub: { color: colors.muted, textAlign: "center", marginTop: 6, marginBottom: SPACING.lg, lineHeight: 19 },
  input: { alignSelf: "stretch", backgroundColor: colors.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, color: colors.onSurface, marginBottom: SPACING.lg, fontSize: FONT.base },
  codeInput: { textAlign: "center", fontSize: 22, fontWeight: "800", letterSpacing: 8 },
  submitBtn: { alignSelf: "stretch", backgroundColor: colors.indigo, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: "center" },
  submitText: { color: "#fff", fontWeight: "800", fontSize: FONT.lg },
  fallbackLink: { color: colors.muted, fontSize: FONT.sm, textDecorationLine: "underline" },
});
