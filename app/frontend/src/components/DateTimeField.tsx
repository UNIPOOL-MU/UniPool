import React, { useRef } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RADIUS } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";

type Props = {
  mode: "date" | "time";
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
};

export default function DateTimeField({ mode, value, onChangeText, placeholder }: Props) {
  const { colors } = useTheme();
  const webInput = useRef<any>(null);
  const label = mode === "date" ? "Departure date" : "Departure time";
  const openPicker = () => {
    if (Platform.OS !== "web") return;
    const input = webInput.current;
    input?.focus?.();
    try { input?.showPicker?.(); } catch {}
  };

  if (Platform.OS === "web") {
    const input = React.createElement("input", {
      ref: webInput,
      type: mode,
      value,
      "aria-label": label,
      onChange: (event: any) => onChangeText(event.target.value),
      onClick: openPicker,
      onFocus: (event: any) => {
        try { event.currentTarget?.showPicker?.(); } catch {}
      },
      style: {
        flex: 1,
        minWidth: 0,
        width: "100%",
        color: colors.onSurface,
        background: "transparent",
        border: "none",
        outline: "none",
        fontSize: 15,
        fontFamily: "inherit",
        cursor: "pointer",
        appearance: "none",
        WebkitAppearance: "none",
        MozAppearance: "textfield",
        colorScheme: colors.surface === "#101214" || colors.surface === "#0D1015" ? "dark" : "normal",
      },
    });
    return <Pressable onPress={openPicker} accessibilityLabel={`${label}. Open picker`} style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons pointerEvents="none" name={mode === "date" ? "calendar-outline" : "time-outline"} size={20} color={colors.indigo} />
      <View pointerEvents="box-none" style={styles.webInput}>{input}</View>
      <Ionicons pointerEvents="none" name="chevron-down" size={15} color={colors.muted} />
    </Pressable>;
  }

  return <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <Ionicons name={mode === "date" ? "calendar-outline" : "time-outline"} size={20} color={colors.indigo} />
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder || (mode === "date" ? "Select date" : "Select time")}
      placeholderTextColor={colors.muted}
      style={[styles.input, { color: colors.onSurface }]}
    />
  </View>;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 54, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  webInput: { flex: 1, minWidth: 0, justifyContent: "center" },
  input: { flex: 1, minWidth: 0, fontSize: 15, paddingVertical: 11, backgroundColor: "transparent" },
});
