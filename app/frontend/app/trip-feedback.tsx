import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { feedbackApi } from "@/src/api/feedback";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { FONT_DISPLAY, RADIUS, SPACING } from "@/src/theme";

const DIMS = ["punctuality", "coordination", "behaviour"] as const;
type Dim = typeof DIMS[number];

export default function TripFeedbackScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [trips, setTrips] = useState<any[]>([]);
  const [trip, setTrip] = useState<any>(null);
  const [person, setPerson] = useState<any>(null);
  const [ratings, setRatings] = useState<Record<Dim, number>>({ punctuality: 5, coordination: 5, behaviour: 5 });
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.travelHistory(60);
      const useful = (rows || []).filter((r: any) => Array.isArray(r.co_travellers) && r.co_travellers.length);
      setTrips(useful);
      setTrip((current: any) => current || useful[0] || null);
      setPerson((current: any) => current || useful[0]?.co_travellers?.[0] || null);
    } catch { setTrips([]); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const chooseTrip = (row: any) => { setTrip(row); setPerson(row.co_travellers?.[0] || null); setNote(""); setRatings({ punctuality: 5, coordination: 5, behaviour: 5 }); };
  const submit = async () => {
    if (!trip?.pool_id || !person?.user_id) return;
    setSaving(true);
    try {
      await feedbackApi.submit({ pool_id: trip.pool_id, rated_user_id: person.user_id, ...ratings, note: note.trim() || undefined });
      Alert.alert("Feedback saved", "Thanks. UniPool keeps this tied to a completed shared trip instead of turning it into a public popularity score.");
      setNote("");
    } catch (e: any) { Alert.alert("Couldn't save feedback", e?.message || "Try again"); }
    finally { setSaving(false); }
  };

  return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={20} color={colors.onSurface} /></Pressable><View style={{ flex: 1 }}><Text style={styles.eyebrow}>POST-TRIP FEEDBACK</Text><Text style={styles.title}>Rate the trip, not the person</Text><Text style={styles.sub}>Punctuality, coordination and behaviour are recorded only after you actually travelled together. There is no public popularity score.</Text></View></View>
    {loading ? <View style={styles.center}><ActivityIndicator color={colors.indigo} /></View> : !trips.length ? <View style={styles.empty}><Ionicons name="car-outline" size={30} color={colors.indigo} /><Text style={styles.cardTitle}>No completed shared trips yet</Text><Text style={styles.muted}>Feedback becomes available after a trip with at least one co-traveller.</Text></View> : <>
      <Text style={styles.label}>Completed trip</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{trips.map((row) => <Pressable key={row.pool_id} onPress={() => chooseTrip(row)} style={[styles.tripChip, trip?.pool_id === row.pool_id && styles.tripChipActive]}><Ionicons name="navigate-outline" size={14} color={trip?.pool_id === row.pool_id ? "#fff" : colors.indigo} /><Text numberOfLines={1} style={[styles.tripText, trip?.pool_id === row.pool_id && { color: "#fff" }]}>{row.from_location} → {row.to_location}</Text></Pressable>)}</ScrollView>
      <Text style={styles.label}>Co-traveller</Text><View style={styles.chips}>{(trip?.co_travellers || []).map((p: any) => <Pressable key={p.user_id} onPress={() => setPerson(p)} style={[styles.personChip, person?.user_id === p.user_id && styles.personChipActive]}><View style={styles.avatar}><Text style={styles.avatarText}>{String(p.name || "S").slice(0,1).toUpperCase()}</Text></View><Text style={[styles.personText, person?.user_id === p.user_id && { color: "#fff" }]}>{p.name || "Student"}</Text></Pressable>)}</View>
      <View style={styles.card}>{DIMS.map((dim) => <View key={dim} style={styles.dimension}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{dim[0].toUpperCase() + dim.slice(1)}</Text><Text style={styles.muted}>{dim === "punctuality" ? "Did they arrive roughly when agreed?" : dim === "coordination" ? "Did they communicate and coordinate clearly?" : "Was the shared trip respectful and comfortable?"}</Text></View><View style={styles.stars}>{[1,2,3,4,5].map((value) => <Pressable key={value} onPress={() => setRatings((old) => ({ ...old, [dim]: value }))} hitSlop={6}><Ionicons name={value <= ratings[dim] ? "star" : "star-outline"} size={22} color={colors.saffron} /></Pressable>)}</View></View>)}<TextInput value={note} onChangeText={setNote} multiline placeholder="Optional private trip note (max 500 characters)" placeholderTextColor={colors.muted} style={styles.input} maxLength={500} /><Pressable disabled={saving || !person} onPress={submit} style={styles.primary}>{saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="checkmark-circle-outline" size={17} color="#fff" /><Text style={styles.primaryText}>Save feedback</Text></>}</Pressable></View>
    </>}
  </ScrollView></SafeAreaView>;
}

const makeStyles = (c: any) => StyleSheet.create({ safe:{flex:1,backgroundColor:c.surface},page:{width:"100%",maxWidth:780,alignSelf:"center",padding:SPACING.lg,paddingBottom:120},header:{flexDirection:"row",gap:12,alignItems:"flex-start",marginBottom:18},back:{width:40,height:40,borderRadius:20,backgroundColor:c.card,borderWidth:1,borderColor:c.border,alignItems:"center",justifyContent:"center"},eyebrow:{color:c.saffron,fontSize:9,fontWeight:"900",letterSpacing:1.1},title:{color:c.onSurface,fontFamily:FONT_DISPLAY,fontSize:27,fontWeight:"900",marginTop:3},sub:{color:c.muted,fontSize:11,lineHeight:17,marginTop:4},center:{minHeight:180,alignItems:"center",justifyContent:"center"},empty:{minHeight:180,alignItems:"center",justifyContent:"center",gap:8,backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:RADIUS.lg,padding:18},label:{color:c.onSurface,fontSize:10,fontWeight:"900",marginTop:8,marginBottom:7},chips:{flexDirection:"row",flexWrap:"wrap",gap:7,paddingBottom:6},tripChip:{maxWidth:280,minHeight:38,borderRadius:19,borderWidth:1,borderColor:c.border,backgroundColor:c.surface2,flexDirection:"row",alignItems:"center",gap:5,paddingHorizontal:10},tripChipActive:{backgroundColor:c.indigo,borderColor:c.indigo},tripText:{color:c.onSurface,fontSize:9,fontWeight:"900",maxWidth:230},personChip:{minHeight:42,borderRadius:21,borderWidth:1,borderColor:c.border,backgroundColor:c.surface2,flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:7,paddingRight:11},personChipActive:{backgroundColor:c.indigo,borderColor:c.indigo},avatar:{width:29,height:29,borderRadius:15,backgroundColor:c.card,alignItems:"center",justifyContent:"center"},avatarText:{color:c.indigo,fontSize:9,fontWeight:"900"},personText:{color:c.onSurface,fontSize:9,fontWeight:"900"},card:{backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:RADIUS.lg,padding:14,gap:8,marginTop:10},dimension:{minHeight:70,flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:10,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:c.border,paddingVertical:8},cardTitle:{color:c.onSurface,fontSize:12,fontWeight:"900"},muted:{color:c.muted,fontSize:9,lineHeight:14,marginTop:2},stars:{flexDirection:"row",gap:2},input:{minHeight:82,borderRadius:12,borderWidth:1,borderColor:c.border,backgroundColor:c.surface2,color:c.onSurface,padding:11,textAlignVertical:"top"},primary:{minHeight:44,borderRadius:22,backgroundColor:c.indigo,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6},primaryText:{color:"#fff",fontSize:10,fontWeight:"900"} });