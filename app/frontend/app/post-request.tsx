import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { SPACING, RADIUS, FONT, FONT_DISPLAY } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { api } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import DateTimeField from "@/src/components/DateTimeField";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DRAFT_KEY = "unipool.post.draft.v1";
const RECENT_KEY = "unipool.post.recents.v1";
function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function toISTParts(d: Date) { const shifted = new Date(d.getTime() + IST_OFFSET_MS); return { date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`, time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}` }; }
function istPartsToUTCISO(date: string, time: string) { const asUTC = new Date(`${date}T${time}:00.000Z`).getTime(); return new Date(asUTC - IST_OFFSET_MS).toISOString(); }
function parseJSON<T>(raw: any, fallback: T): T { try { return JSON.parse(String(raw || "")) as T; } catch { return fallback; } }

type Location = { id?: string | null; name: string; short_name?: string; city?: string; kind?: string };
type SavedRoute = { saved_route_id: string; label: string; from_location: string; to_location: string };
type RecentRoute = { from_location: string; to_location: string; total_seats?: number; luggage?: string | null; used_at: string };
type Draft = { from?: string; to?: string; date?: string; time?: string; genderPref?: "any" | "same"; companions?: number; totalSeats?: number; luggage?: string; notes?: string };

export default function PostRequestScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const params = useLocalSearchParams<{ edit?: string; from?: string; to?: string }>();
  const isEditing = !!params.edit;
  const defaultIst = toISTParts(new Date(Date.now() + 60 * 60 * 1000));
  const hydrated = useRef(false);

  const [from, setFrom] = useState(params.from || "");
  const [to, setTo] = useState(params.to || "");
  const [date, setDate] = useState(defaultIst.date);
  const [time, setTime] = useState(defaultIst.time);
  const [genderPref, setGenderPref] = useState<"any" | "same">("any");
  const [companions, setCompanions] = useState(0);
  const [totalSeats, setTotalSeats] = useState(4);
  const [luggage, setLuggage] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [quickLocations, setQuickLocations] = useState<Location[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const [recentRoutes, setRecentRoutes] = useState<RecentRoute[]>([]);
  const [fromSuggestions, setFromSuggestions] = useState<Location[]>([]);
  const [toSuggestions, setToSuggestions] = useState<Location[]>([]);
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    Promise.allSettled([api.searchLocations("", 8), api.savedRoutes(), storage.secureGet(RECENT_KEY, "[]")]).then(([locations, routes, recents]) => {
      if (locations.status === "fulfilled") setQuickLocations(locations.value || []);
      if (routes.status === "fulfilled") setSavedRoutes(routes.value || []);
      if (recents.status === "fulfilled") setRecentRoutes(parseJSON<RecentRoute[]>(recents.value, []).slice(0, 5));
    });
  }, []);

  useEffect(() => {
    if (isEditing || params.from || params.to || hydrated.current) { hydrated.current = true; return; }
    storage.secureGet(DRAFT_KEY, null).then((raw) => {
      const draft = parseJSON<Draft | null>(raw, null);
      if (draft && (draft.from || draft.to)) {
        setFrom(draft.from || ""); setTo(draft.to || ""); setDate(draft.date || defaultIst.date); setTime(draft.time || defaultIst.time);
        setGenderPref(draft.genderPref || "any"); setCompanions(Number(draft.companions || 0)); setTotalSeats(Number(draft.totalSeats || 4)); setLuggage(draft.luggage || ""); setNotes(draft.notes || ""); setDraftRestored(true);
      }
      hydrated.current = true;
    });
  }, [isEditing, params.from, params.to]);

  useEffect(() => {
    if (isEditing || !hydrated.current) return;
    const handle = setTimeout(() => storage.secureSet(DRAFT_KEY, JSON.stringify({ from, to, date, time, genderPref, companions, totalSeats, luggage, notes })), 350);
    return () => clearTimeout(handle);
  }, [isEditing, from, to, date, time, genderPref, companions, totalSeats, luggage, notes]);

  useEffect(() => {
    if (!isEditing) return;
    (async () => {
      try {
        const pool = await api.getPool(params.edit as string);
        if (!pool) throw new Error("This journey no longer exists.");
        setFrom(pool.from_location); setTo(pool.to_location);
        const ist = toISTParts(new Date(pool.travel_datetime)); setDate(ist.date); setTime(ist.time);
        setGenderPref(pool.gender_preference || "any"); setCompanions(pool.companions || 0); setTotalSeats(pool.total_seats || 4); setLuggage(pool.luggage || ""); setNotes(pool.notes || "");
      } catch (e: any) { Alert.alert("Couldn't load journey", e.message || "Try again"); router.back(); }
      finally { setLoadingExisting(false); }
    })();
  }, [isEditing, params.edit]);

  useEffect(() => { const h = setTimeout(() => from.trim().length >= 2 ? api.searchLocations(from.trim(), 5).then(setFromSuggestions).catch(() => setFromSuggestions([])) : setFromSuggestions([]), 180); return () => clearTimeout(h); }, [from]);
  useEffect(() => { const h = setTimeout(() => to.trim().length >= 2 ? api.searchLocations(to.trim(), 5).then(setToSuggestions).catch(() => setToSuggestions([])) : setToSuggestions([]), 180); return () => clearTimeout(h); }, [to]);

  const readiness = useMemo(() => { let score = 0; if (from.trim()) score += 30; if (to.trim()) score += 30; if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)) score += 20; if (totalSeats >= companions + 1) score += 10; if (notes.trim() || luggage.trim() || genderPref === "same") score += 10; return score; }, [from, to, date, time, totalSeats, companions, notes, luggage, genderPref]);
  const readinessLabel = readiness >= 90 ? "Ready to match" : readiness >= 70 ? "Strong journey" : readiness >= 45 ? "Good start" : "Add the basics";
  const applyDatePreset = (days: number) => { const d = new Date(Date.now() + days * 86400000); setDate(toISTParts(d).date); if (days === 0) setTime(toISTParts(new Date(Date.now() + 60 * 60 * 1000)).time); Haptics.selectionAsync(); };
  const pickFrom = (value: string) => { setFrom(value); setFromSuggestions([]); Haptics.selectionAsync(); };
  const pickTo = (value: string) => { setTo(value); setToSuggestions([]); Haptics.selectionAsync(); };

  const rememberRecent = async (payload: any) => {
    const next = [{ from_location: payload.from_location, to_location: payload.to_location, total_seats: payload.total_seats, luggage: payload.luggage, used_at: new Date().toISOString() }, ...recentRoutes.filter((r) => `${r.from_location}::${r.to_location}`.toLowerCase() !== `${payload.from_location}::${payload.to_location}`.toLowerCase())].slice(0, 5);
    setRecentRoutes(next); await storage.secureSet(RECENT_KEY, JSON.stringify(next)); await storage.secureRemove(DRAFT_KEY);
  };

  const doSubmit = async (payload: any) => {
    setSubmitting(true);
    try { if (isEditing) await api.updatePool(params.edit as string, payload); else { await api.createPool(payload); await rememberRecent(payload); } Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); router.back(); }
    catch (e: any) { Alert.alert(isEditing ? "Couldn't save" : "Couldn't post", e.message || "Try again"); }
    finally { setSubmitting(false); }
  };

  const submit = async () => {
    if (!from.trim() || !to.trim()) return Alert.alert("Missing route", "Choose both a pickup and destination.");
    if (from.trim().toLowerCase() === to.trim().toLowerCase()) return Alert.alert("Check route", "Pickup and destination can't be the same.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return Alert.alert("Invalid time", "Choose a valid date and time.");
    if (companions + 1 > totalSeats) return Alert.alert("Not enough seats", "Seat capacity must include you and your companions.");
    const iso = istPartsToUTCISO(date, time);
    const payload = { from_location: from.trim(), to_location: to.trim(), travel_datetime: iso, gender_preference: genderPref, companions, total_seats: totalSeats, luggage: luggage.trim() || null, notes: notes.trim() || null, trip_mode: false };
    if (!isEditing) {
      setSubmitting(true);
      try {
        const duplicates = await api.duplicateJourneys(payload.from_location, payload.to_location, iso);
        if (duplicates?.length) { setSubmitting(false); const best = duplicates[0]; Alert.alert("A similar ride already exists", `${best.user_name || "A student"} is travelling ${best.from_location} → ${best.to_location}, only ${best.time_delta_minutes} min from your time.`, [{ text: "View existing", onPress: () => router.push(`/pool/${best.pool_id}` as any) }, { text: "Post anyway", onPress: () => doSubmit(payload) }, { text: "Cancel", style: "cancel" }]); return; }
      } catch {} finally { setSubmitting(false); }
    }
    await doSubmit(payload);
  };

  if (loadingExisting) return <SafeAreaView style={styles.safe}><View style={styles.loading}><ActivityIndicator color={colors.indigo} /></View></SafeAreaView>;
  return <SafeAreaView style={styles.safe} edges={["top", "bottom"]}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
    <View style={styles.header}><Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="close" size={26} color={colors.onSurface} /></Pressable><View><Text style={styles.title}>{isEditing ? "Edit journey" : "Post a journey"}</Text><Text style={styles.subtitle}>Route first. Everything else is optional context.</Text></View><View style={{ width: 26 }} /></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {draftRestored ? <View style={styles.draftBanner}><Ionicons name="document-text-outline" size={17} color={colors.indigo} /><View style={{ flex: 1 }}><Text style={styles.draftTitle}>Draft restored</Text><Text style={styles.help}>Your unfinished journey was kept on this device.</Text></View><Pressable onPress={() => { storage.secureRemove(DRAFT_KEY); setDraftRestored(false); }}><Text style={styles.clearText}>Dismiss</Text></Pressable></View> : null}
      <View style={styles.readiness}><View style={styles.readinessTop}><View><Text style={styles.eyebrow}>JOURNEY READINESS</Text><Text style={styles.readinessTitle}>{readinessLabel}</Text></View><Text style={styles.readinessScore}>{readiness}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${readiness}%` }]} /></View></View>

      {recentRoutes.length > 0 ? <View style={styles.block}><Text style={styles.label}>Recent & repeat</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{recentRoutes.map((r, i) => <Pressable key={`${r.from_location}-${r.to_location}`} onPress={() => { setFrom(r.from_location); setTo(r.to_location); if (r.total_seats) setTotalSeats(r.total_seats); }} style={styles.quickChip}><Ionicons name={i === 0 ? "repeat" : "time-outline"} size={13} color={colors.saffron} /><Text style={styles.quickText}>{r.from_location} → {r.to_location}</Text></Pressable>)}</ScrollView></View> : null}
      {savedRoutes.length > 0 ? <View style={styles.block}><Text style={styles.label}>Saved routes</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{savedRoutes.slice(0, 6).map((r) => <Pressable key={r.saved_route_id} onPress={() => { setFrom(r.from_location); setTo(r.to_location); }} style={styles.quickChip}><Ionicons name="bookmark" size={13} color={colors.indigo} /><Text style={styles.quickText}>{r.label}</Text></Pressable>)}</ScrollView></View> : null}

      <View style={styles.routeCard}>
        <RouteField label="From" value={from} onChange={setFrom} placeholder="Campus, airport, station…" dot={colors.saffron} styles={styles} />
        {fromSuggestions.length ? <SuggestionList items={fromSuggestions} onPick={pickFrom} styles={styles} colors={colors} /> : null}
        <View style={styles.routeDivider} />
        <View style={styles.routeRow}><View style={[styles.dot, { backgroundColor: colors.indigo }]} /><View style={{ flex: 1 }}><Text style={styles.label}>To</Text><TextInput value={to} onChangeText={setTo} placeholder="Where are you going?" placeholderTextColor={colors.muted} style={styles.routeInput} /></View><Pressable onPress={() => { const v = from; setFrom(to); setTo(v); }} style={styles.swap}><Ionicons name="swap-vertical" size={18} color={colors.indigo} /></Pressable></View>
        {toSuggestions.length ? <SuggestionList items={toSuggestions} onPick={pickTo} styles={styles} colors={colors} /> : null}
      </View>
      {quickLocations.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { marginBottom: 20 }]}>{quickLocations.slice(0, 8).map((loc) => <Pressable key={loc.id || loc.name} onPress={() => !from.trim() ? pickFrom(loc.name) : pickTo(loc.name)} style={styles.placeChip}><Ionicons name={loc.kind === "airport" ? "airplane" : loc.kind === "railway" ? "train" : loc.kind === "university" ? "school" : "location"} size={13} color={colors.saffron} /><Text style={styles.quickText}>{loc.short_name || loc.name}</Text></Pressable>)}</ScrollView> : null}

      <View style={styles.block}>
        <Text style={styles.label}>When are you leaving?</Text>
        <View style={styles.presetRow}>{[0,1,2].map((days) => <Pressable key={days} onPress={() => applyDatePreset(days)} style={styles.preset}><Text style={styles.presetText}>{days === 0 ? "Today" : days === 1 ? "Tomorrow" : "In 2 days"}</Text></Pressable>)}</View>
        <View style={styles.row}><DateTimeField mode="date" value={date} onChangeText={setDate} /><DateTimeField mode="time" value={time} onChangeText={setTime} /></View>
        <Text style={styles.help}>Times are shown in IST. Use the calendar and clock controls to choose them.</Text>
      </View>

      <View style={styles.row}><Counter label="Companions" value={companions} min={0} max={Math.max(0,totalSeats-1)} onChange={setCompanions} styles={styles} colors={colors} /><Counter label="Total seats" value={totalSeats} min={Math.max(1,companions+1)} max={8} onChange={setTotalSeats} styles={styles} colors={colors} /></View>
      <View style={styles.seatHint}><Ionicons name="people" size={15} color={colors.success} /><Text style={styles.help}>{Math.max(0,totalSeats-companions-1)} seat{Math.max(0,totalSeats-companions-1) === 1 ? "" : "s"} available for UniPool travellers.</Text></View>
      <View style={styles.block}><Text style={styles.label}>Traveller preference</Text><View style={styles.row}>{(["any","same"] as const).map((g) => <Pressable key={g} onPress={() => setGenderPref(g)} style={[styles.segment, genderPref === g && styles.segmentActive]}><Text style={[styles.segmentText, genderPref === g && { color: "#fff" }]}>{g === "any" ? "Anyone" : "Same gender"}</Text></Pressable>)}</View></View>
      <View style={styles.block}><Text style={styles.label}>Luggage</Text><TextInput value={luggage} onChangeText={setLuggage} placeholder="e.g. 1 suitcase + backpack" placeholderTextColor={colors.muted} style={styles.input} /></View>
      <View style={styles.block}><Text style={styles.label}>Pickup context / notes</Text><TextInput value={notes} onChangeText={(v) => setNotes(v.slice(0,240))} placeholder="Gate, landmark, flexibility, cab preference…" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.notes]} /><Text style={styles.counter}>{notes.length}/240</Text></View>
    </ScrollView>
    <View style={styles.footer}><Pressable disabled={submitting} onPress={submit} style={[styles.submit, submitting && { opacity: .6 }]}>{submitting ? <ActivityIndicator color="#fff" /> : <><Ionicons name={isEditing ? "checkmark" : "paper-plane"} size={18} color="#fff" /><Text style={styles.submitText}>{isEditing ? "Save journey" : "Check matches & post"}</Text></>}</Pressable></View>
  </KeyboardAvoidingView></SafeAreaView>;
}

function RouteField({ label, value, onChange, placeholder, dot, styles }: any) { return <View style={styles.routeRow}><View style={[styles.dot, { backgroundColor: dot }]} /><View style={{ flex: 1 }}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} style={styles.routeInput} /></View></View>; }
function SuggestionList({ items, onPick, styles, colors }: any) { return <View style={styles.suggestions}>{items.map((item: Location) => <Pressable key={item.id || item.name} onPress={() => onPick(item.name)} style={styles.suggestion}><Ionicons name={item.kind === "airport" ? "airplane" : item.kind === "railway" ? "train" : item.kind === "university" ? "school" : "location"} size={14} color={colors.indigo} /><View style={{ flex: 1 }}><Text style={styles.suggestionTitle}>{item.name}</Text>{item.city ? <Text style={styles.suggestionSub}>{item.city}</Text> : null}</View></Pressable>)}</View>; }
function Counter({ label, value, min, max, onChange, styles, colors }: any) { return <View style={[styles.block,{flex:1}]}><Text style={styles.label}>{label}</Text><View style={styles.stepper}><Pressable onPress={() => onChange(Math.max(min,value-1))} style={styles.stepBtn}><Ionicons name="remove" size={18} color={colors.onSurface} /></Pressable><Text style={styles.stepValue}>{value}</Text><Pressable onPress={() => onChange(Math.min(max,value+1))} style={styles.stepBtn}><Ionicons name="add" size={18} color={colors.onSurface} /></Pressable></View></View>; }

const makeStyles = (colors: any) => StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.surface},loading:{flex:1,alignItems:"center",justifyContent:"center"},header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingHorizontal:SPACING.lg,paddingVertical:SPACING.md,borderBottomWidth:1,borderBottomColor:colors.border,backgroundColor:colors.card},title:{color:colors.onSurface,fontSize:FONT.xl,fontWeight:"900",textAlign:"center",fontFamily:FONT_DISPLAY},subtitle:{color:colors.muted,fontSize:10,textAlign:"center",marginTop:2},content:{width:"100%",maxWidth:720,alignSelf:"center",padding:SPACING.lg,paddingBottom:145},
  draftBanner:{minHeight:62,flexDirection:"row",alignItems:"center",gap:9,backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.border,borderRadius:RADIUS.lg,padding:11,marginBottom:12},draftTitle:{color:colors.onSurface,fontSize:11,fontWeight:"900"},clearText:{color:colors.indigo,fontSize:10,fontWeight:"900"},
  readiness:{backgroundColor:colors.surface2,borderRadius:RADIUS.lg,borderWidth:1,borderColor:colors.border,padding:14,marginBottom:18},readinessTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},eyebrow:{color:colors.muted,fontSize:9,fontWeight:"900",letterSpacing:1},readinessTitle:{color:colors.onSurface,fontSize:16,fontWeight:"900",marginTop:3},readinessScore:{color:colors.saffron,fontSize:20,fontWeight:"900"},track:{height:6,borderRadius:3,backgroundColor:colors.border,marginTop:10,overflow:"hidden"},fill:{height:"100%",backgroundColor:colors.saffron},
  block:{marginBottom:18},label:{color:colors.muted,fontSize:10,fontWeight:"900",letterSpacing:.5,marginBottom:6,textTransform:"uppercase"},help:{color:colors.muted,fontSize:10,lineHeight:15,marginTop:5},chips:{gap:7},quickChip:{flexDirection:"row",alignItems:"center",gap:5,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:15,paddingHorizontal:10,paddingVertical:7,maxWidth:260},placeChip:{flexDirection:"row",alignItems:"center",gap:5,backgroundColor:colors.surface2,borderWidth:1,borderColor:colors.border,borderRadius:15,paddingHorizontal:10,paddingVertical:7},quickText:{color:colors.onSurface,fontSize:10,fontWeight:"800"},
  routeCard:{backgroundColor:colors.card,borderRadius:20,borderWidth:1,borderColor:colors.border,padding:14,marginBottom:10},routeRow:{flexDirection:"row",alignItems:"center",gap:10},dot:{width:9,height:9,borderRadius:5},routeInput:{color:colors.onSurface,fontSize:15,fontWeight:"800",paddingVertical:6},routeDivider:{height:1,backgroundColor:colors.border,marginVertical:9,marginLeft:19},swap:{width:35,height:35,borderRadius:18,backgroundColor:colors.surface2,alignItems:"center",justifyContent:"center"},suggestions:{marginLeft:18,borderWidth:1,borderColor:colors.border,borderRadius:12,overflow:"hidden",marginTop:5},suggestion:{flexDirection:"row",alignItems:"center",gap:8,padding:9,backgroundColor:colors.surface2,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.border},suggestionTitle:{color:colors.onSurface,fontSize:11,fontWeight:"800"},suggestionSub:{color:colors.muted,fontSize:9,marginTop:1},
  presetRow:{flexDirection:"row",gap:7,marginBottom:8},preset:{backgroundColor:colors.surface2,borderRadius:15,paddingHorizontal:11,paddingVertical:7,borderWidth:1,borderColor:colors.border},presetText:{color:colors.onSurface,fontSize:10,fontWeight:"800"},row:{flexDirection:"row",gap:10},input:{backgroundColor:colors.card,borderRadius:RADIUS.md,borderWidth:1,borderColor:colors.border,paddingHorizontal:12,paddingVertical:11,color:colors.onSurface,fontSize:12},notes:{minHeight:84,textAlignVertical:"top"},counter:{color:colors.muted,fontSize:9,textAlign:"right",marginTop:4},stepper:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:colors.card,borderRadius:RADIUS.md,borderWidth:1,borderColor:colors.border,padding:6},stepBtn:{width:34,height:34,borderRadius:17,backgroundColor:colors.surface2,alignItems:"center",justifyContent:"center"},stepValue:{color:colors.onSurface,fontSize:16,fontWeight:"900"},seatHint:{flexDirection:"row",alignItems:"center",gap:7,marginTop:-10,marginBottom:18},segment:{flex:1,minHeight:42,borderRadius:21,borderWidth:1,borderColor:colors.border,backgroundColor:colors.card,alignItems:"center",justifyContent:"center"},segmentActive:{backgroundColor:colors.indigo,borderColor:colors.indigo},segmentText:{color:colors.onSurface,fontSize:11,fontWeight:"800"},footer:{position:"absolute",left:0,right:0,bottom:0,padding:SPACING.lg,borderTopWidth:1,borderTopColor:colors.border,backgroundColor:colors.surface},submit:{minHeight:52,borderRadius:26,backgroundColor:colors.indigo,alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8,maxWidth:720,width:"100%",alignSelf:"center"},submitText:{color:"#fff",fontSize:13,fontWeight:"900"},
});