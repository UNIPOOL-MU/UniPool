import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { peopleApi } from "@/src/api/people";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";

export default function SafetyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setContacts(await peopleApi.trustedContacts()); } catch { setContacts([]); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const add = async () => {
    if (!name.trim() || (!email.trim() && !phone.trim())) return Alert.alert("Add a contact", "Enter a name and an email or phone number.");
    setSaving(true);
    try { await peopleApi.addTrustedContact({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined }); setName(""); setEmail(""); setPhone(""); await load(); }
    catch (e: any) { Alert.alert("Couldn't save contact", e?.message || "Try again"); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => { try { await peopleApi.deleteTrustedContact(id); setContacts((rows) => rows.filter((x) => x.id !== id)); } catch (e: any) { Alert.alert("Couldn't remove contact", e?.message || "Try again"); } };

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={styles.eyebrow}>SAFETY</Text><Text style={styles.title}>Trusted contacts</Text><Text style={styles.sub}>Keep a small list of people you may want to share trip details with. UniPool is not an emergency service.</Text></View></View>

    <View style={styles.note}><Ionicons name="shield-checkmark-outline" size={20} color={colors.saffron} /><Text style={styles.noteText}>Trip sharing stays explicit: you choose when to share a trip or temporary location, and live location expires automatically.</Text></View>

    <View style={styles.form}><Text style={styles.formTitle}>Add trusted contact</Text><TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.muted} style={styles.input} /><View style={styles.row}><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email (optional)" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} /><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone (optional)" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} /></View><Pressable disabled={saving} onPress={add} style={styles.primary}>{saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="person-add-outline" size={17} color="#fff" /><Text style={styles.primaryText}>Save contact</Text></>}</Pressable></View>

    <Text style={styles.sectionTitle}>Saved contacts</Text>
    {loading ? <View style={styles.center}><ActivityIndicator color={colors.indigo} /></View> : contacts.length ? <View style={styles.stack}>{contacts.map((contact) => <View key={contact.id} style={styles.card}><View style={styles.avatar}><Text style={styles.avatarText}>{String(contact.name || "T").slice(0,1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.name}>{contact.name}</Text><Text style={styles.meta}>{contact.email || contact.phone}</Text>{contact.email && contact.phone ? <Text style={styles.meta}>{contact.phone}</Text> : null}</View><Pressable onPress={() => remove(contact.id)}><Ionicons name="trash-outline" size={18} color={colors.muted} /></Pressable></View>)}</View> : <View style={styles.empty}><Ionicons name="people-outline" size={28} color={colors.indigo} /><Text style={styles.formTitle}>No trusted contacts yet</Text><Text style={styles.meta}>Add someone you actually know and trust.</Text></View>}
  </ScrollView></SafeAreaView>;
}

const makeStyles = (c: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.surface }, page: { width: "100%", maxWidth: 800, alignSelf: "center", padding: SPACING.lg, paddingBottom: 120 }, header: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 18 }, back: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.border }, eyebrow: { color: c.saffron, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: c.onSurface, fontSize: 28, fontWeight: "900", fontFamily: FONT_DISPLAY, marginTop: 3 }, sub: { color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 4 }, note: { flexDirection: "row", gap: 9, alignItems: "flex-start", borderRadius: RADIUS.lg, padding: 13, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border, marginBottom: 14 }, noteText: { flex: 1, color: c.muted, fontSize: 10, lineHeight: 16 }, form: { borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 14, gap: 9, marginBottom: 22 }, formTitle: { color: c.onSurface, fontSize: 13, fontWeight: "900" }, input: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, color: c.onSurface, paddingHorizontal: 11 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, primary: { minHeight: 42, borderRadius: 21, backgroundColor: c.indigo, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, primaryText: { color: "#fff", fontSize: 10, fontWeight: "900" }, sectionTitle: { color: c.onSurface, fontSize: 16, fontWeight: "900", marginBottom: 9 }, center: { minHeight: 120, alignItems: "center", justifyContent: "center" }, stack: { gap: 8 }, card: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 10, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 11 }, avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, avatarText: { color: c.indigo, fontWeight: "900" }, name: { color: c.onSurface, fontSize: 11, fontWeight: "900" }, meta: { color: c.muted, fontSize: 9, marginTop: 2 }, empty: { minHeight: 150, alignItems: "center", justifyContent: "center", gap: 7, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
});
