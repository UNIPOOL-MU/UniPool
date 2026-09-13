import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { Ionicons } from "@expo/vector-icons";

import { authExtrasApi } from "@/src/api/authExtras";
import { useAuth } from "@/src/auth/AuthContext";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";

export default function PasswordSetupPrompt() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDismissed(false);
    setHasPassword(null);
    setPassword("");
    setConfirm("");
    setError(null);
    if (!user || user.onboarding_completed !== true) return () => { active = false; };
    authExtrasApi.passwordStatus()
      .then((status) => { if (active) setHasPassword(Boolean(status.has_password)); })
      .catch(() => { if (active) setHasPassword(true); });
    return () => { active = false; };
  }, [user?.user_id, user?.onboarding_completed]);

  if (!user || user.onboarding_completed !== true || hasPassword !== false || dismissed) return null;

  const save = async () => {
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setSaving(true);
    try {
      await authExtrasApi.setPassword(password);
      setHasPassword(true);
      setPassword("");
      setConfirm("");
      Alert.alert("Password added", `You can now sign in to ${user.email} with Google or your password.`);
    } catch (e: any) {
      setError(e?.message || "Couldn't add a password. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDismissed(true)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.icon}><Ionicons name="key-outline" size={26} color={colors.indigo} /></View>
          <Text style={styles.eyebrow}>ONE MORE SIGN-IN OPTION</Text>
          <Text style={styles.title}>Add a password?</Text>
          <Text style={styles.body}>You signed in without a UniPool password. Add one now if you want to use <Text style={styles.email}>{user.email}</Text> with email + password later. Google will keep working too.</Text>

          <TextInput
            value={password}
            onChangeText={(value) => { setPassword(value); setError(null); }}
            placeholder="New password (8+ characters)"
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />
          <TextInput
            value={confirm}
            onChangeText={(value) => { setConfirm(value); setError(null); }}
            placeholder="Confirm password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable onPress={() => setDismissed(true)} disabled={saving} style={styles.later}><Text style={styles.laterText}>Maybe later</Text></Pressable>
            <Pressable onPress={save} disabled={saving} style={[styles.save, saving && { opacity: 0.65 }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <><Text style={styles.saveText}>Add password</Text><Ionicons name="arrow-forward" size={16} color="#fff" /></>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(3,10,24,0.72)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 500, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 24 },
  icon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  eyebrow: { color: colors.saffron, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: 18 },
  title: { color: colors.onSurface, fontFamily: FONT_DISPLAY, fontSize: 26, lineHeight: 32, fontWeight: "900", marginTop: 6 },
  body: { color: colors.onSurface2, fontSize: 13, lineHeight: 20, marginTop: 9 },
  email: { color: colors.onSurface, fontWeight: "800" },
  input: { minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, color: colors.onSurface, paddingHorizontal: 13, marginTop: 12 },
  error: { color: colors.error, fontSize: 11, fontWeight: "700", marginTop: 9 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.md, marginTop: 20 },
  later: { minHeight: 44, justifyContent: "center", paddingHorizontal: 5 },
  laterText: { color: colors.onSurface2, fontSize: 12, fontWeight: "800" },
  save: { minHeight: 44, borderRadius: 22, backgroundColor: colors.indigo, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 17 },
  saveText: { color: "#fff", fontSize: 12, fontWeight: "900" },
});