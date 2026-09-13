import React, { useEffect, useState, useMemo } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Alert } from "@/src/utils/alert";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { SPACING, RADIUS, FONT, FONT_DISPLAY } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { api } from "@/src/api/client";

export default function RatingModal({
  visible,
  onClose,
  userId,
  userName,
  poolId,
  onSubmitted,
}: {
  visible: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  poolId?: string;
  onSubmitted?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoadingExisting(true);
    api
      .canRate(userId)
      .then((res) => {
        if (res.existing) {
          setStars(res.existing.stars);
          setComment(res.existing.comment || "");
        } else {
          setStars(0);
          setComment("");
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }, [visible, userId]);

  const submit = async () => {
    if (stars < 1) return Alert.alert("Pick a rating", "Tap a number to rate first.");
    setSubmitting(true);
    try {
      await api.submitRating(userId, stars, comment.trim() || undefined, poolId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSubmitted?.();
      onClose();
    } catch (e: any) {
      Alert.alert("Couldn't submit rating", e.message || "Try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable testID="rating-close" onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.onSurface} />
          </Pressable>

          <Ionicons name="person-circle" size={48} color={colors.indigo} />
          <Text style={styles.title}>Rate {userName.split(" ")[0]}</Text>
          <Text style={styles.sub}>How was your experience coordinating this ride?</Text>

          {loadingExisting ? (
            <ActivityIndicator color={colors.indigo} style={{ marginVertical: SPACING.lg }} />
          ) : (
            <>
              {stars > 0 && <Text style={styles.scoreLabel}>{stars}/10</Text>}
              <View style={styles.numsGrid}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <Pressable
                    key={n}
                    testID={`rating-${n}`}
                    onPress={() => { setStars(n); Haptics.selectionAsync(); }}
                    style={[styles.numChip, n <= stars && styles.numChipActive]}
                  >
                    <Text style={[styles.numChipText, n <= stars && styles.numChipTextActive]}>{n}</Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                testID="rating-comment"
                value={comment}
                onChangeText={setComment}
                placeholder="Optional comment (e.g. punctual, friendly)"
                placeholderTextColor={colors.muted}
                style={styles.input}
                multiline
              />

              <Pressable testID="rating-submit" onPress={submit} disabled={submitting} style={[styles.submitBtn, submitting && { opacity: 0.6 }]}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit rating</Text>}
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
  card: { backgroundColor: "#fff", borderRadius: RADIUS.lg, padding: SPACING.xl, width: "100%", maxWidth: 380, alignItems: "center" },
  closeBtn: { position: "absolute", top: SPACING.md, right: SPACING.md },
  title: { fontSize: FONT.xl, fontWeight: "800", color: colors.onSurface, marginTop: SPACING.sm, fontFamily: FONT_DISPLAY },
  sub: { color: colors.muted, textAlign: "center", marginTop: 4, marginBottom: SPACING.lg },
  scoreLabel: { fontSize: FONT.xl, fontWeight: "800", color: colors.saffron, marginBottom: SPACING.sm },
  numsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: SPACING.lg },
  numChip: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  numChipActive: { backgroundColor: colors.saffron, borderColor: colors.saffron },
  numChipText: { fontWeight: "700", color: colors.onSurface, fontSize: 13 },
  numChipTextActive: { color: "#fff" },
  input: { alignSelf: "stretch", backgroundColor: colors.surface, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, padding: SPACING.md, minHeight: 60, textAlignVertical: "top", color: colors.onSurface, marginBottom: SPACING.lg },
  submitBtn: { alignSelf: "stretch", backgroundColor: colors.indigo, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: "center" },
  submitText: { color: "#fff", fontWeight: "800", fontSize: FONT.lg },
});
