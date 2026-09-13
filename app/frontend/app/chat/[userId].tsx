import PersonName from "@/src/components/PersonName";
import React, { useCallback, useRef, useState, useMemo } from "react";
import { View, Text, StyleSheet, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { SPACING, RADIUS, FONT } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { sharedApi } from "@/src/api/shared";
import { useAuth } from "@/src/auth/AuthContext";
import ReportBlockModal from "@/src/components/ReportBlockModal";

type Msg = { message_id: string; from_user_id: string; to_user_id: string; text: string; created_at: string; read: boolean; pending?: boolean };
function timeAgo(iso?: string) { if (!iso) return ""; const diff = Date.now() - new Date(iso).getTime(); const mins = Math.floor(diff / 60000); if (mins < 1) return "just now"; if (mins < 60) return `${mins}m ago`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`; return `${Math.floor(hrs / 24)}d ago`; }
const QUICK_REPLIES = ["Hi! Are you still looking to share?", "What time works for you?", "Where should we meet?"];

export default function ChatThread() {
  const { userId, name } = useLocalSearchParams<{ userId: string; name?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [presence, setPresence] = useState<{ online: boolean; last_seen?: string }>({ online: false });
  const [showReport, setShowReport] = useState(false);
  const listRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypingPingRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    try { const incoming = await sharedApi.getThread(userId); setMsgs(incoming); if (!silent) setError(null); }
    catch (e: any) { if (!silent) setError(e?.message || "Couldn't load this conversation"); }
    finally { if (!silent) setLoading(false); }
  }, [userId]);

  const pollTypingAndPresence = useCallback(async () => {
    if (!userId) return;
    try { const [t, p] = await Promise.all([sharedApi.getTyping(userId), sharedApi.getPresence(userId)]); setOtherTyping(Boolean(t.typing)); setPresence(p); } catch {}
  }, [userId]);

  useFocusEffect(useCallback(() => {
    load(); pollTypingAndPresence();
    pollRef.current = setInterval(() => load(true), 3500);
    presenceRef.current = setInterval(pollTypingAndPresence, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); if (presenceRef.current) clearInterval(presenceRef.current); };
  }, [load, pollTypingAndPresence]));

  const onChangeText = (value: string) => {
    setText(value); setError(null);
    const now = Date.now();
    if (userId && value.trim() && now - lastTypingPingRef.current > 1800) { lastTypingPingRef.current = now; sharedApi.sendTyping(userId).catch(() => {}); }
  };

  const send = async () => {
    const value = text.trim();
    if (!value || !userId || !user?.user_id || sending) return;
    const localId = `local_${Date.now()}`;
    const optimistic: Msg = { message_id: localId, from_user_id: user.user_id, to_user_id: userId, text: value, created_at: new Date().toISOString(), read: false, pending: true };
    setSending(true); setText(""); setError(null); setMsgs((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 40);
    try {
      const sent = await sharedApi.sendMessage(userId, value);
      setMsgs((prev) => prev.map((m) => m.message_id === localId ? sent : m));
      setTimeout(() => load(true), 300);
    } catch (e: any) {
      setMsgs((prev) => prev.filter((m) => m.message_id !== localId));
      setText(value); setError(e?.message || "Message wasn't sent. Try again.");
    } finally { setSending(false); }
  };

  const lastMineReadIndex = (() => { for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].from_user_id === user?.user_id && !msgs[i].pending) return msgs[i].read ? i : -1; return -1; })();

  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
    <View style={styles.header}><Pressable accessibilityLabel="Go back" onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable><View style={{ alignItems: "center", flex: 1 }}><PersonName userId={userId as string} name={name as string} style={styles.headerName} numberOfLines={1}>{name || "Chat"}</PersonName><View style={styles.statusRow}>{otherTyping ? <Text style={styles.typingText}>typing…</Text> : presence.online ? <><View style={styles.onlineDot} /><Text style={styles.statusText}>Online</Text></> : presence.last_seen ? <Text style={styles.statusText}>Last seen {timeAgo(presence.last_seen)}</Text> : null}</View></View><Pressable accessibilityLabel="Report or block user" onPress={() => setShowReport(true)} hitSlop={12}><Ionicons name="ellipsis-vertical" size={22} color={colors.onSurface} /></Pressable></View>
    {error ? <Pressable onPress={() => load()} style={styles.errorBar}><Ionicons name="alert-circle-outline" size={16} color={colors.error} /><Text style={styles.errorText}>{error}</Text><Text style={styles.retryText}>Retry</Text></Pressable> : null}
    {loading ? <View style={styles.center}><ActivityIndicator color={colors.indigo} /></View> : <FlatList ref={listRef} data={msgs} keyExtractor={(m) => m.message_id} contentContainerStyle={{ padding: SPACING.lg, paddingBottom: SPACING.md, flexGrow: msgs.length === 0 ? 1 : 0 }} onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })} ListEmptyComponent={<View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="chatbubble-ellipses-outline" size={30} color={colors.indigo} /></View><Text style={styles.emptyTitle}>Start the conversation</Text><Text style={styles.emptyText}>Coordinate the pickup, timing and meeting point here.</Text></View>} renderItem={({ item, index }) => { const mine = item.from_user_id === user?.user_id; const showRead = mine && !item.pending && index === lastMineReadIndex; const showSent = mine && !item.pending && !showRead && index === msgs.length - 1; return <View style={[styles.bubbleRow, mine && { justifyContent: "flex-end" }]}><View style={styles.messageWrap}><View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, item.pending && { opacity: .62 }]}><Text style={[styles.bubbleText, mine && { color: "#fff" }]}>{item.text}</Text></View>{mine ? <View style={styles.receiptRow}><Ionicons name={item.pending ? "time-outline" : showRead ? "checkmark-done" : "checkmark"} size={14} color={showRead ? colors.indigo : colors.muted} /><Text style={styles.receiptText}>{item.pending ? "Sending" : showRead ? "Read" : showSent ? "Sent" : ""}</Text></View> : null}</View></View>; }} ListFooterComponent={otherTyping ? <View style={styles.bubbleRow}><View style={[styles.bubble, styles.bubbleTheirs, styles.typingBubble]}><View style={styles.typingDot} /><View style={styles.typingDot} /><View style={styles.typingDot} /></View></View> : null} />}
    {msgs.length === 0 && text.trim().length === 0 && !loading ? <ScrollView horizontal style={styles.quickRepliesScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickReplies}>{QUICK_REPLIES.map((reply) => <Pressable key={reply} onPress={() => setText(reply)} style={styles.quickReply}><Text style={styles.quickReplyText}>{reply}</Text></Pressable>)}</ScrollView> : null}
    <View style={styles.inputRow}><TextInput value={text} onChangeText={onChangeText} onSubmitEditing={() => { if (!Platform.OS || Platform.OS !== "web") send(); }} placeholder="Type a message…" placeholderTextColor={colors.muted} style={styles.input} multiline maxLength={500} /><Pressable accessibilityLabel="Send message" onPress={send} disabled={sending || !text.trim()} style={[styles.sendBtn, (!text.trim() || sending) && { opacity: .5 }]}><Ionicons name="send" size={18} color="#fff" /></Pressable></View><Text style={styles.charHint}>{text.length > 420 ? `${text.length}/500` : "Keep it friendly — you're coordinating a ride."}</Text>
  </KeyboardAvoidingView><ReportBlockModal visible={showReport} onClose={() => setShowReport(false)} userId={userId as string} userName={(name as string) || "this user"} onBlocked={() => router.back()} /></SafeAreaView>;
}

const makeStyles = (colors: any) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface }, headerName: { fontSize: FONT.lg, fontWeight: "800", color: colors.onSurface, maxWidth: 240 }, statusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, minHeight: 14 }, onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }, statusText: { fontSize: 11, color: colors.muted }, typingText: { fontSize: 11, color: colors.saffron, fontWeight: "700", fontStyle: "italic" },
  errorBar: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: SPACING.lg, backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border }, errorText: { flex: 1, color: colors.error, fontSize: 10, fontWeight: "700" }, retryText: { color: colors.indigo, fontSize: 10, fontWeight: "900" },
  bubbleRow: { flexDirection: "row", width: "100%", marginBottom: SPACING.sm }, messageWrap: { maxWidth: "78%", minWidth: 52, flexShrink: 1 }, bubble: { width: "100%", borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 10 }, bubbleMine: { backgroundColor: colors.indigo, borderBottomRightRadius: 4 }, bubbleTheirs: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 }, bubbleText: { fontSize: FONT.base, color: colors.onSurface, flexShrink: 1 }, receiptRow: { minHeight: 15, flexDirection: "row", alignItems: "center", gap: 3, justifyContent: "flex-end", marginTop: 2, marginRight: 4 }, receiptText: { fontSize: 10, color: colors.muted }, typingBubble: { width: 72, flexDirection: "row", gap: 4, alignItems: "center", paddingVertical: 14 }, typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.muted },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.xxl }, emptyIcon: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2, marginBottom: SPACING.md }, emptyTitle: { color: colors.onSurface, fontSize: FONT.lg, fontWeight: "800" }, emptyText: { color: colors.muted, marginTop: 6, textAlign: "center", lineHeight: 20 }, quickRepliesScroll: { flexGrow: 0, maxHeight: 54 }, quickReplies: { gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingVertical: 7, alignItems: "center" }, quickReply: { minHeight: 36, justifyContent: "center", backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.pill, paddingHorizontal: 13, paddingVertical: 7 }, quickReplyText: { color: colors.onSurface2, fontSize: 11, fontWeight: "700" }, inputRow: { flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, backgroundColor: colors.surface }, input: { flex: 1, backgroundColor: colors.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 100, fontSize: FONT.base, color: colors.onSurface }, sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.saffron, alignItems: "center", justifyContent: "center" }, charHint: { textAlign: "right", color: colors.muted, fontSize: 10, paddingHorizontal: SPACING.lg, paddingVertical: 4, backgroundColor: colors.surface },
});
