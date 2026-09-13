import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { circlesApi } from "@/src/api/circles";
import { circlePlusApi, CirclePoll, RecurringExpense } from "@/src/api/circlePlus";
import { useAuth } from "@/src/auth/AuthContext";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";

const money = (paise = 0) => `₹${(Number(paise || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dateValue = (days = 30) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export default function CircleToolsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [circles, setCircles] = useState<any[]>([]);
  const [circleId, setCircleId] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [polls, setPolls] = useState<CirclePoll[]>([]);
  const [rides, setRides] = useState<any[]>([]);
  const [myRides, setMyRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringDescription, setRecurringDescription] = useState("");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringFrequency, setRecurringFrequency] = useState<"weekly" | "monthly">("monthly");
  const [recurringDate, setRecurringDate] = useState(dateValue());
  const [reminderUser, setReminderUser] = useState("");
  const [reminderText, setReminderText] = useState("Please check your Circle balance when you get a moment.");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState("Yes, No");
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [comment, setComment] = useState("");

  const loadCircle = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    const [d, r, p, linked] = await Promise.allSettled([circlesApi.get(id), circlePlusApi.recurring(id), circlePlusApi.polls(id), circlePlusApi.rides(id)]);
    if (d.status === "fulfilled") {
      setDetail(d.value);
      const members = d.value?.members || [];
      setReminderUser((current) => current || members.find((m: any) => m.user_id !== user?.user_id)?.user_id || "");
    }
    if (r.status === "fulfilled") setRecurring(r.value || []);
    if (p.status === "fulfilled") setPolls(p.value || []);
    if (linked.status === "fulfilled") setRides(linked.value || []);
    setLoading(false);
  }, [user?.user_id]);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, mine, confirmed] = await Promise.allSettled([circlesApi.list(), api.myPools(), api.confirmedMatches()]);
    const rows = c.status === "fulfilled" && Array.isArray(c.value) ? c.value : [];
    setCircles(rows);
    const rideMap = new Map<string, any>();
    if (mine.status === "fulfilled") for (const ride of mine.value || []) rideMap.set(ride.pool_id, ride);
    if (confirmed.status === "fulfilled") for (const ride of confirmed.value || []) rideMap.set(ride.pool_id, ride);
    setMyRides([...rideMap.values()]);
    const next = circleId || rows[0]?.group_id || "";
    setCircleId(next);
    if (next) await loadCircle(next); else setLoading(false);
  }, [circleId, loadCircle]);
  useFocusEffect(useCallback(() => { load(); }, []));

  const selectCircle = async (id: string) => { setCircleId(id); setSelectedExpense(null); setComments([]); await loadCircle(id); };
  const members = detail?.members || [];
  const expenses = detail?.expenses || [];

  const openChat = async () => {
    if (!circleId) return; setBusy("chat");
    try { const result = await circlePlusApi.ensureChat(circleId); if (result?.conversation_id) router.push(`/chat/group/${result.conversation_id}` as any); }
    catch (e: any) { Alert.alert("Couldn't open Circle chat", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  const addRecurring = async () => {
    const rupees = Number(recurringAmount);
    if (!circleId || recurringDescription.trim().length < 2 || !Number.isFinite(rupees) || rupees <= 0) return Alert.alert("Check recurring expense", "Add a description and amount.");
    setBusy("recurring");
    try {
      await circlePlusApi.addRecurring(circleId, { description: recurringDescription.trim(), amount_paise: Math.round(rupees * 100), category: "other", frequency: recurringFrequency, next_due_at: `${recurringDate}T09:00:00+05:30`, paid_by: user?.user_id, participant_ids: members.map((m: any) => m.user_id), notes: "Recurring Circle expense" });
      setRecurringDescription(""); setRecurringAmount(""); setRecurringOpen(false); await loadCircle(circleId);
    } catch (e: any) { Alert.alert("Couldn't add recurring expense", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  const deleteRecurring = async (id: string) => {
    if (!circleId) return;
    try { await circlePlusApi.deleteRecurring(circleId, id); setRecurring((rows) => rows.filter((r) => r.id !== id)); }
    catch (e: any) { Alert.alert("Couldn't stop recurring expense", e?.message || "Try again"); }
  };

  const remind = async () => {
    if (!circleId || !reminderUser) return Alert.alert("Choose a member", "Payment reminders are only for another Circle member.");
    setBusy("remind");
    try { await circlePlusApi.remind(circleId, reminderUser, reminderText.trim() || undefined); Alert.alert("Reminder sent", "It appears in their UniPool notifications."); }
    catch (e: any) { Alert.alert("Couldn't send reminder", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  const createPoll = async () => {
    const options = pollOptions.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6);
    if (!circleId || pollQuestion.trim().length < 3 || options.length < 2) return Alert.alert("Check poll", "Add a question and at least two comma-separated options.");
    setBusy("poll");
    try { await circlePlusApi.addPoll(circleId, pollQuestion.trim(), options); setPollQuestion(""); await loadCircle(circleId); }
    catch (e: any) { Alert.alert("Couldn't create poll", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  const vote = async (poll: CirclePoll, index: number) => {
    setBusy(`vote-${poll.id}`);
    try { await circlePlusApi.votePoll(poll.id, index); await loadCircle(circleId); }
    catch (e: any) { Alert.alert("Couldn't vote", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  const addRide = async (ride: any) => {
    if (!circleId) return; setBusy(`ride-${ride.pool_id}`);
    try { await circlePlusApi.addRide(circleId, ride.pool_id); await loadCircle(circleId); }
    catch (e: any) { Alert.alert("Couldn't add ride", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  const chooseExpense = async (expense: any) => {
    if (!circleId) return; setSelectedExpense(expense); setBusy("comments");
    try { setComments(await circlePlusApi.expenseComments(circleId, expense.expense_id)); }
    catch { setComments([]); }
    finally { setBusy(null); }
  };

  const addComment = async () => {
    if (!circleId || !selectedExpense || !comment.trim()) return;
    setBusy("comment");
    try { await circlePlusApi.addExpenseComment(circleId, selectedExpense.expense_id, comment.trim()); setComment(""); setComments(await circlePlusApi.expenseComments(circleId, selectedExpense.expense_id)); }
    catch (e: any) { Alert.alert("Couldn't add comment", e?.message || "Try again"); }
    finally { setBusy(null); }
  };

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={styles.eyebrow}>CIRCLE TOOLS</Text><Text style={styles.title}>Coordinate more than money</Text><Text style={styles.sub}>Recurring bills, reminders, expense comments, polls, group chat and shared rides — all private to Circle members.</Text></View></View>

    {circles.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.circleTabs}>{circles.map((circle) => <Pressable key={circle.group_id} onPress={() => selectCircle(circle.group_id)} style={[styles.circleTab, circleId === circle.group_id && styles.circleTabActive]}><Text style={styles.circleEmoji}>{circle.emoji || "💸"}</Text><Text style={[styles.circleTabText, circleId === circle.group_id && { color: "#fff" }]}>{circle.name}</Text></Pressable>)}</ScrollView> : null}

    {loading && !detail ? <View style={styles.center}><ActivityIndicator color={colors.indigo} /></View> : !detail ? <View style={styles.empty}><Ionicons name="people-circle-outline" size={30} color={colors.indigo} /><Text style={styles.cardTitle}>Create or join a Circle first</Text><Pressable onPress={() => router.push("/circles" as any)}><Text style={styles.link}>Open Circles</Text></Pressable></View> : <>
      <View style={styles.hero}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>{detail.group?.name?.toUpperCase()}</Text><Text style={styles.heroTitle}>{members.length} members · {expenses.length} expenses</Text><Text style={styles.muted}>The simplified settlement graph remains on the main Circle ledger.</Text></View><Pressable onPress={openChat} style={styles.primary}>{busy === "chat" ? <ActivityIndicator size="small" color="#fff" /> : <><Ionicons name="chatbubbles-outline" size={16} color="#fff" /><Text style={styles.primaryText}>Circle chat</Text></>}</Pressable></View>

      <Section title="Recurring bills" sub="Rent, Wi-Fi, subscriptions or any repeating shared cost." action={recurringOpen ? "Close" : "Add"} onAction={() => setRecurringOpen((v) => !v)} styles={styles}>
        {recurringOpen ? <View style={styles.form}><TextInput value={recurringDescription} onChangeText={setRecurringDescription} placeholder="Rent, Wi-Fi, subscription…" placeholderTextColor={colors.muted} style={styles.input} /><View style={styles.row}><TextInput value={recurringAmount} onChangeText={setRecurringAmount} keyboardType="decimal-pad" placeholder="₹ Amount" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} /><TextInput value={recurringDate} onChangeText={setRecurringDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} /></View><View style={styles.wrap}>{(["weekly", "monthly"] as const).map((f) => <Chip key={f} active={recurringFrequency === f} text={f} onPress={() => setRecurringFrequency(f)} styles={styles} />)}</View><Pressable disabled={busy === "recurring"} onPress={addRecurring} style={styles.primaryWide}><Text style={styles.primaryText}>{busy === "recurring" ? "Saving…" : "Create recurring expense"}</Text></Pressable></View> : null}
        {recurring.length ? <View style={styles.stack}>{recurring.map((item) => <View key={item.id} style={styles.rowCard}><View style={styles.icon}><Ionicons name="repeat-outline" size={17} color={colors.saffron} /></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{item.description}</Text><Text style={styles.muted}>{money(item.amount_paise)} · {item.frequency} · next {new Date(item.next_due_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text></View><Pressable onPress={() => deleteRecurring(item.id)}><Ionicons name="stop-circle-outline" size={18} color={colors.error} /></Pressable></View>)}</View> : <Text style={styles.muted}>No recurring expenses yet.</Text>}
      </Section>

      <Section title="Payment reminder" sub="A lightweight UniPool notification — no spam or public shaming." styles={styles}>
        <View style={styles.wrap}>{members.filter((m: any) => m.user_id !== user?.user_id).map((m: any) => <Chip key={m.user_id} active={reminderUser === m.user_id} text={m.name?.split(" ")[0] || "Member"} onPress={() => setReminderUser(m.user_id)} styles={styles} />)}</View><TextInput value={reminderText} onChangeText={setReminderText} placeholder="Reminder message" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={busy === "remind"} onPress={remind} style={styles.secondaryWide}><Text style={styles.secondaryText}>{busy === "remind" ? "Sending…" : "Send reminder"}</Text></Pressable>
      </Section>

      <Section title="Circle polls" sub="Useful for rides, food orders, meeting time or group decisions." styles={styles}>
        <View style={styles.form}><TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder="Gate 1 or Gate 2? Uber XL or two cabs?" placeholderTextColor={colors.muted} style={styles.input} /><TextInput value={pollOptions} onChangeText={setPollOptions} placeholder="Options separated by commas" placeholderTextColor={colors.muted} style={styles.input} /><Pressable disabled={busy === "poll"} onPress={createPoll} style={styles.primaryWide}><Text style={styles.primaryText}>Create poll</Text></Pressable></View>{polls.map((poll) => <View key={poll.id} style={styles.poll}><Text style={styles.cardTitle}>{poll.question}</Text>{poll.options.map((option, index) => <Pressable key={option} onPress={() => vote(poll, index)} style={[styles.pollOption, poll.my_vote === index && styles.pollOptionActive]}><Text style={[styles.pollText, poll.my_vote === index && { color: "#fff" }]}>{option}</Text><Text style={[styles.pollCount, poll.my_vote === index && { color: "#fff" }]}>{poll.counts?.[index] || 0}</Text></Pressable>)}</View>)}
      </Section>

      <Section title="Shared rides" sub="Pin a UniPool ride to this Circle so the group can coordinate around it." styles={styles}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rideChips}>{myRides.slice(0, 10).map((ride) => <Pressable key={ride.pool_id} disabled={busy === `ride-${ride.pool_id}`} onPress={() => addRide(ride)} style={styles.rideChip}><Ionicons name="car-outline" size={14} color={colors.indigo} /><Text style={styles.rideText}>{ride.from_location} → {ride.to_location}</Text></Pressable>)}</ScrollView>{rides.length ? <View style={styles.stack}>{rides.map((ride) => <Pressable key={ride.pool_id} onPress={() => router.push(`/pool/${ride.pool_id}` as any)} style={styles.rowCard}><View style={styles.icon}><Ionicons name="navigate-outline" size={17} color={colors.indigo} /></View><Text style={[styles.cardTitle, { flex: 1 }]}>Ride {String(ride.pool_id).slice(-8)}</Text><Ionicons name="chevron-forward" size={17} color={colors.muted} /></Pressable>)}</View> : <Text style={styles.muted}>No rides linked to this Circle.</Text>}
      </Section>

      <Section title="Expense comments" sub="Keep context attached to the expense instead of losing it in chat." styles={styles}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rideChips}>{expenses.slice(0, 12).map((expense: any) => <Pressable key={expense.expense_id} onPress={() => chooseExpense(expense)} style={[styles.rideChip, selectedExpense?.expense_id === expense.expense_id && { borderColor: colors.indigo }]}><Ionicons name="receipt-outline" size={14} color={colors.saffron} /><Text style={styles.rideText}>{expense.description}</Text></Pressable>)}</ScrollView>{selectedExpense ? <View style={styles.commentBox}><Text style={styles.cardTitle}>{selectedExpense.description}</Text>{busy === "comments" ? <ActivityIndicator color={colors.indigo} /> : comments.length ? comments.map((item) => <View key={item.id} style={styles.comment}><Text style={styles.commentName}>{item.name}</Text><Text style={styles.commentBody}>{item.body}</Text></View>) : <Text style={styles.muted}>No comments yet.</Text>}<View style={styles.row}><TextInput value={comment} onChangeText={setComment} placeholder="Add context…" placeholderTextColor={colors.muted} style={[styles.input, { flex: 1 }]} /><Pressable disabled={busy === "comment"} onPress={addComment} style={styles.primary}><Ionicons name="send" size={15} color="#fff" /></Pressable></View></View> : <Text style={styles.muted}>Choose an expense above to view its comments.</Text>}
      </Section>
    </>}
  </ScrollView></SafeAreaView>;
}

function Chip({ active, text, onPress, styles }: any) { return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text style={[styles.chipText, active && { color: "#fff" }]}>{text}</Text></Pressable>; }
function Section({ title, sub, action, onAction, children, styles }: any) { return <View style={styles.section}><View style={styles.sectionHead}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.muted}>{sub}</Text></View>{action ? <Pressable onPress={onAction}><Text style={styles.link}>{action}</Text></Pressable> : null}</View>{children}</View>; }

const makeStyles = (c: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.surface }, page: { width: "100%", maxWidth: 900, alignSelf: "center", padding: SPACING.lg, paddingBottom: 140 }, header: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 16 }, back: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }, eyebrow: { color: c.saffron, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: c.onSurface, fontFamily: FONT_DISPLAY, fontSize: 27, fontWeight: "900", marginTop: 3 }, sub: { color: c.muted, fontSize: 11, lineHeight: 17, marginTop: 4 }, muted: { color: c.muted, fontSize: 10, lineHeight: 15 }, center: { minHeight: 180, alignItems: "center", justifyContent: "center" }, circleTabs: { gap: 7, paddingBottom: 14 }, circleTab: { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10 }, circleTabActive: { backgroundColor: c.indigo, borderColor: c.indigo }, circleEmoji: { fontSize: 14 }, circleTabText: { color: c.onSurface, fontSize: 9, fontWeight: "900" }, hero: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 15, marginBottom: 20 }, heroTitle: { color: c.onSurface, fontSize: 16, fontWeight: "900", marginVertical: 3 }, primary: { minHeight: 36, borderRadius: 18, backgroundColor: c.indigo, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 12 }, primaryText: { color: "#fff", fontSize: 9, fontWeight: "900" }, section: { marginTop: 20 }, sectionHead: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 9 }, sectionTitle: { color: c.onSurface, fontSize: 16, fontWeight: "900" }, link: { color: c.indigo, fontSize: 10, fontWeight: "900" }, form: { gap: 8, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 12, marginBottom: 9 }, input: { minHeight: 42, borderRadius: 11, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, color: c.onSurface, paddingHorizontal: 10 }, row: { flexDirection: "row", flexWrap: "wrap", gap: 7, alignItems: "center" }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, chip: { minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, chipActive: { backgroundColor: c.indigo, borderColor: c.indigo }, chipText: { color: c.onSurface, fontSize: 9, fontWeight: "900", textTransform: "capitalize" }, primaryWide: { minHeight: 38, borderRadius: 19, backgroundColor: c.indigo, alignItems: "center", justifyContent: "center" }, secondaryWide: { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: c.indigo, backgroundColor: c.card, alignItems: "center", justifyContent: "center", marginTop: 8 }, secondaryText: { color: c.indigo, fontSize: 9, fontWeight: "900" }, stack: { gap: 7 }, rowCard: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, paddingHorizontal: 10 }, icon: { width: 34, height: 34, borderRadius: 11, backgroundColor: c.surface2, alignItems: "center", justifyContent: "center" }, cardTitle: { color: c.onSurface, fontSize: 11, fontWeight: "900" }, poll: { borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 12, gap: 6, marginTop: 8 }, pollOption: { minHeight: 36, borderRadius: 11, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 10 }, pollOptionActive: { backgroundColor: c.indigo, borderColor: c.indigo }, pollText: { color: c.onSurface, fontSize: 9, fontWeight: "800" }, pollCount: { color: c.muted, fontSize: 9, fontWeight: "900" }, rideChips: { gap: 7, paddingBottom: 8 }, rideChip: { minHeight: 36, maxWidth: 270, borderRadius: 18, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10 }, rideText: { color: c.onSurface, fontSize: 9, fontWeight: "800" }, commentBox: { borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, padding: 12, gap: 7 }, comment: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 7 }, commentName: { color: c.onSurface, fontSize: 9, fontWeight: "900" }, commentBody: { color: c.muted, fontSize: 10, lineHeight: 15, marginTop: 2 }, empty: { minHeight: 190, alignItems: "center", justifyContent: "center", gap: 8, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: c.border, backgroundColor: c.card },
});
