import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { shareText } from "@/src/utils/share";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { circlesApi } from "@/src/api/circles";
import { utilityApi } from "@/src/api/utility";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { RADIUS, SPACING, FONT_DISPLAY } from "@/src/theme";

const money = (paise = 0) => `₹${(Math.abs(Number(paise || 0)) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const CATEGORIES = ["food", "groceries", "rent", "travel", "academics", "entertainment", "utilities", "other"];
type SplitMode = "equal" | "exact" | "percentage" | "shares";
type Member = { user_id: string; name: string; username?: string; email?: string | null; college_verified?: boolean };

type SearchPerson = { user_id: string; name: string; username?: string; email?: string | null; picture?: string | null };

function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0); if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => total * w / sum); const values = raw.map(Math.floor); let remainder = total - values.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let i = 0; i < remainder; i++) values[order[i % order.length].i] += 1;
  return values;
}

export default function CircleDetail() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter(); const { user } = useAuth(); const { colors } = useTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);
  const [data, setData] = useState<any>(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [showExpense, setShowExpense] = useState(false); const [description, setDescription] = useState(""); const [amount, setAmount] = useState(""); const [category, setCategory] = useState("food");
  const [payer, setPayer] = useState(""); const [participants, setParticipants] = useState<Set<string>>(new Set()); const [splitMode, setSplitMode] = useState<SplitMode>("equal"); const [splitInputs, setSplitInputs] = useState<Record<string, string>>({});
  const [showMembers, setShowMembers] = useState(false); const [search, setSearch] = useState(""); const [results, setResults] = useState<SearchPerson[]>([]); const [searching, setSearching] = useState(false);
  const [showSettle, setShowSettle] = useState(false); const [settleFrom, setSettleFrom] = useState(""); const [settleTo, setSettleTo] = useState(""); const [settleAmount, setSettleAmount] = useState("");

  const load = useCallback(async () => {
    if (!groupId) return; setLoading(true);
    try {
      const next = await circlesApi.get(groupId); setData(next);
      const ids = (next.members || []).map((m: Member) => m.user_id); setParticipants(new Set(ids));
      setPayer((p) => p || user?.user_id || ids[0] || ""); setSettleFrom((p) => p || user?.user_id || ids[0] || ""); setSettleTo((p) => p || ids.find((id: string) => id !== (user?.user_id || ids[0])) || "");
    } catch (e: any) { Alert.alert("Couldn't load Circle", e.message || "Try again"); }
    finally { setLoading(false); }
  }, [groupId, user?.user_id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const members: Member[] = data?.members || []; const existing = new Set(members.map((m) => m.user_id)); const invite = data?.group?.invite_code || "";
  const isAdmin = Boolean(user?.user_id && data?.group?.admins?.includes(user.user_id));
  const shareInvite = async () => shareText({ title: `Join ${data?.group?.name}`, text: `Join my UniPool Circle “${data?.group?.name}”.\nInvite code: ${invite}\n\nOpen UniPool → Circles → Join.` });

  const searchPeople = async (value: string) => {
    setSearch(value); const q = value.trim(); if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const [directory, legacy] = await Promise.allSettled([utilityApi.searchDirectory(q), api.globalSearch(q)]);
      const merged = new Map<string, SearchPerson>();
      if (directory.status === "fulfilled") (directory.value || []).forEach((p: any) => p?.user_id && merged.set(p.user_id, p));
      if (legacy.status === "fulfilled") (legacy.value?.people || []).forEach((p: any) => p?.user_id && !merged.has(p.user_id) && merged.set(p.user_id, p));
      setResults([...merged.values()].filter((p) => !existing.has(p.user_id)).slice(0, 10));
    } catch { setResults([]); } finally { setSearching(false); }
  };
  const addMember = async (id: string) => {
    setSaving(true); try { await circlesApi.addMember(groupId!, id); setSearch(""); setResults([]); await load(); }
    catch (e: any) { Alert.alert("Couldn't add member", e.message || "Try again"); } finally { setSaving(false); }
  };
  const inviteEmail = async () => {
    const email = search.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Alert.alert("Enter an email", "Type a valid email address first.");
    setSaving(true);
    try {
      const result = await utilityApi.inviteCircleByEmail(groupId!, email);
      if (result.exists && result.user?.user_id) { await addMember(result.user.user_id); return; }
      const url = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(result.subject)}&body=${encodeURIComponent(result.message)}`;
      const can = await Linking.canOpenURL(url); if (can) await Linking.openURL(url); else await shareText({ title: result.subject, text: result.message });
      Alert.alert("Invite ready", `We've prepared the invite for ${email}. They can join with code ${result.invite_code}.`);
    } catch (e: any) { Alert.alert("Couldn't prepare invite", e.message || "Try again"); } finally { setSaving(false); }
  };

  const buildSplits = () => {
    const ids = members.map((m) => m.user_id).filter((id) => participants.has(id)); const total = Math.round(Number(amount) * 100);
    if (!ids.length || !Number.isFinite(total) || total <= 0) throw new Error("Choose participants and enter a valid amount.");
    let values: number[];
    if (splitMode === "equal") values = allocate(total, ids.map(() => 1));
    else if (splitMode === "exact") { values = ids.map((id) => Math.round(Number(splitInputs[id] || 0) * 100)); if (values.reduce((a, b) => a + b, 0) !== total) throw new Error("Exact splits must add up to the total."); }
    else if (splitMode === "percentage") { const weights = ids.map((id) => Number(splitInputs[id] || 0)); if (Math.abs(weights.reduce((a, b) => a + b, 0) - 100) > .001) throw new Error("Percentages must add up to 100%."); values = allocate(total, weights); }
    else { const weights = ids.map((id) => Number(splitInputs[id] || 0)); if (weights.some((v) => !Number.isFinite(v) || v <= 0)) throw new Error("Every selected member needs at least one share."); values = allocate(total, weights); }
    return ids.map((user_id, index) => ({ user_id, amount_paise: values[index] }));
  };
  const addExpense = async () => {
    if (!description.trim()) return Alert.alert("What was it for?", "Add a short description."); setSaving(true);
    try { const splits = buildSplits(); await circlesApi.addExpense(groupId!, { description: description.trim(), amount_paise: Math.round(Number(amount) * 100), paid_by: payer, splits, split_type: splitMode, category, notes: null }); setDescription(""); setAmount(""); setSplitInputs({}); setShowExpense(false); await load(); }
    catch (e: any) { Alert.alert("Couldn't add expense", e.message); } finally { setSaving(false); }
  };
  const settle = async (from = settleFrom, to = settleTo, amountPaise?: number) => {
    const paise = amountPaise ?? Math.round(Number(settleAmount) * 100); if (!from || !to || from === to || !Number.isFinite(paise) || paise <= 0) return Alert.alert("Check settlement", "Choose two people and an amount."); setSaving(true);
    try { await circlesApi.settle(groupId!, { from_user_id: from, to_user_id: to, amount_paise: paise }); setSettleAmount(""); setShowSettle(false); await load(); }
    catch (e: any) { Alert.alert("Couldn't settle", e.message); } finally { setSaving(false); }
  };
  const removeExpense = (expense: any) => Alert.alert("Remove expense?", expense.description, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: async () => { try { await circlesApi.deleteExpense(groupId!, expense.expense_id); await load(); } catch (e: any) { Alert.alert("Couldn't remove", e.message); } } }]);

  if (loading && !data) return <SafeAreaView style={styles.safe}><View style={styles.loading}><ActivityIndicator color={colors.indigo} /><Text style={styles.muted}>Opening ledger…</Text></View></SafeAreaView>;
  if (!data) return null;
  const myBalance = Number(data.my_balance_paise || 0);

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={20} color={colors.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={styles.eyebrow}>CIRCLE</Text><Text style={styles.title}>{data.group.emoji || "💸"} {data.group.name}</Text><Text style={styles.sub}>{members.length} members · invite {invite}</Text></View><Pressable onPress={shareInvite} style={styles.share}><Ionicons name="share-social-outline" size={17} color={colors.indigo} /><Text style={styles.shareText}>Invite</Text></Pressable></View>
    <View style={styles.hero}><Text style={styles.eyebrow}>YOUR POSITION</Text><Text style={[styles.heroValue, myBalance > 0 && { color: colors.success }, myBalance < 0 && { color: colors.error }]}>{myBalance > 0 ? `You are owed ${money(myBalance)}` : myBalance < 0 ? `You owe ${money(myBalance)}` : "All settled"}</Text><Text style={styles.muted}>Your exact net balance after recorded expenses and settlements.</Text></View>
    <View style={styles.actions}><Pressable onPress={() => setShowExpense((v) => !v)} style={styles.primary}><Ionicons name="add" size={17} color="#fff" /><Text style={styles.primaryText}>Add expense</Text></Pressable><Pressable onPress={() => setShowSettle((v) => !v)} style={styles.secondary}><Ionicons name="checkmark-circle-outline" size={17} color={colors.indigo} /><Text style={styles.secondaryText}>Settle up</Text></Pressable><Pressable onPress={() => setShowMembers((v) => !v)} style={styles.secondary}><Ionicons name="person-add-outline" size={17} color={colors.indigo} /><Text style={styles.secondaryText}>Members</Text></Pressable></View>

    {showMembers ? <View style={styles.form}><Text style={styles.sectionTitle}>Members</Text><View style={styles.wrap}>{members.map((m) => <View key={m.user_id} style={styles.memberPill}><Text style={styles.memberName}>{m.name}</Text>{m.college_verified ? <Ionicons name="shield-checkmark" size={14} color={colors.indigo} /> : null}</View>)}</View>{isAdmin ? <><Text style={styles.label}>Add by name or email</Text><TextInput value={search} onChangeText={searchPeople} autoCapitalize="none" placeholder="Name or email address" placeholderTextColor={colors.muted} style={styles.input} />{searching ? <ActivityIndicator color={colors.indigo} style={{ marginVertical: 8 }} /> : null}{results.map((p) => <Pressable key={p.user_id} onPress={() => addMember(p.user_id)} style={styles.searchRow}><View style={{ flex: 1 }}><Text style={styles.memberName}>{p.name}</Text><Text style={styles.muted}>{p.email || (p.username ? `@${p.username}` : "UniPool student")}</Text></View><Ionicons name="add-circle" size={22} color={colors.indigo} /></Pressable>)}{search.includes("@") && results.length === 0 && !searching ? <Pressable onPress={inviteEmail} disabled={saving} style={styles.inviteEmail}><Ionicons name="mail-outline" size={18} color={colors.saffron} /><View style={{ flex: 1 }}><Text style={styles.memberName}>Invite {search.trim()}</Text><Text style={styles.muted}>No UniPool account found. Prepare an email invite with this Circle code.</Text></View><Ionicons name="arrow-forward" size={17} color={colors.muted} /></Pressable> : null}</> : <Text style={styles.muted}>Only Circle admins can add new members.</Text>}</View> : null}

    {showExpense ? <View style={styles.form}><Text style={styles.sectionTitle}>New expense</Text><View style={styles.row}><TextInput value={description} onChangeText={setDescription} placeholder="Dinner, groceries, Wi-Fi…" placeholderTextColor={colors.muted} style={[styles.input, { flex: 2 }]} /><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="₹ Amount" placeholderTextColor={colors.muted} style={styles.input} /></View><Text style={styles.label}>Paid by</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{members.map((m) => <Chip key={m.user_id} active={payer === m.user_id} text={m.user_id === user?.user_id ? "You" : m.name.split(" ")[0]} onPress={() => setPayer(m.user_id)} styles={styles} />)}</ScrollView><Text style={styles.label}>Who shares this?</Text><View style={styles.wrap}>{members.map((m) => <Chip key={m.user_id} active={participants.has(m.user_id)} text={m.user_id === user?.user_id ? "You" : m.name.split(" ")[0]} onPress={() => setParticipants((current) => { const next = new Set(current); next.has(m.user_id) ? next.delete(m.user_id) : next.add(m.user_id); return next; })} styles={styles} />)}</View><Text style={styles.label}>Split method</Text><View style={styles.wrap}>{(["equal", "exact", "percentage", "shares"] as SplitMode[]).map((mode) => <Chip key={mode} active={splitMode === mode} text={mode[0].toUpperCase() + mode.slice(1)} onPress={() => { setSplitMode(mode); setSplitInputs({}); }} styles={styles} />)}</View>{splitMode !== "equal" ? <View style={styles.splitGrid}>{members.filter((m) => participants.has(m.user_id)).map((m) => <View key={m.user_id} style={styles.splitRow}><Text style={styles.splitName}>{m.user_id === user?.user_id ? "You" : m.name}</Text><TextInput value={splitInputs[m.user_id] || ""} onChangeText={(v) => setSplitInputs((old) => ({ ...old, [m.user_id]: v }))} keyboardType="decimal-pad" placeholder={splitMode === "exact" ? "₹" : splitMode === "percentage" ? "%" : "shares"} placeholderTextColor={colors.muted} style={styles.splitInput} /></View>)}</View> : null}<Text style={styles.label}>Category</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{CATEGORIES.map((item) => <Chip key={item} active={category === item} text={item[0].toUpperCase() + item.slice(1)} onPress={() => setCategory(item)} styles={styles} />)}</ScrollView><Pressable disabled={saving} onPress={addExpense} style={styles.primaryWide}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Add to ledger</Text>}</Pressable></View> : null}

    {showSettle ? <View style={styles.form}><Text style={styles.sectionTitle}>Record a settlement</Text><Text style={styles.muted}>This records money already paid; UniPool does not move money.</Text><Text style={styles.label}>From</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{members.map((m) => <Chip key={m.user_id} active={settleFrom === m.user_id} text={m.user_id === user?.user_id ? "You" : m.name.split(" ")[0]} onPress={() => setSettleFrom(m.user_id)} styles={styles} />)}</ScrollView><Text style={styles.label}>To</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{members.map((m) => <Chip key={m.user_id} active={settleTo === m.user_id} text={m.user_id === user?.user_id ? "You" : m.name.split(" ")[0]} onPress={() => setSettleTo(m.user_id)} styles={styles} />)}</ScrollView><TextInput value={settleAmount} onChangeText={setSettleAmount} keyboardType="decimal-pad" placeholder="₹ Amount paid" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={saving} onPress={() => settle()} style={styles.primaryWide}><Text style={styles.primaryText}>Mark as settled</Text></Pressable></View> : null}

    <Section title="Simplify group debts" sub="Same net balances, fewer payments. Original expenses never change." styles={styles}>{data.simplified?.length ? <View style={styles.stack}>{data.simplified.map((item: any, index: number) => <View key={`${item.from_user_id}-${item.to_user_id}-${index}`} style={styles.ledgerRow}><View style={styles.circleIcon}><Ionicons name="swap-horizontal" size={17} color={colors.indigo} /></View><View style={{ flex: 1 }}><Text style={styles.memberName}>{item.from_name} → {item.to_name}</Text><Text style={styles.muted}>Recommended settlement</Text></View><Text style={styles.amount}>{money(item.amount_paise)}</Text>{(item.from_user_id === user?.user_id || item.to_user_id === user?.user_id || isAdmin) ? <Pressable onPress={() => settle(item.from_user_id, item.to_user_id, item.amount_paise)}><Text style={styles.link}>Settle</Text></Pressable> : null}</View>)}</View> : <Text style={styles.muted}>No settlement needed right now.</Text>}</Section>

    <Section title="Balances" styles={styles}><View style={styles.stack}>{(data.balances || []).map((b: any) => <View key={b.user_id} style={styles.ledgerRow}><View style={styles.circleIcon}><Ionicons name="person-outline" size={17} color={colors.indigo} /></View><Text style={[styles.memberName, { flex: 1 }]}>{b.user_id === user?.user_id ? "You" : b.name}</Text><Text style={[styles.amount, b.amount_paise > 0 && { color: colors.success }, b.amount_paise < 0 && { color: colors.error }]}>{b.amount_paise > 0 ? `+${money(b.amount_paise)}` : b.amount_paise < 0 ? `-${money(b.amount_paise)}` : "₹0"}</Text></View>)}</View></Section>

    <Section title={`Expenses · ${data.month?.key || "this month"}`} sub={data.month ? `${money(data.month.total_paise)} recorded this month` : undefined} styles={styles}>{(data.expenses || []).length ? <View style={styles.stack}>{data.expenses.map((e: any) => <Pressable key={e.expense_id} onPress={() => Alert.alert(e.description, `${e.paid_by_name} paid ${money(e.amount_paise)} · ${e.category}`, [{ text: "Close", style: "cancel" }, ...(isAdmin || e.created_by === user?.user_id ? [{ text: "Remove expense", style: "destructive" as const, onPress: () => removeExpense(e) }] : [])])} style={styles.ledgerRow}><View style={styles.circleIcon}><Ionicons name="receipt-outline" size={17} color={colors.saffron} /></View><View style={{ flex: 1 }}><Text style={styles.memberName}>{e.description}</Text><Text style={styles.muted}>{e.paid_by_name} paid · {e.category}</Text></View><Text style={styles.amount}>{money(e.amount_paise)}</Text></Pressable>)}</View> : <Text style={styles.muted}>No expenses yet. Add the first shared expense above.</Text>}</Section>

    <Section title="Activity" styles={styles}>{(data.activity || []).length ? <View style={styles.stack}>{data.activity.slice(0, 20).map((a: any) => <View key={a.activity_id} style={styles.activity}><View style={styles.activityDot} /><View style={{ flex: 1 }}><Text style={styles.memberName}>{a.actor_name}</Text><Text style={styles.muted}>{a.label}</Text></View><Text style={styles.tiny}>{new Date(a.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</Text></View>)}</View> : <Text style={styles.muted}>Circle activity will appear here.</Text>}</Section>
  </ScrollView></SafeAreaView>;
}

function Chip({ active, text, onPress, styles }: any) { return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && { color: "#fff" }]}>{text}</Text></Pressable>; }
function Section({ title, sub, children, styles }: any) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{sub ? <Text style={[styles.muted, { marginBottom: 10 }]}>{sub}</Text> : null}{children}</View>; }

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface }, page: { width: "100%", maxWidth: 1000, alignSelf: "center", padding: SPACING.lg, paddingBottom: 140 }, loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 }, iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border }, eyebrow: { color: colors.saffron, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: colors.onSurface, fontSize: 25, fontWeight: "900", fontFamily: FONT_DISPLAY, marginTop: 2 }, sub: { color: colors.muted, fontSize: 10, marginTop: 3 }, share: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 13, borderRadius: RADIUS.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }, shareText: { color: colors.indigo, fontSize: 10, fontWeight: "900" },
  hero: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.xl, padding: 18, marginBottom: 12 }, heroValue: { color: colors.onSurface, fontSize: 22, fontWeight: "900", marginVertical: 5 }, muted: { color: colors.muted, fontSize: 10, lineHeight: 15 }, tiny: { color: colors.muted, fontSize: 9 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }, primary: { minHeight: 42, paddingHorizontal: 15, borderRadius: RADIUS.pill, backgroundColor: colors.indigo, flexDirection: "row", alignItems: "center", gap: 6 }, primaryText: { color: "#fff", fontSize: 10, fontWeight: "900" }, secondary: { minHeight: 42, paddingHorizontal: 15, borderRadius: RADIUS.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 6 }, secondaryText: { color: colors.indigo, fontSize: 10, fontWeight: "900" },
  form: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.xl, padding: 15, marginBottom: 18, gap: 9 }, section: { marginTop: 24 }, sectionTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "900", marginBottom: 9 }, label: { color: colors.onSurface2, fontSize: 10, fontWeight: "800", marginTop: 3 }, input: { minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, paddingHorizontal: 12, color: colors.onSurface }, row: { flexDirection: "row", gap: 8 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, chips: { gap: 7 }, chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }, chipActive: { backgroundColor: colors.indigo, borderColor: colors.indigo }, chipText: { color: colors.onSurface2, fontSize: 10, fontWeight: "800" },
  splitGrid: { gap: 7 }, splitRow: { flexDirection: "row", alignItems: "center", gap: 8 }, splitName: { flex: 1, color: colors.onSurface, fontSize: 10, fontWeight: "800" }, splitInput: { width: 110, minHeight: 38, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, color: colors.onSurface, paddingHorizontal: 10 }, primaryWide: { minHeight: 44, borderRadius: RADIUS.pill, backgroundColor: colors.indigo, alignItems: "center", justifyContent: "center", marginTop: 3 },
  memberPill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }, memberName: { color: colors.onSurface, fontSize: 11, fontWeight: "900" }, searchRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 8 }, inviteEmail: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.lg, padding: 11 },
  stack: { gap: 7 }, ledgerRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 9, padding: 11, borderRadius: RADIUS.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, circleIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" }, amount: { color: colors.onSurface, fontSize: 11, fontWeight: "900" }, link: { color: colors.indigo, fontSize: 10, fontWeight: "900", marginLeft: 6 }, activity: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 4 }, activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.saffron },
});
