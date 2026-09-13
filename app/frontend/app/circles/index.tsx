import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { circlesApi } from "@/src/api/circles";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { RADIUS, SPACING, FONT_DISPLAY } from "@/src/theme";

const BUDGET_KEY = "unipool.circles.monthly_budget.v1";
const money = (paise = 0) => `₹${(Math.abs(Number(paise || 0)) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
type Circle = { group_id: string; name: string; emoji?: string; my_balance_paise?: number; member_count?: number; expense_count?: number; invite_code?: string };

export default function CirclesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  const [personal, setPersonal] = useState<any>(null);
  const [groups, setGroups] = useState<Circle[]>([]);
  const [capability, setCapability] = useState<any>({ available: true });
  const [mode, setMode] = useState<"none" | "create" | "join">("none");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [saving, setSaving] = useState(false);
  const [budget, setBudget] = useState(0);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetText, setBudgetText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [cap, d, p, g, savedBudget] = await Promise.allSettled([
      circlesApi.capability(), circlesApi.dashboard(), circlesApi.personalDashboard(), circlesApi.list(), storage.secureGet(BUDGET_KEY, "0"),
    ]);
    setCapability(cap.status === "fulfilled" ? cap.value : { available: false, status: "offline" });
    if (d.status === "fulfilled") setDashboard(d.value);
    if (p.status === "fulfilled") setPersonal(p.value);
    if (g.status === "fulfilled") setGroups(g.value || []);
    if (savedBudget.status === "fulfilled") setBudget(Number(savedBudget.value || 0));
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const ensureAvailable = () => {
    if (capability.available) return true;
    Alert.alert("Circles backend is not ready", capability.status === "offline" ? "UniPool could not reach the API. Retry in a moment." : `The live backend is still on ${capability.backend_version || "an older version"}. Circle writes are disabled until the Circles API is live, so your money data is never stored only on this device.`);
    return false;
  };
  const createCircle = async () => {
    if (!ensureAvailable()) return;
    if (name.trim().length < 2) return Alert.alert("Name your Circle", "Use at least 2 characters.");
    setSaving(true);
    try {
      const result = await circlesApi.create({ name: name.trim(), member_ids: [], emoji: "💸" });
      setMode("none"); setName("");
      if (!result?.group?.group_id) throw new Error("Circle was created but the server returned an incomplete response");
      router.push(`/circles/${result.group.group_id}` as any);
    } catch (e: any) {
      if (e?.status === 404) setCapability({ available: false, backend_version: capability.backend_version, status: "outdated" });
      Alert.alert("Couldn't create Circle", e?.status === 404 ? "The live backend does not have the Circles API yet. UniPool will not fake or locally-only save a shared money group." : (e?.message || "Try again"));
    } finally { setSaving(false); }
  };
  const joinCircle = async () => {
    if (!ensureAvailable() || !invite.trim()) return;
    setSaving(true);
    try {
      const result = await circlesApi.join(invite.trim()); setInvite(""); setMode("none");
      if (!result?.group?.group_id) throw new Error("The server returned an incomplete Circle response");
      router.push(`/circles/${result.group.group_id}` as any);
    } catch (e: any) { Alert.alert("Couldn't join", e?.message || "Try again"); }
    finally { setSaving(false); }
  };
  const saveBudget = async () => {
    const rupees = Number(budgetText || 0);
    if (!Number.isFinite(rupees) || rupees < 0) return Alert.alert("Check budget", "Enter a valid monthly amount.");
    const paise = Math.round(rupees * 100); setBudget(paise); await storage.secureSet(BUDGET_KEY, String(paise)); setEditingBudget(false);
  };

  const circleSpent = Number(dashboard?.spent_paise || 0), owe = Number(dashboard?.owe_paise || 0), owed = Number(dashboard?.owed_to_me_paise || 0);
  const personalSpent = Number(personal?.expense_paise || 0), personalIncome = Number(personal?.income_paise || 0);
  const spendable = Math.max(0, budget - personalSpent);

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={20} color={colors.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={styles.eyebrow}>MONEY · CIRCLES</Text><Text style={styles.title}>College money, without the chaos</Text><Text style={styles.sub}>Shared debts with friends and your own personal cashflow — kept separate so the numbers stay trustworthy.</Text></View></View>

    {!capability.available && !loading ? <View style={styles.warning}><Ionicons name="cloud-offline-outline" size={20} color={colors.saffron} /><View style={{ flex: 1 }}><Text style={styles.warningTitle}>Shared Circles API isn't live yet</Text><Text style={styles.muted}>Create/join is disabled instead of pretending to save. Shared money needs the server.</Text></View><Pressable onPress={load} style={styles.retry}><Ionicons name="refresh" size={16} color={colors.indigo} /><Text style={styles.retryText}>Retry</Text></Pressable></View> : null}

    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.indigo} /><Text style={styles.muted}>Balancing your money…</Text></View> : <>
      <View style={styles.metrics}><Metric label="Circle spend this month" value={money(circleSpent)} icon="wallet-outline" colors={colors} styles={styles} /><Metric label="You owe" value={money(owe)} icon="arrow-up-circle-outline" colors={colors} styles={styles} bad={owe > 0} /><Metric label="You are owed" value={money(owed)} icon="arrow-down-circle-outline" colors={colors} styles={styles} good={owed > 0} /></View>

      <Pressable onPress={() => router.push("/circles/personal" as any)} style={styles.personalCard}><View style={styles.personalIcon}><Ionicons name="analytics-outline" size={22} color={colors.indigo} /></View><View style={{ flex: 1 }}><Text style={styles.personalTitle}>Personal expense & income tracker</Text><Text style={styles.muted}>{personal ? `${money(personalSpent)} spent · ${money(personalIncome)} received this month.` : "Add your own expenses and gains and see monthly money in/out."}</Text></View><Ionicons name="chevron-forward" size={19} color={colors.muted} /></Pressable>

      <View style={styles.budgetCard}><View style={styles.budgetTop}><View><Text style={styles.eyebrow}>WHAT CAN I SPEND?</Text><Text style={styles.budgetValue}>{budget ? money(spendable) : "Set a monthly budget"}</Text></View><Pressable onPress={() => { setBudgetText(budget ? String(budget / 100) : ""); setEditingBudget((v) => !v); }} style={styles.editBtn}><Ionicons name="create-outline" size={16} color={colors.indigo} /><Text style={styles.editText}>{budget ? "Edit" : "Set budget"}</Text></Pressable></View>{budget ? <Text style={styles.muted}>Budget {money(budget)} − personal expenses recorded this month {money(personalSpent)}. Circle debts and money owed to you remain separate.</Text> : <Text style={styles.muted}>Set a discretionary budget; Personal Money supplies the actual spending total.</Text>}{editingBudget ? <View style={styles.inline}><TextInput value={budgetText} onChangeText={setBudgetText} keyboardType="decimal-pad" placeholder="Monthly budget in ₹" placeholderTextColor={colors.muted} style={styles.input} /><Pressable onPress={saveBudget} style={styles.smallPrimary}><Text style={styles.smallPrimaryText}>Save</Text></Pressable></View> : null}</View>

      <View style={styles.sectionHead}><View><Text style={styles.sectionTitle}>Your Circles</Text><Text style={styles.muted}>Hostel, flat, project team, fest, trip or your friend group.</Text></View><View style={styles.actions}><Pressable disabled={!capability.available} onPress={() => setMode(mode === "join" ? "none" : "join")} style={[styles.secondary, !capability.available && { opacity: .45 }]}><Text style={styles.secondaryText}>Join</Text></Pressable><Pressable disabled={!capability.available} onPress={() => setMode(mode === "create" ? "none" : "create")} style={[styles.primary, !capability.available && { opacity: .45 }]}><Ionicons name="add" size={17} color="#fff" /><Text style={styles.primaryText}>New Circle</Text></Pressable></View></View>
      {mode === "create" ? <View style={styles.form}><Text style={styles.formTitle}>Create a Circle</Text><TextInput value={name} onChangeText={setName} placeholder="e.g. Flat 302, Hostel Gang, Fest Core" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={saving} onPress={createCircle} style={styles.primaryWide}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Create Circle</Text>}</Pressable></View> : null}
      {mode === "join" ? <View style={styles.form}><Text style={styles.formTitle}>Join with invite code</Text><TextInput value={invite} onChangeText={setInvite} autoCapitalize="characters" placeholder="8-character invite code" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={saving} onPress={joinCircle} style={styles.primaryWide}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Join Circle</Text>}</Pressable></View> : null}
      <View style={styles.grid}>{groups.map((group) => { const balance = Number(group.my_balance_paise || 0); return <Pressable key={group.group_id} onPress={() => router.push(`/circles/${group.group_id}` as any)} style={styles.circleCard}><View style={styles.emoji}><Text style={{ fontSize: 23 }}>{group.emoji || "💸"}</Text></View><View style={{ flex: 1 }}><Text style={styles.circleTitle}>{group.name}</Text><Text style={styles.muted}>{group.member_count || 1} members · {group.expense_count || 0} expenses</Text><Text style={[styles.balance, balance > 0 && { color: colors.success }, balance < 0 && { color: colors.error }]}>{balance > 0 ? `You are owed ${money(balance)}` : balance < 0 ? `You owe ${money(balance)}` : "All settled"}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.muted} /></Pressable>; })}</View>
      {!groups.length && capability.available ? <View style={styles.empty}><Ionicons name="people-circle-outline" size={31} color={colors.indigo} /><Text style={styles.formTitle}>No Circles yet</Text><Text style={styles.muted}>Create one for your friend group and start with the next chai, cab, grocery run or flat bill.</Text></View> : null}
    </>}
  </ScrollView></SafeAreaView>;
}
function Metric({ label, value, icon, colors, styles, good, bad }: any) { return <View style={styles.metric}><Ionicons name={icon} size={19} color={good ? colors.success : bad ? colors.error : colors.indigo} /><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
const makeStyles = (c: any) => StyleSheet.create({ safe: { flex: 1, backgroundColor: c.surface }, page: { width: "100%", maxWidth: 1100, alignSelf: "center", padding: SPACING.lg, paddingBottom: 140 }, header: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 20 }, iconBtn: { width: 40, height: 40, borderRadius: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }, eyebrow: { color: c.saffron, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: c.onSurface, fontFamily: FONT_DISPLAY, fontSize: 29, fontWeight: "900", marginTop: 4 }, sub: { color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 5, maxWidth: 720 }, loading: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 10 }, muted: { color: c.muted, fontSize: 11, lineHeight: 16 }, warning: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.lg, padding: 13, marginBottom: 12 }, warningTitle: { color: c.onSurface, fontSize: 12, fontWeight: "900" }, retry: { minHeight: 34, paddingHorizontal: 10, borderRadius: 17, backgroundColor: c.card, flexDirection: "row", alignItems: "center", gap: 5 }, retryText: { color: c.indigo, fontSize: 10, fontWeight: "900" }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 }, metric: { flexGrow: 1, flexBasis: 180, minHeight: 105, borderRadius: RADIUS.lg, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, padding: 14, justifyContent: "space-between" }, metricValue: { color: c.onSurface, fontSize: 22, fontWeight: "900" }, metricLabel: { color: c.muted, fontSize: 10, fontWeight: "800" }, personalCard: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.lg, padding: 13, marginBottom: 12 }, personalIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, personalTitle: { color: c.onSurface, fontSize: 13, fontWeight: "900", marginBottom: 2 }, budgetCard: { backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.lg, padding: 15, marginBottom: 25 }, budgetTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }, budgetValue: { color: c.onSurface, fontSize: 20, fontWeight: "900", marginTop: 3 }, editBtn: { flexDirection: "row", gap: 5, alignItems: "center", minHeight: 34, paddingHorizontal: 10, borderRadius: 17, backgroundColor: c.card }, editText: { color: c.indigo, fontSize: 10, fontWeight: "900" }, sectionHead: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 12 }, sectionTitle: { color: c.onSurface, fontSize: 18, fontWeight: "900" }, actions: { flexDirection: "row", gap: 8 }, primary: { minHeight: 40, borderRadius: 20, paddingHorizontal: 13, backgroundColor: c.indigo, flexDirection: "row", alignItems: "center", gap: 5 }, primaryText: { color: "#fff", fontSize: 11, fontWeight: "900" }, secondary: { minHeight: 40, borderRadius: 20, paddingHorizontal: 13, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, justifyContent: "center" }, secondaryText: { color: c.onSurface, fontSize: 11, fontWeight: "900" }, form: { backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.lg, padding: 14, gap: 9, marginBottom: 12 }, formTitle: { color: c.onSurface, fontSize: 14, fontWeight: "900" }, input: { flex: 1, minHeight: 44, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, color: c.onSurface, paddingHorizontal: 12, fontSize: 12 }, primaryWide: { minHeight: 42, borderRadius: 21, backgroundColor: c.indigo, alignItems: "center", justifyContent: "center" }, inline: { flexDirection: "row", gap: 8, marginTop: 10 }, smallPrimary: { minWidth: 70, borderRadius: 12, backgroundColor: c.indigo, alignItems: "center", justifyContent: "center" }, smallPrimaryText: { color: "#fff", fontSize: 10, fontWeight: "900" }, grid: { gap: 9 }, circleCard: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.lg, padding: 13 }, emoji: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: c.surface2 }, circleTitle: { color: c.onSurface, fontSize: 14, fontWeight: "900" }, balance: { color: c.muted, fontSize: 10, fontWeight: "900", marginTop: 6 }, empty: { minHeight: 190, alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: RADIUS.lg, padding: 20 } });
