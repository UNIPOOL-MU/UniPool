import React, { useCallback, useState, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, Platform, Image, TextInput } from "react-native";
import { Alert } from "@/src/utils/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { SPACING, RADIUS, FONT, FONT_DISPLAY } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/auth/AuthContext";
import BrandFooter from "@/src/components/BrandFooter";
import UserBadges from "@/src/components/UserBadges";
import CollegeIdCard from "@/src/components/CollegeIdCard";
import Confetti from "@/src/components/Confetti";
import VerifyCollegeIdModal from "@/src/components/VerifyCollegeIdModal";
import { usePushNotifications } from "@/src/hooks/use-push-notifications";

type ConfirmedTraveler = { user_id: string; name: string; email: string };

type Pool = {
  pool_id: string;
  from_location: string;
  to_location: string;
  travel_datetime: string;
  companions: number;
  status?: string;
  user_name?: string;
  user_email?: string;
  confirmed_travelers?: ConfirmedTraveler[];
};

type JoinRequest = {
  request_id: string;
  pool_id: string;
  from_location: string;
  to_location: string;
  travel_datetime: string;
  requester_id: string;
  requester_name: string;
  requester_rating_avg?: number | null;
  requester_rating_count?: number;
  requester_badges?: { id: string; label: string; icon: string }[];
  status: string;
  created_at: string;
};

function fmt(dt: string) {
  return new Date(dt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export default function ProfileScreen() {
  const { user, signOut, refresh } = useAuth();
  const router = useRouter();
  const push = usePushNotifications();
  const { colors, isDark, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [myPools, setMyPools] = useState<Pool[]>([]);
  const [gender, setGender] = useState<string>(user?.gender || "any");
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [incoming, setIncoming] = useState<JoinRequest[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [removingTraveler, setRemovingTraveler] = useState<string | null>(null);
  const [myRating, setMyRating] = useState<{ average: number | null; count: number }>({ average: null, count: 0 });
  const [myBadges, setMyBadges] = useState<{ id: string; label: string; icon: string }[]>([]);
  const [ridesCompleted, setRidesCompleted] = useState(0);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [blocked, setBlocked] = useState<{ user_id: string; name: string }[]>([]);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const [adminOpen, setAdminOpen] = useState(false);
  const [adminStats, setAdminStats] = useState<any>(null);
  const [adminPools, setAdminPools] = useState<Pool[]>([]);
  const [adminPeople, setAdminPeople] = useState<any[]>([]);
  const [adminPeopleQuery, setAdminPeopleQuery] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [pictureSaving, setPictureSaving] = useState(false);
  const knownBadgeIds = useRef<Set<string> | null>(null);
  const pictureInput = useRef<any>(null);
  const choosePicture = async () => {
    if (Platform.OS !== "web" || pictureSaving) return;
    const file = pictureInput.current?.files?.[0]; if (!file) return;
    if (!file.type?.startsWith("image/") || file.size > 2_000_000) { Alert.alert("Choose a smaller image", "Please select an image under 2 MB."); return; }
    const reader = new FileReader(); reader.onload = async () => { try { setPictureSaving(true); await api.updateProfile({ picture: reader.result }); await refresh(); Alert.alert("Profile picture updated", "Your new picture is now visible across UniPool."); } catch (e: any) { Alert.alert("Couldn't update picture", e?.message || "Try again."); } finally { setPictureSaving(false); } }; reader.readAsDataURL(file);
  };

  const load = useCallback(async () => {
    try {
      const [pools, reqs] = await Promise.all([api.myPools(), api.incomingRequests()]);
      setMyPools(pools);
      setIncoming(reqs);
    } catch {}
    try { setBlocked(await api.listBlocked()); } catch {}
    if (user?.user_id) {
      try {
        const r = await api.getUserRatings(user.user_id);
        setMyRating({ average: r.average, count: r.count });
        setMyBadges(r.badges || []);
        setRidesCompleted(r.rides_completed || 0);

        const newIds = new Set<string>((r.badges || []).map((b: any) => b.id));
        if (knownBadgeIds.current) {
          const gainedNew = [...newIds].some((id) => !knownBadgeIds.current!.has(id));
          if (gainedNew) setConfettiKey((k) => k + 1);
        }
        knownBadgeIds.current = newIds;
      } catch {}
    }
  }, [user?.user_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respond = async (requestId: string, action: "accept" | "decline") => {
    setRespondingId(requestId);
    try {
      if (action === "accept") await api.acceptRequest(requestId);
      else await api.declineRequest(requestId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (action === "accept") setConfettiKey((k) => k + 1);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setRespondingId(null);
    }
  };

  const removeTraveler = (poolId: string, travelerId: string, travelerName: string) => {
    Alert.alert(
      "Remove this traveler?",
      `${travelerName.split(" ")[0]} will no longer be traveling together with you on this pool.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive", onPress: async () => {
            const key = `${poolId}:${travelerId}`;
            setRemovingTraveler(key);
            try {
              await api.removeTraveler(poolId, travelerId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            } catch (e: any) {
              Alert.alert("Error", e.message);
            } finally {
              setRemovingTraveler(null);
            }
          },
        },
      ]
    );
  };

  const unblock = async (userId: string) => {
    setUnblockingId(userId);
    try {
      await api.unblockUser(userId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setUnblockingId(null);
    }
  };

  const saveGender = async (g: string) => {
    const previous = gender;
    setGender(g);
    try { await api.updateProfile({ gender: g }); await refresh(); Haptics.selectionAsync(); } catch (e: any) { setGender(previous); Alert.alert("Couldn't save gender", e?.message || "Please try again."); }
  };

  const remove = async (id: string) => {
    try { await api.deletePool(id); await load(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const closeQuery = async (id: string) => {
    try { await api.closePool(id); await load(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const reopenQuery = async (id: string) => {
    try { await api.reopenPool(id); await load(); Haptics.selectionAsync(); } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const loadAdmin = async () => {
    setAdminLoading(true);
    try {
      const [stats, pools, people] = await Promise.all([api.adminStats(), api.adminPools(), api.adminPeople()]);
      setAdminStats(stats);
      setAdminPools(pools);
      setAdminPeople(people || []);
    } catch (e: any) {
      Alert.alert("Admin error", e.message);
    } finally {
      setAdminLoading(false);
    }
  };

  const toggleAdmin = () => {
    const next = !adminOpen;
    setAdminOpen(next);
    if (next && !adminStats) loadAdmin();
  };

  const adminRemove = async (id: string) => {
    try { await api.adminDeletePool(id); await loadAdmin(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const filtered = myPools.filter((p) => (tab === "open" ? (p.status ?? "open") === "open" : p.status === "closed"));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Confetti burstKey={confettiKey} />
      <VerifyCollegeIdModal
        visible={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        onVerified={async () => {
          setVerifyModalOpen(false);
          await refresh();
          await load();
        }}
      />

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.pool_id}
        contentContainerStyle={{ paddingBottom: 140 }}
        ListHeaderComponent={
          <>
            <LinearGradient colors={isDark ? [colors.surface2, colors.surface3] : [colors.indigo, "#3949AB"]} style={styles.header}>
              <Pressable accessibilityLabel="Edit profile picture" onPress={() => pictureInput.current?.click()} style={styles.avatar}>{user?.picture ? <Image source={{ uri: user.picture }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase() || "U"}</Text>}<View style={styles.avatarEdit}><Ionicons name="camera" size={12} color="#fff" /></View></Pressable>
              {Platform.OS === "web" ? React.createElement("input", { ref: pictureInput, type: "file", accept: "image/*", onChange: choosePicture, style: { display: "none" } }) : null}
              <Text style={styles.name}>{user?.name}</Text>
              <Text style={styles.email}>{user?.email}</Text>
              <View style={styles.myRatingRow} testID="my-rating">
                <Ionicons name="star" size={14} color={colors.saffron} />
                {myRating.average != null ? (
                  <Text style={styles.myRatingText}>{myRating.average.toFixed(1)}/10 · {myRating.count} rating{myRating.count === 1 ? "" : "s"}</Text>
                ) : (
                  <Text style={styles.myRatingText}>No ratings yet</Text>
                )}
              </View>
              {myBadges.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <UserBadges badges={myBadges} />
                </View>
              )}
              {user?.is_admin ? (
                <View style={styles.adminBadge}><Ionicons name="shield-checkmark" size={12} color={colors.indigo} /><Text style={styles.adminBadgeText}>Admin</Text></View>
              ) : null}
            </LinearGradient>

            {user?.college_verified ? (
              <View style={styles.idCardWrap}>
                <CollegeIdCard
                  name={user.name}
                  rollNumber={user.roll_number || ""}
                  schoolName={user.school_name}
                  branchName={user.branch_name}
                  batchYear={user.batch_year}
                  degreeLevelName={user.degree_level_name}
                  email={user.email}
                  collegeEmail={user.college_email}
                  phone={user.phone}
                  bloodGroup={user.blood_group}
                  ratingAvg={myRating.average}
                  ratingCount={myRating.count}
                  ridesCompleted={ridesCompleted}
                  onProfileUpdated={async () => { await refresh(); await load(); }}
                />
              </View>
            ) : (
              <View style={styles.collegeCard} testID="college-id-verify-prompt">
                <View style={styles.collegeCardHeader}>
                  <Ionicons name="shield-outline" size={18} color={colors.muted} />
                  <Text style={styles.collegeCardTitle}>Get your digital Student ID</Text>
                </View>
                <Text style={styles.verifySub}>
                  Verify your @mahindrauniversity.edu.in email — even if you signed in a different way — to unlock the Verified Student badge and a shareable digital ID card.
                </Text>
                <Pressable testID="verify-college-id-btn" onPress={() => setVerifyModalOpen(true)} style={styles.verifyBtn}>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                  <Text style={styles.verifyBtnText}>Verify college ID</Text>
                </Pressable>
              </View>
            )}

            <View style={{ paddingHorizontal: SPACING.lg }}>
            <Text style={styles.sectionLabel}>Preferences</Text>
            <View style={styles.prefRow}>
              {[
                { k: "any", label: "Any gender" },
                { k: "male", label: "Male" },
                { k: "female", label: "Female" },
                { k: "other", label: "Other" },
              ].map((g) => (
                <Pressable
                  key={g.k}
                  testID={`gender-${g.k}`}
                  onPress={() => saveGender(g.k)}
                  style={[styles.prefChip, gender === g.k && styles.prefChipActive]}
                >
                  <Text style={[styles.prefText, gender === g.k && { color: "#fff" }]}>{g.label}</Text>
                </Pressable>
              ))}
            </View>

            {push.supported && (
              <Pressable
                testID="push-toggle"
                onPress={() => (push.subscribed ? push.unsubscribe() : push.subscribe())}
                disabled={push.busy || push.permission === "denied"}
                style={[styles.pushToggle, push.subscribed && styles.pushToggleActive]}
              >
                {push.busy ? (
                  <ActivityIndicator color={push.subscribed ? "#fff" : colors.indigo} size="small" />
                ) : (
                  <Ionicons name={push.subscribed ? "notifications" : "notifications-outline"} size={18} color={push.subscribed ? "#fff" : colors.indigo} />
                )}
                <Text style={[styles.pushToggleText, push.subscribed && { color: "#fff" }]}>
                  {push.permission === "denied"
                    ? "Notifications blocked in browser settings"
                    : push.subscribed
                    ? "Push notifications on"
                    : "Enable push notifications"}
                </Text>
              </Pressable>
            )}

            <View style={styles.themeRow} accessibilityRole="summary">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name={isDark ? "moon" : "sunny"} size={18} color={colors.indigo} />
                <Text style={styles.themeLabel}>Appearance</Text>
              </View>
              <View style={styles.themeSegment}>
                {[
                  { k: "light" as const, icon: "sunny" as const },
                  { k: "system" as const, icon: "phone-portrait" as const },
                  { k: "dark" as const, icon: "moon" as const },
                ].map((opt) => (
                  <Pressable
                    key={opt.k}
                    testID={`theme-${opt.k}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${opt.k} appearance`}
                    accessibilityState={{ selected: mode === opt.k }}
                    onPress={() => { setMode(opt.k); Haptics.selectionAsync(); }}
                    style={[styles.themeOption, mode === opt.k && styles.themeOptionActive]}
                  >
                    <Ionicons name={opt.icon} size={15} color={mode === opt.k ? "#fff" : colors.muted} />
                  </Pressable>
                ))}
              </View>
            </View>

            {blocked.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Blocked Users ({blocked.length})</Text>
                {blocked.map((b) => (
                  <View key={b.user_id} style={styles.blockedRow} testID={`blocked-${b.user_id}`}>
                    <Text style={styles.blockedName}>{b.name}</Text>
                    <Pressable
                      testID={`unblock-${b.user_id}`}
                      onPress={() => unblock(b.user_id)}
                      disabled={unblockingId === b.user_id}
                      style={styles.unblockBtn}
                    >
                      {unblockingId === b.user_id ? (
                        <ActivityIndicator size="small" color={colors.indigo} />
                      ) : (
                        <Text style={styles.unblockText}>Unblock</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
              </>
            )}

            {incoming.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Ride Requests</Text>
                {incoming.map((r) => (
                  <View key={r.request_id} style={styles.reqCard} testID={`incoming-${r.request_id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reqName}>{r.requester_name}</Text>
                      <UserBadges badges={r.requester_badges} compact />
                      <Text style={styles.reqRoute}>{r.from_location} → {r.to_location}</Text>
                      <Text style={styles.reqWhen}>{fmt(r.travel_datetime)}</Text>
                    </View>
                    {respondingId === r.request_id ? (
                      <ActivityIndicator color={colors.indigo} />
                    ) : (
                      <View style={{ flexDirection: "row", gap: SPACING.sm }}>
                        <Pressable
                          testID={`decline-${r.request_id}`}
                          onPress={() => respond(r.request_id, "decline")}
                          style={[styles.reqBtn, styles.reqBtnDecline]}
                          hitSlop={8}
                        >
                          <Ionicons name="close" size={18} color={colors.error} />
                        </Pressable>
                        <Pressable
                          testID={`accept-${r.request_id}`}
                          onPress={() => respond(r.request_id, "accept")}
                          style={[styles.reqBtn, styles.reqBtnAccept]}
                          hitSlop={8}
                        >
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        </Pressable>
                      </View>
                    )}
                  </View>
                ))}
              </>
            )}

            <Text style={styles.sectionLabel}>My Queries</Text>
            <View style={styles.segmentRow}>
              <Pressable testID="mine-tab-open" onPress={() => setTab("open")} style={[styles.segment, tab === "open" && styles.segmentActive]}>
                <Text style={[styles.segmentText, tab === "open" && styles.segmentTextActive]}>Open</Text>
              </Pressable>
              <Pressable testID="mine-tab-closed" onPress={() => setTab("closed")} style={[styles.segment, tab === "closed" && styles.segmentActive]}>
                <Text style={[styles.segmentText, tab === "closed" && styles.segmentTextActive]}>Closed</Text>
              </Pressable>
            </View>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <View style={[styles.mine, { marginHorizontal: SPACING.lg }]} testID={`mine-item-${item.pool_id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mineRoute}>{item.from_location} → {item.to_location}</Text>
              <Text style={styles.mineWhen}>{fmt(item.travel_datetime)}</Text>
              {(item.confirmed_travelers?.length ?? 0) > 0 && (
                <View style={styles.mineTravelersWrap}>
                  {item.confirmed_travelers!.map((t) => {
                    const key = `${item.pool_id}:${t.user_id}`;
                    return (
                      <View key={key} style={styles.mineTravelerChip} testID={`mine-traveler-${key}`}>
                        <Ionicons name="car-sport" size={11} color={colors.success} />
                        <Text style={styles.mineTravelingText}>{t.name.split(" ")[0]}</Text>
                        <Pressable
                          testID={`mine-remove-${key}`}
                          onPress={() => removeTraveler(item.pool_id, t.user_id, t.name)}
                          disabled={removingTraveler === key}
                          hitSlop={6}
                        >
                          {removingTraveler === key ? (
                            <ActivityIndicator size="small" color={colors.error} />
                          ) : (
                            <Ionicons name="close" size={12} color={colors.error} />
                          )}
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
            {tab === "open" ? (
              <>
                <Pressable testID={`edit-${item.pool_id}`} onPress={() => router.push(`/post-request?edit=${item.pool_id}`)} style={styles.actionBtn} hitSlop={8}>
                  <Ionicons name="pencil" size={20} color={colors.indigo} />
                </Pressable>
                <Pressable testID={`close-${item.pool_id}`} onPress={() => closeQuery(item.pool_id)} style={styles.actionBtn} hitSlop={8}>
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
                </Pressable>
              </>
            ) : (
              <>
                <Pressable testID={`receipt-${item.pool_id}`} onPress={() => router.push(`/trip-receipt/${item.pool_id}`)} style={styles.actionBtn} hitSlop={8}>
                  <Ionicons name="receipt-outline" size={20} color={colors.saffron} />
                </Pressable>
                <Pressable testID={`reopen-${item.pool_id}`} onPress={() => reopenQuery(item.pool_id)} style={styles.actionBtn} hitSlop={8}>
                  <Ionicons name="refresh" size={20} color={colors.indigo} />
                </Pressable>
              </>
            )}
            <Pressable testID={`delete-${item.pool_id}`} onPress={() => remove(item.pool_id)} hitSlop={8} style={styles.actionBtn}>
              <Ionicons name="trash" size={20} color={colors.error} />
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyMine}>
            {tab === "open" ? "No open queries. Post one from the Pool tab." : "No closed queries yet."}
          </Text>
        }
        ListFooterComponent={
          <>
            {user?.is_admin ? (
              <View style={{ marginTop: SPACING.xl }}>
                <Pressable testID="admin-panel-toggle" onPress={toggleAdmin} style={styles.adminToggle}>
                  <Ionicons name="shield" size={16} color={colors.indigo} />
                  <Text style={styles.adminToggleText}>Admin panel</Text>
                  <Ionicons name={adminOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.indigo} />
                </Pressable>
                {adminOpen && (
                  <View style={styles.adminPanel}>
                    {adminLoading ? (
                      <ActivityIndicator color={colors.indigo} />
                    ) : (
                      <>
                        {adminStats && (
                          <View style={styles.statsRow}>
                            <Stat label="Users" value={adminStats.total_users} styles={styles} />
                            <Stat label="Open" value={adminStats.open_pools} styles={styles} />
                            <Stat label="Closed" value={adminStats.closed_pools} styles={styles} />
                          </View>
                        )}
                        <Text style={styles.adminSectionTitle}>People directory ({adminPeople.length})</Text>
                        <TextInput value={adminPeopleQuery} onChangeText={setAdminPeopleQuery} placeholder="Filter by name or email" placeholderTextColor={colors.muted} style={styles.adminSearch} />
                        {adminPeople.filter((p) => `${p.name || ""} ${p.email || ""} ${p.username || ""}`.toLowerCase().includes(adminPeopleQuery.toLowerCase())).slice(0, 100).map((p) => (
                          <Pressable key={p.user_id} onPress={() => router.push({ pathname: "/network", params: { userId: p.user_id, name: p.name || "Traveller" } })} style={styles.adminRow}>
                            <View style={{ flex: 1 }}><Text style={styles.adminRoute}>{p.name || "Traveller"}</Text><Text style={styles.adminMeta}>{p.email || "No email"}{p.college_verified ? " · MU verified" : ""}</Text></View><Ionicons name="chevron-forward" size={16} color={colors.muted} />
                          </Pressable>
                        ))}
                        {adminPools.map((p) => (
                          <View key={p.pool_id} style={styles.adminRow} testID={`admin-pool-${p.pool_id}`}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.adminRoute}>{p.from_location} → {p.to_location}</Text>
                              <Text style={styles.adminMeta}>{p.user_name} · {p.user_email} · {p.status ?? "open"}</Text>
                            </View>
                            <Pressable testID={`admin-delete-${p.pool_id}`} onPress={() => adminRemove(p.pool_id)} hitSlop={8}>
                              <Ionicons name="trash" size={18} color={colors.error} />
                            </Pressable>
                          </View>
                        ))}
                      </>
                    )}
                  </View>
                )}
              </View>
            ) : null}
            <Pressable testID="logout-button" onPress={signOut} style={styles.logout}>
              <Ionicons name="log-out-outline" size={18} color={colors.error} />
              <Text style={styles.logoutText}>Sign out</Text>
            </Pressable>
            <BrandFooter />
          </>
        }
      />
    </SafeAreaView>
  );
}

function Stat({ label, value, styles }: { label: string; value: number; styles: any }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { alignItems: "center", paddingVertical: SPACING.xl, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, borderBottomWidth: 1, borderBottomColor: isDark ? colors.border : "rgba(255,255,255,0.18)" },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center", marginBottom: SPACING.md, position: "relative", overflow: "visible" }, avatarImage: { width: 72, height: 72, borderRadius: 36 }, avatarEdit: { position: "absolute", right: -2, bottom: -2, width: 23, height: 23, borderRadius: 12, backgroundColor: colors.saffron, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.indigo },
  avatarText: { color: colors.indigo, fontSize: 28, fontWeight: "800" },
  name: { color: isDark ? colors.onSurface : "#fff", fontSize: FONT.xl, fontWeight: "800", fontFamily: FONT_DISPLAY },
  email: { color: isDark ? colors.onSurface2 : "rgba(255,236,194,0.9)", marginTop: 4 },
  myRatingRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, backgroundColor: isDark ? colors.surface3 : "rgba(255,236,194,0.15)", borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5 },
  myRatingText: { color: isDark ? colors.onSurface : colors.cream, fontSize: 12, fontWeight: "700" },
  adminBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.cream, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4, marginTop: SPACING.sm },
  adminBadgeText: { color: colors.indigo, fontWeight: "800", fontSize: 11 },
  collegeCard: { backgroundColor: colors.card, marginHorizontal: SPACING.lg, marginTop: SPACING.lg, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: colors.border },
  collegeCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  collegeCardTitle: { fontSize: FONT.base, fontWeight: "800", color: colors.onSurface },
  idCardWrap: { marginHorizontal: SPACING.lg, marginTop: SPACING.lg },
  verifySub: { fontSize: FONT.sm, color: colors.muted, marginBottom: SPACING.md, lineHeight: 18 },
  verifyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.indigo, borderRadius: RADIUS.pill, paddingVertical: 12 },
  verifyBtnText: { color: "#fff", fontWeight: "700", fontSize: FONT.sm },
  sectionLabel: { fontSize: FONT.sm, fontWeight: "700", color: colors.muted, marginTop: SPACING.lg, marginBottom: SPACING.sm, letterSpacing: 0.8, textTransform: "uppercase" },
  prefRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  prefChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  prefChipActive: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  prefText: { color: colors.onSurface, fontWeight: "600", fontSize: 13 },

  pushToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: SPACING.md, backgroundColor: colors.card, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.indigo, paddingVertical: 12 },
  pushToggleActive: { backgroundColor: colors.indigo },
  pushToggleText: { color: colors.indigo, fontWeight: "700", fontSize: 13 },
  themeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.md, backgroundColor: colors.surface2, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 14 },
  themeLabel: { color: colors.onSurface, fontWeight: "700", fontSize: 13 },
  themeSegment: { flexDirection: "row", gap: 4, backgroundColor: colors.card, borderRadius: RADIUS.pill, padding: 3, borderWidth: 1, borderColor: colors.border },
  themeOption: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  themeOptionActive: { backgroundColor: colors.indigo },

  segmentRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm },
  segment: { flex: 1, paddingVertical: 10, borderRadius: RADIUS.pill, alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  segmentActive: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  segmentText: { fontWeight: "700", color: colors.onSurface },
  segmentTextActive: { color: "#fff" },

  mine: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: colors.border, gap: SPACING.sm },
  mineRoute: { fontSize: FONT.base, fontWeight: "700", color: colors.onSurface },
  mineWhen: { color: colors.muted, marginTop: 2, fontSize: FONT.sm },
  mineTravelersWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  mineTravelerChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(46,125,50,0.08)", borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 4 },
  mineTravelingText: { color: colors.success, fontSize: 11, fontWeight: "700" },
  actionBtn: { padding: 4 },
  emptyMine: { color: colors.muted, padding: SPACING.md, textAlign: "center" },

  reqCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: colors.saffron, gap: SPACING.sm },
  reqName: { fontSize: FONT.base, fontWeight: "700", color: colors.onSurface },
  reqRoute: { color: colors.onSurface, marginTop: 2, fontSize: FONT.sm, fontWeight: "600" },
  reqWhen: { color: colors.muted, marginTop: 1, fontSize: FONT.sm },
  reqBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  reqBtnAccept: { backgroundColor: colors.success },
  reqBtnDecline: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.error },
  blockedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.card, borderRadius: RADIUS.md, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: colors.border },
  blockedName: { fontSize: FONT.base, fontWeight: "600", color: colors.onSurface },
  unblockBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.indigo },
  unblockText: { color: colors.indigo, fontWeight: "700", fontSize: 12 },

  adminToggle: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.card, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, paddingHorizontal: SPACING.lg, justifyContent: "center" },
  adminToggleText: { color: colors.indigo, fontWeight: "700", flex: 1, textAlign: "center" },
  adminPanel: { marginTop: SPACING.sm, backgroundColor: colors.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, padding: SPACING.md }, adminSectionTitle: { color: colors.onSurface, fontWeight: "900", fontSize: 13, marginTop: SPACING.md, marginBottom: 7 }, adminSearch: { minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: RADIUS.md, paddingHorizontal: 11, color: colors.onSurface, marginBottom: 5 },
  statsRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md },
  statBox: { flex: 1, alignItems: "center", backgroundColor: colors.surface2, borderRadius: RADIUS.md, paddingVertical: SPACING.sm },
  statValue: { fontSize: FONT.xl, fontWeight: "800", color: colors.indigo },
  statLabel: { fontSize: FONT.sm, color: colors.muted, marginTop: 2 },
  adminRow: { flexDirection: "row", alignItems: "center", paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: colors.border },
  adminRoute: { fontWeight: "700", color: colors.onSurface },
  adminMeta: { color: colors.muted, fontSize: FONT.sm, marginTop: 2 },

  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: SPACING.xl, paddingVertical: 14, borderRadius: RADIUS.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.error },
  logoutText: { color: colors.error, fontWeight: "700" },
});
