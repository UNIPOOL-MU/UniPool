import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, TextInput, KeyboardAvoidingView, ScrollView, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, interpolate } from "react-native-reanimated";

import { useAuth } from "@/src/auth/AuthContext";
import { utilityApi } from "@/src/api/utility";
import { COLORS, SPACING, RADIUS, FONT_DISPLAY } from "@/src/theme";
import BrandFooter from "@/src/components/BrandFooter";
import Turnstile from "@/src/components/Turnstile";

const HERO_URL = "https://raw.githubusercontent.com/um26/UniPool/5b90d0fd059122e21621eb2f5648da2fa64f0505/app/frontend/assets/mu-airport-hero.svg";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type Feature = {
  icon: IconName;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  accent: string;
};

const AUTH_COLORS = {
  text: "#F7F9FF",
  muted: "#AEBBD0",
  blue: "#8FB1FF",
  blueStrong: "#AFC6FF",
  border: "rgba(255,255,255,0.24)",
  borderStrong: "rgba(143,177,255,0.55)",
  surface: "rgba(255,255,255,0.07)",
  error: "#FF8591",
};

const FEATURES: Feature[] = [
  {
    icon: "navigate-circle-outline",
    eyebrow: "RIDES",
    title: "Find a ride that actually fits",
    body: "Plan around your route, departure window and ride preferences instead of browsing a generic carpool list.",
    points: ["Road-aware routes and distance", "Time, cab, luggage and detour preferences", "Saved-route alerts and waitlist support"],
    accent: "#2F67D8",
  },
  {
    icon: "location-outline",
    eyebrow: "LIVE TRIPS",
    title: "Coordinate without the chaos",
    body: "Once a trip starts, UniPool keeps the group on the same page instead of spreading coordination across calls and separate chats.",
    points: ["Getting ready / on my way / here / late statuses", "Explicit temporary location sharing", "Trip polls and final-fare capture"],
    accent: "#0B8F78",
  },
  {
    icon: "wallet-outline",
    eyebrow: "CIRCLES",
    title: "Shared money without spreadsheets",
    body: "Create a Circle for friends, roommates or travel groups and keep shared expenses, reminders and settlements together.",
    points: ["Shared and recurring expenses", "Comments, reminders and settlement history", "CSV records and print-to-PDF summaries"],
    accent: "#E58A16",
  },
  {
    icon: "stats-chart-outline",
    eyebrow: "PERSONAL MONEY",
    title: "Know what you can actually spend",
    body: "Your personal ledger stays separate from what friends owe you, with practical budgeting built around your own cashflow.",
    points: ["Category budgets you can add, edit or delete", "Safe-to-spend per day and week", "Monthly income, spend and net cashflow"],
    accent: "#7A55C7",
  },
  {
    icon: "people-outline",
    eyebrow: "CAMPUS NETWORK",
    title: "Remember the people you travel with",
    body: "Find students, save useful contacts and see genuine academic or travel context you share with them.",
    points: ["Student discovery and saved people", "Mutual academic and travel context", "Circles, chats, polls and campus events"],
    accent: "#C75276",
  },
  {
    icon: "shield-checkmark-outline",
    eyebrow: "TRUST & SAFETY",
    title: "Safety features that stay explicit",
    body: "Trip safety should be useful without pretending to know more than it does. Sharing stays opt-in and trust signals come from actual activity.",
    points: ["Trusted contacts and reporting", "Temporary, user-controlled live sharing", "Structured post-trip feedback"],
    accent: "#237A4B",
  },
];

const JOURNEY_STEPS = [
  { icon: "search-outline" as IconName, n: "01", title: "Plan or find", body: "Choose a route, time and ride preferences, then find compatible campus travellers." },
  { icon: "chatbubbles-outline" as IconName, n: "02", title: "Match and coordinate", body: "Chat, vote in trip polls and use live status or temporary location sharing when the trip starts." },
  { icon: "receipt-outline" as IconName, n: "03", title: "Finish and settle", body: "Record the final fare, move it into a Circle when useful, settle up and leave structured trip feedback." },
];

export default function LoginScreen() {
  const {
    user, loading, signingIn, signInError, clearSignInError, signIn, renderGoogleButton,
    signInWithPassword, signUpWithPassword,
  } = useAuth();
  const router = useRouter();
  const scrollRef = useRef<any>(null);
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= 900;
  const isPhone = screenWidth < 560;
  const travel = useSharedValue(0);

  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [featuresOffset, setFeaturesOffset] = useState(0);

  useEffect(() => {
    travel.value = withRepeat(withTiming(1, { duration: 18000, easing: Easing.linear }), -1, false);
  }, []);
  useEffect(() => {
    if (Platform.OS === "web" && !loading && !user) renderGoogleButton("google-signin-container");
  }, [loading, user, renderGoogleButton]);

  const arrivingPlaneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(travel.value, [0.00,0.08,0.18,0.28,0.52,0.72,0.82], [0,0,1,1,1,1,0]),
    transform: [
      { translateX: interpolate(travel.value, [0.08,0.18,0.32,0.52,0.72,0.82], [-140,-60,screenWidth*0.18,screenWidth*0.50,screenWidth*0.82,screenWidth+80]) },
      { translateY: interpolate(travel.value, [0.08,0.18,0.32,0.52,0.72,0.82], [-90,-70,-35,0,0,0]) },
      { rotate: `${interpolate(travel.value, [0.08,0.32,0.52,0.82], [-14,-7,0,0])}deg` },
      { scale: interpolate(travel.value, [0.08,0.52], [0.68,1]) },
    ],
  }), [screenWidth]);

  const switchMode = (next: "login" | "signup") => {
    setMode(next);
    setLocalError(null);
    clearSignInError();
    if (next === "login") setLegalAccepted(false);
  };

  const scrollToAuth = (next: "login" | "signup" = "signup") => {
    switchMode(next);
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  };

  const go = (path: string) => router.push(path as any);

  const submitPasswordForm = async () => {
    setLocalError(null);
    clearSignInError();
    if (!identifier.trim() || !password) return setLocalError("Please fill in all fields.");
    if (mode === "signup" && !name.trim()) return setLocalError("Please enter your name.");
    if (mode === "signup" && password.length < 8) return setLocalError("Use at least 8 characters for your password.");
    if (mode === "signup" && !legalAccepted) return setLocalError("Please accept the Terms and Privacy Policy to create your account.");

    try {
      if (mode === "login") {
        await signInWithPassword(identifier.trim(), password, turnstileToken);
      } else {
        await signUpWithPassword(identifier.trim(), password, name.trim(), undefined, turnstileToken);
        await utilityApi.recordPolicyConsent("email-signup").catch(() => {});
      }
    } catch {
      // AuthContext exposes the server-safe error text.
    } finally {
      setTurnstileResetKey((k) => k + 1);
    }
  };

  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container} testID="login-screen">
    <ScrollView ref={scrollRef} style={styles.pageScroll} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Image source={{ uri: HERO_URL }} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.heroShade} />
        <View style={styles.heroTint} />

        <View style={[styles.navWrap, isPhone && styles.navWrapPhone]}>
          <View style={styles.logoRow}>
            <View style={[styles.logoBadge, isPhone && styles.logoBadgePhone]}><Ionicons name="car-sport" size={isPhone ? 19 : 22} color={COLORS.saffron} /></View>
            <Text style={[styles.logo, isPhone && styles.logoPhone]}>UniPool</Text>
          </View>
          {user ? <View style={[styles.navActions, isPhone && styles.navActionsPhone]}>
            {!isPhone ? <Pressable onPress={() => go("/campus")} style={styles.navGhost}><Text style={styles.navGhostText}>Campus</Text></Pressable> : null}
            {!isPhone ? <Pressable onPress={() => go("/people")} style={styles.navGhost}><Text style={styles.navGhostText}>People</Text></Pressable> : null}
            <Pressable onPress={() => go("/(tabs)")} style={[styles.navPrimary, isPhone && styles.navPrimaryPhone]}><Text style={styles.navPrimaryText}>{isPhone ? "Home" : "Open UniPool"}</Text></Pressable>
          </View> : <View style={[styles.navActions, isPhone && styles.navActionsPhone]}>
            <Pressable onPress={() => scrollToAuth("login")} style={[styles.navGhost, isPhone && styles.navGhostPhone]}><Text style={styles.navGhostText}>Log in</Text></Pressable>
            <Pressable onPress={() => scrollToAuth("signup")} style={[styles.navPrimary, isPhone && styles.navPrimaryPhone]}><Text style={styles.navPrimaryText}>{isPhone ? "Sign up" : "Create account"}</Text></Pressable>
          </View>}
        </View>

        <View style={[styles.heroInner, isWide ? styles.heroInnerWide : styles.heroInnerNarrow, isPhone && styles.heroInnerPhone]}>
          <View style={styles.heroCopy}>
            <View style={styles.kicker}><Ionicons name="git-compare-outline" size={15} color={COLORS.saffron} /><Text style={styles.kickerText}>BUILT FOR CAMPUS LIFE</Text></View>
            <Text style={[styles.heroTitle, !isWide && styles.heroTitleNarrow, isPhone && styles.heroTitlePhone]}>Campus rides, trip coordination and shared money <Text style={styles.heroTitleAccent}>in one place.</Text></Text>
            <Text style={styles.heroBody}>Find compatible rides, coordinate the trip live, settle the final fare, manage shared expenses and keep useful campus connections together.</Text>

            <View style={styles.heroChips}>
              <HeroChip icon="navigate-outline" label="Find and match rides" />
              <HeroChip icon="location-outline" label="Coordinate live" />
              <HeroChip icon="wallet-outline" label="Split and track money" />
            </View>

            <View style={styles.heroCtas}>
              <Pressable onPress={() => user ? go("/(tabs)") : scrollToAuth("signup")} style={styles.heroPrimaryCta}><Text style={styles.heroPrimaryCtaText}>{user ? "Open your dashboard" : "Start with any email"}</Text><Ionicons name="arrow-forward" size={18} color="#10214A" /></Pressable>
              <Pressable onPress={() => user ? go("/campus") : scrollRef.current?.scrollTo?.({ y: featuresOffset || 760, animated: true })} style={styles.heroSecondaryCta}><Text style={styles.heroSecondaryCtaText}>{user ? "Campus home" : "See the features"}</Text></Pressable>
            </View>
            <Text style={styles.heroMicrocopy}>{user ? `Signed in as ${user.email}. The landing page stays your front door.` : "Sign up with any email. Google is optional. Location sharing stays off until you turn it on."}</Text>
          </View>

          {user ? <View style={[styles.authCard, !isWide && styles.authCardNarrow, isPhone && styles.authCardPhone]}>
            <Text style={styles.authEyebrow}>WELCOME BACK</Text>
            <Text style={styles.authHeading}>Hi, {user.name?.split(" ")[0] || "there"}</Text>
            <Text style={styles.authSubheading}>Your session is still active. Pick up where you want instead of being dropped into a page automatically.</Text>
            <View style={styles.signedInAccount}><View style={styles.signedInAvatar}><Text style={styles.signedInAvatarText}>{user.name?.[0]?.toUpperCase() || "U"}</Text></View><View style={{ flex: 1 }}><Text style={styles.signedInName}>{user.name}</Text><Text style={styles.signedInEmail}>{user.email}</Text></View><Ionicons name="checkmark-circle" size={20} color="#72D7A0" /></View>
            <View style={styles.signedInGrid}>
              <LandingDestination icon="home-outline" label="Home" onPress={() => go("/(tabs)")} />
              <LandingDestination icon="people-outline" label="Matches" onPress={() => go("/(tabs)/matches")} />
              <LandingDestination icon="chatbubbles-outline" label="Chats" onPress={() => go("/(tabs)/messages")} />
              <LandingDestination icon="school-outline" label="Campus" onPress={() => go("/campus")} />
              <LandingDestination icon="wallet-outline" label="Circles" onPress={() => go("/circles")} />
              <LandingDestination icon="person-outline" label="Profile" onPress={() => go("/(tabs)/profile")} />
            </View>
            <Pressable onPress={() => go("/settings")} style={styles.signedInSettings}><Ionicons name="settings-outline" size={16} color={AUTH_COLORS.blueStrong} /><Text style={styles.signedInSettingsText}>Account settings</Text></Pressable>
          </View> : <View style={[styles.authCard, !isWide && styles.authCardNarrow, isPhone && styles.authCardPhone]}>
            <Text style={styles.authEyebrow}>{mode === "signup" ? "JOIN UNIPOOL" : "WELCOME BACK"}</Text>
            <Text style={styles.authHeading}>{mode === "signup" ? "Create your account" : "Log in to UniPool"}</Text>
            <Text style={styles.authSubheading}>{mode === "signup" ? "Use any valid email address." : "Use your email or username and password."}</Text>

            <View style={styles.segmentRow}>
              <Pressable testID="mode-signup" onPress={() => switchMode("signup")} style={[styles.segment, mode === "signup" && styles.segmentActive]}><Text style={[styles.segmentText, mode === "signup" && styles.segmentTextActive]}>Sign up</Text></Pressable>
              <Pressable testID="mode-login" onPress={() => switchMode("login")} style={[styles.segment, mode === "login" && styles.segmentActive]}><Text style={[styles.segmentText, mode === "login" && styles.segmentTextActive]}>Log in</Text></Pressable>
            </View>

            {mode === "signup" && <TextInput testID="signup-name" value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={AUTH_COLORS.muted} style={styles.input} autoCapitalize="words" />}
            <TextInput testID="auth-identifier" value={identifier} onChangeText={(value) => { setIdentifier(value); setLocalError(null); clearSignInError(); }} placeholder={mode === "login" ? "Email or username" : "Email address"} placeholderTextColor={AUTH_COLORS.muted} style={styles.input} autoCapitalize="none" keyboardType={mode === "signup" ? "email-address" : "default"} />
            <TextInput testID="auth-password" value={password} onChangeText={setPassword} placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"} placeholderTextColor={AUTH_COLORS.muted} style={styles.input} secureTextEntry />

            {mode === "signup" ? <Pressable testID="signup-legal-consent" onPress={() => setLegalAccepted((v) => !v)} style={styles.consentRow}><View style={[styles.checkbox, legalAccepted && styles.checkboxOn]}>{legalAccepted ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}</View><Text style={styles.consentText}>I agree to the <Text style={styles.inlineLink} onPress={(e) => { e.stopPropagation?.(); router.push("/terms" as any); }}>Terms & Conditions</Text> and <Text style={styles.inlineLink} onPress={(e) => { e.stopPropagation?.(); router.push("/privacy" as any); }}>Privacy Policy</Text>.</Text></Pressable> : null}
            {(localError || signInError) ? <Text testID="password-auth-error" style={styles.errorText}>{localError || signInError}</Text> : null}
            <Turnstile onToken={setTurnstileToken} resetKey={turnstileResetKey} />
            <Pressable testID="password-auth-submit" onPress={submitPasswordForm} disabled={signingIn} style={[styles.authSubmit, signingIn && styles.disabled]}>
              {signingIn ? <ActivityIndicator color="#10214A" /> : <><Text style={styles.authSubmitText}>{mode === "signup" ? "Create account" : "Log in"}</Text><Ionicons name="arrow-forward" size={17} color="#10214A" /></>}
            </Pressable>

            <View style={styles.dividerRow}><View style={styles.dividerLine} /><Text style={styles.dividerText}>or Google</Text><View style={styles.dividerLine} /></View>
            {Platform.OS === "web" ? <View style={styles.googleBtnWrap}>
              {loading ? <ActivityIndicator color={AUTH_COLORS.blue} /> : signingIn ? <View style={{ alignItems: "center" }}><ActivityIndicator color={AUTH_COLORS.blue} /><Text style={styles.signingInText}>Signing you in...</Text></View> : <><View nativeID="google-signin-container" /><Pressable testID="signin-fallback" onPress={signIn} hitSlop={8} style={{ marginTop: SPACING.sm }}><Text style={styles.fallbackLink}>Google button not showing? Tap here</Text></Pressable></>}
            </View> : <Pressable testID="google-signin-button" onPress={signIn} disabled={loading} style={({ pressed }) => [styles.googleBtn, pressed && { opacity: .85 }]}>
              {loading ? <ActivityIndicator color={AUTH_COLORS.blue} /> : <><View style={styles.gLogo}><Text style={{ fontWeight: "800", color: "#4285F4", fontSize: 18 }}>G</Text></View><Text style={styles.googleText}>Continue with Google</Text></>}
            </Pressable>}
            <Text style={styles.googleLegal}>Google is optional. Regular email signup works with any valid email address.</Text>
          </View>}
        </View>

        <Animated.View pointerEvents="none" style={[styles.animatedPlane, arrivingPlaneStyle]}><Ionicons name="airplane" size={38} color="rgba(255,255,255,0.9)" /></Animated.View>
      </View>

      <View style={styles.promiseStrip}>
        <View style={styles.promiseInner}>
          <PromiseItem icon="car-sport-outline" title="One trip flow" body="Plan, match, coordinate and settle" />
          <PromiseItem icon="people-circle-outline" title="Campus context" body="People, Circles, events and shared travel" />
          <PromiseItem icon="shield-checkmark-outline" title="Explicit safety" body="Temporary sharing and grounded feedback" />
          <PromiseItem icon="wallet-outline" title="Two money views" body="Shared Circle debts plus your personal budget" />
        </View>
      </View>

      <View style={styles.featuresSection} onLayout={(event) => setFeaturesOffset(event.nativeEvent.layout.y)}>
        <View style={styles.sectionInner}>
          <Text style={styles.lightEyebrow}>WHAT YOU CAN DO TODAY</Text>
          <Text style={styles.lightTitle}>Rides are only the start.</Text>
          <Text style={styles.lightLead}>Plan the ride, coordinate it, settle the fare and keep the campus connections you want to use again.</Text>

          <View style={styles.featureGrid}>
            {FEATURES.map((feature) => <FeatureCard key={feature.title} feature={feature} wide={isWide} />)}
          </View>
        </View>
      </View>

      <View style={styles.tripStorySection}>
        <View style={[styles.sectionInner, styles.tripStoryInner]}>
          <View style={styles.storyCopy}>
            <Text style={styles.darkEyebrow}>ONE RIDE, START TO FINISH</Text>
            <Text style={styles.darkTitle}>The trip does not end when you find a match.</Text>
            <Text style={styles.darkLead}>UniPool follows the actual lifecycle: route discovery, compatibility, group coordination, temporary live status, final fare, shared records and post-trip feedback.</Text>
            <View style={styles.storyBadges}>
              <StoryBadge icon="map-outline" label="Road routing" />
              <StoryBadge icon="options-outline" label="Matching controls" />
              <StoryBadge icon="notifications-outline" label="Saved-route alerts" />
              <StoryBadge icon="chatbubbles-outline" label="Trip polls and chat" />
            </View>
          </View>
          <View style={styles.journeyCard}>
            {JOURNEY_STEPS.map((step, index) => <JourneyStep key={step.n} {...step} last={index === JOURNEY_STEPS.length - 1} />)}
          </View>
        </View>
      </View>

      <View style={styles.moneySection}>
        <View style={styles.sectionInner}>
          <View style={[styles.moneySplit, isWide ? styles.moneySplitWide : styles.moneySplitNarrow]}>
            <View style={styles.moneyCopy}>
              <Text style={styles.moneyEyebrow}>MONEY THAT MAKES SENSE</Text>
              <Text style={styles.moneyTitle}>Shared expenses and your own budget should not be the same thing.</Text>
              <Text style={styles.moneyLead}>Circles track who paid and who owes whom. Personal Money tracks your own income, spend, category limits and safe-to-spend. UniPool keeps those jobs separate.</Text>
              <Pressable onPress={() => user ? go("/circles") : scrollToAuth("signup")} style={styles.moneyCta}><Text style={styles.moneyCtaText}>{user ? "Open Circles" : "Create an account"}</Text><Ionicons name="arrow-forward" size={17} color="#fff" /></Pressable>
            </View>
            <View style={styles.moneyCards}>
              <MiniProductCard icon="people-outline" eyebrow="CIRCLES" title="For money with other people" lines={["Split shared expenses", "Recurring bills and reminders", "Settlements, comments and records"]} />
              <MiniProductCard icon="stats-chart-outline" eyebrow="PERSONAL MONEY" title="For your own spending" lines={["Category budgets", "Safe-to-spend day / week", "Income, spend and cashflow"]} />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.safetySection}>
        <View style={[styles.sectionInner, styles.safetyInner]}>
          <View style={styles.safetyIcon}><Ionicons name="shield-checkmark" size={32} color="#BDEBCB" /></View>
          <Text style={styles.safetyEyebrow}>TRUST YOU CAN UNDERSTAND</Text>
          <Text style={styles.safetyTitle}>Useful signals, not a mysterious public score.</Text>
          <Text style={styles.safetyLead}>See real shared context and structured feedback from completed trips. Live location sharing is temporary and opt-in. Trusted contacts and reporting stay available without pretending UniPool is an emergency service.</Text>
          <View style={styles.safetyPills}>
            <SafetyPill text="Structured punctuality feedback" />
            <SafetyPill text="Coordination and behaviour feedback" />
            <SafetyPill text="Trusted contacts" />
            <SafetyPill text="Explicit temporary sharing" />
          </View>
        </View>
      </View>

      <View style={styles.extrasSection}>
        <View style={styles.sectionInner}>
          <Text style={styles.lightEyebrow}>CAMPUS BEYOND THE RIDE</Text>
          <Text style={styles.lightTitle}>The useful extras stay connected.</Text>
          <Text style={styles.lightLead}>Discover students, save people you may travel with again, coordinate inside Circles, RSVP to campus events, and play lightweight games while you wait.</Text>
          <View style={styles.extrasGrid}>
            <ExtraCard icon="people-outline" title="People" body="Search students, save useful contacts and see mutual campus or travel context." />
            <ExtraCard icon="calendar-outline" title="Campus events" body="See campus events and RSVP Going or Interested from Campus Home." />
            <ExtraCard icon="chatbubble-ellipses-outline" title="Circle coordination" body="Group chat, polls, shared ride links and recurring bills around the same group." />
            <ExtraCard icon="game-controller-outline" title="Time-pass" body="XP and weekly game leaderboards for fun. They do not affect trust or ride matching." />
          </View>
        </View>
      </View>

      <View style={styles.finalCtaSection}>
        <View style={[styles.finalCtaInner, !isWide && { flexDirection: "column", alignItems: "stretch" }]}>
          <View style={styles.finalCopy}>
            <Text style={styles.finalEyebrow}>{user ? "YOU'RE SIGNED IN" : "READY WHEN YOU ARE"}</Text>
            <Text style={styles.finalTitle}>{user ? "Choose where you want to go next." : "Keep the trip in one place from planning to settlement."}</Text>
            <Text style={styles.finalLead}>{user ? "Your session stays active while this landing page remains the default entry point." : "Create a UniPool account with any valid email, or use Google if you prefer."}</Text>
          </View>
          <View style={styles.finalButtons}>
            <Pressable onPress={() => user ? go("/(tabs)") : scrollToAuth("signup")} style={styles.finalPrimary}><Text style={styles.finalPrimaryText}>{user ? "Open Home" : "Create account"}</Text><Ionicons name={user ? "arrow-forward" : "arrow-up"} size={17} color="#10214A" /></Pressable>
            <Pressable onPress={() => user ? go("/campus") : scrollToAuth("login")} style={styles.finalSecondary}><Text style={styles.finalSecondaryText}>{user ? "Campus" : "Log in"}</Text></Pressable>
          </View>
        </View>
        <View style={styles.footerRow}><Ionicons name="shield-checkmark" size={14} color={AUTH_COLORS.muted} /><Text style={styles.footerText}>Safe rides. Real people. Clear shared-money records.</Text></View>
        <BrandFooter />
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function LandingDestination({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.signedInDestination, pressed && { opacity: 0.78 }]}><Ionicons name={icon} size={20} color={AUTH_COLORS.blueStrong} /><Text style={styles.signedInDestinationText}>{label}</Text><Ionicons name="chevron-forward" size={15} color={AUTH_COLORS.muted} /></Pressable>;
}

function HeroChip({ icon, label }: { icon: IconName; label: string }) {
  return <View style={styles.heroChip}><Ionicons name={icon} size={15} color="#DCE7FF" /><Text style={styles.heroChipText}>{label}</Text></View>;
}

function PromiseItem({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return <View style={styles.promiseItem}><View style={styles.promiseIcon}><Ionicons name={icon} size={19} color={COLORS.saffron} /></View><View style={{ flex: 1 }}><Text style={styles.promiseTitle}>{title}</Text><Text style={styles.promiseBody}>{body}</Text></View></View>;
}

function FeatureCard({ feature, wide }: { feature: Feature; wide: boolean }) {
  return <View style={[styles.featureCard, wide && styles.featureCardWide]}>
    <View style={[styles.featureIcon, { backgroundColor: `${feature.accent}14` }]}><Ionicons name={feature.icon} size={25} color={feature.accent} /></View>
    <Text style={[styles.featureEyebrow, { color: feature.accent }]}>{feature.eyebrow}</Text>
    <Text style={styles.featureTitle}>{feature.title}</Text>
    <Text style={styles.featureBody}>{feature.body}</Text>
    <View style={styles.featurePoints}>{feature.points.map((point) => <View key={point} style={styles.featurePoint}><Ionicons name="checkmark-circle" size={16} color={feature.accent} /><Text style={styles.featurePointText}>{point}</Text></View>)}</View>
  </View>;
}

function StoryBadge({ icon, label }: { icon: IconName; label: string }) {
  return <View style={styles.storyBadge}><Ionicons name={icon} size={15} color="#BBD0FF" /><Text style={styles.storyBadgeText}>{label}</Text></View>;
}

function JourneyStep({ icon, n, title, body, last }: { icon: IconName; n: string; title: string; body: string; last: boolean }) {
  return <View style={styles.journeyStep}>
    <View style={styles.journeyRail}><View style={styles.journeyDot}><Ionicons name={icon} size={17} color="#10214A" /></View>{!last ? <View style={styles.journeyLine} /> : null}</View>
    <View style={styles.journeyContent}><Text style={styles.journeyNumber}>{n}</Text><Text style={styles.journeyTitle}>{title}</Text><Text style={styles.journeyBody}>{body}</Text></View>
  </View>;
}

function MiniProductCard({ icon, eyebrow, title, lines }: { icon: IconName; eyebrow: string; title: string; lines: string[] }) {
  return <View style={styles.miniProductCard}>
    <View style={styles.miniProductHead}><View style={styles.miniProductIcon}><Ionicons name={icon} size={20} color="#C96E00" /></View><Text style={styles.miniProductEyebrow}>{eyebrow}</Text></View>
    <Text style={styles.miniProductTitle}>{title}</Text>
    {lines.map((line) => <View key={line} style={styles.miniLine}><Ionicons name="checkmark" size={16} color="#A75C00" /><Text style={styles.miniLineText}>{line}</Text></View>)}
  </View>;
}

function SafetyPill({ text }: { text: string }) {
  return <View style={styles.safetyPill}><Ionicons name="checkmark-circle-outline" size={16} color="#BDEBCB" /><Text style={styles.safetyPillText}>{text}</Text></View>;
}

function ExtraCard({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return <View style={styles.extraCard}><Ionicons name={icon} size={24} color="#2F5CC6" /><Text style={styles.extraTitle}>{title}</Text><Text style={styles.extraBody}>{body}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#071735" },
  pageScroll: { flex: 1, backgroundColor: "#071735" },
  pageContent: { backgroundColor: "#071735" },

  hero: { position: "relative", overflow: "hidden", paddingBottom: 70, backgroundColor: "#071735" },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,11,29,0.74)" },
  heroTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(22,55,126,0.18)" },
  navWrap: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingHorizontal: 24, paddingTop: 24, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 6 },
  navWrapPhone: { paddingHorizontal: 14, paddingTop: 16 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoBadge: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(7,23,53,0.5)", borderWidth: 1.2, borderColor: "rgba(255,211,107,0.72)", alignItems: "center", justifyContent: "center" },
  logoBadgePhone: { width: 36, height: 36, borderRadius: 18 },
  logo: { fontSize: 28, fontWeight: "800", color: "#fff", letterSpacing: .2, fontFamily: FONT_DISPLAY },
  logoPhone: { fontSize: 23 },
  navActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  navActionsPhone: { gap: 2 },
  navGhost: { minHeight: 40, paddingHorizontal: 15, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  navGhostPhone: { paddingHorizontal: 9, minHeight: 36 },
  navGhostText: { color: "#E8EEFC", fontWeight: "800", fontSize: 13 },
  navPrimary: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: COLORS.saffron, alignItems: "center", justifyContent: "center" },
  navPrimaryPhone: { minHeight: 36, paddingHorizontal: 12 },
  navPrimaryText: { color: "#10214A", fontWeight: "900", fontSize: 13 },

  heroInner: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingHorizontal: 24, paddingTop: 72, zIndex: 4, gap: 42 },
  heroInnerWide: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroInnerNarrow: { flexDirection: "column", paddingTop: 50 },
  heroInnerPhone: { paddingHorizontal: 14, paddingTop: 38, gap: 30 },
  heroCopy: { flex: 1, maxWidth: 650 },
  kicker: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,179,77,0.36)", backgroundColor: "rgba(255,179,77,0.08)", paddingHorizontal: 12, paddingVertical: 7 },
  kickerText: { color: "#FFD29B", fontSize: 11, fontWeight: "900", letterSpacing: 1.1 },
  heroTitle: { marginTop: 20, color: "#F9FBFF", fontFamily: FONT_DISPLAY, fontWeight: "800", fontSize: 52, lineHeight: 59, letterSpacing: -.7 },
  heroTitleNarrow: { fontSize: 38, lineHeight: 44 },
  heroTitlePhone: { fontSize: 33, lineHeight: 39 },
  heroTitleAccent: { color: COLORS.saffron },
  heroBody: { color: "#CBD6E8", fontSize: 17, lineHeight: 27, marginTop: 18, maxWidth: 620 },
  heroChips: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 24 },
  heroChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  heroChipText: { color: "#DCE7FF", fontSize: 12, fontWeight: "700" },
  heroCtas: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 27 },
  heroPrimaryCta: { minHeight: 50, borderRadius: 25, backgroundColor: COLORS.saffron, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20 },
  heroPrimaryCtaText: { color: "#10214A", fontWeight: "900", fontSize: 14 },
  heroSecondaryCta: { minHeight: 50, borderRadius: 25, borderWidth: 1, borderColor: "rgba(255,255,255,0.28)", backgroundColor: "rgba(7,23,53,0.28)", alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  heroSecondaryCtaText: { color: "#F2F6FF", fontWeight: "800", fontSize: 14 },
  heroMicrocopy: { color: "#8FA1BD", fontSize: 11, marginTop: 13, fontWeight: "600" },
  animatedPlane: { position: "absolute", left: 0, bottom: 42, zIndex: 3, width: 48, height: 42, alignItems: "center", justifyContent: "center" },

  authCard: { width: 400, borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", backgroundColor: "rgba(5,18,43,0.86)", padding: 24, shadowColor: "#000", shadowOpacity: .24, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  authCardNarrow: { width: "100%", maxWidth: 520, alignSelf: "center" },
  authCardPhone: { padding: 18, borderRadius: 22 },
  authEyebrow: { color: COLORS.saffron, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  authHeading: { color: AUTH_COLORS.text, fontSize: 24, lineHeight: 30, fontWeight: "800", marginTop: 7, fontFamily: FONT_DISPLAY },
  authSubheading: { color: AUTH_COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  signedInAccount: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: AUTH_COLORS.border, backgroundColor: AUTH_COLORS.surface },
  signedInAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(143,177,255,0.14)" },
  signedInAvatarText: { color: AUTH_COLORS.blueStrong, fontSize: 15, fontWeight: "900" },
  signedInName: { color: AUTH_COLORS.text, fontSize: 12, fontWeight: "900" },
  signedInEmail: { color: AUTH_COLORS.muted, fontSize: 9.5, marginTop: 2 },
  signedInGrid: { gap: 8, marginTop: 14 },
  signedInDestination: { minHeight: 44, borderRadius: 14, borderWidth: 1, borderColor: AUTH_COLORS.border, backgroundColor: AUTH_COLORS.surface, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12 },
  signedInDestinationText: { flex: 1, color: AUTH_COLORS.text, fontSize: 11.5, fontWeight: "800" },
  signedInSettings: { minHeight: 40, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, marginTop: 10 },
  signedInSettingsText: { color: AUTH_COLORS.blueStrong, fontSize: 10.5, fontWeight: "800" },
  segmentRow: { flexDirection: "row", backgroundColor: AUTH_COLORS.surface, borderRadius: RADIUS.lg, padding: 3, marginTop: 18, marginBottom: 10, borderWidth: 1, borderColor: AUTH_COLORS.border },
  segment: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.lg },
  segmentActive: { backgroundColor: "#315CCB" },
  segmentText: { color: AUTH_COLORS.muted, fontWeight: "800", fontSize: 13 },
  segmentTextActive: { color: "#fff" },
  input: { minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, borderColor: AUTH_COLORS.border, paddingHorizontal: 14, marginTop: 9, color: AUTH_COLORS.text, backgroundColor: AUTH_COLORS.surface },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 12, paddingVertical: 4 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: AUTH_COLORS.borderStrong, backgroundColor: AUTH_COLORS.surface, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: "#315CCB", borderColor: AUTH_COLORS.blue },
  consentText: { flex: 1, color: AUTH_COLORS.muted, fontSize: 10, lineHeight: 16 },
  inlineLink: { color: AUTH_COLORS.blueStrong, fontWeight: "800" },
  errorText: { marginTop: 9, color: AUTH_COLORS.error, fontWeight: "700", textAlign: "center", fontSize: 11 },
  authSubmit: { minHeight: 48, borderRadius: 24, marginTop: 11, backgroundColor: COLORS.saffron, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  authSubmitText: { color: "#10214A", fontWeight: "900", fontSize: 14 },
  disabled: { opacity: .6 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: AUTH_COLORS.border },
  dividerText: { color: AUTH_COLORS.muted, fontSize: 10, fontWeight: "800" },
  googleBtnWrap: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  googleBtn: { minHeight: 46, borderRadius: RADIUS.md, borderWidth: 1, borderColor: AUTH_COLORS.border, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, paddingHorizontal: 18 },
  googleText: { fontSize: 14, fontWeight: "700", color: "#18202A" },
  gLogo: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  googleLegal: { color: AUTH_COLORS.muted, fontSize: 9.5, textAlign: "center", marginTop: 8, lineHeight: 14 },
  fallbackLink: { color: AUTH_COLORS.blueStrong, fontWeight: "800", fontSize: 11 },
  signingInText: { marginTop: 6, color: AUTH_COLORS.muted, fontSize: 11, textAlign: "center" },

  promiseStrip: { backgroundColor: "#0B1C3F", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" },
  promiseInner: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingHorizontal: 24, paddingVertical: 24, flexDirection: "row", flexWrap: "wrap", gap: 18 },
  promiseItem: { flexGrow: 1, flexBasis: 240, minWidth: 220, flexDirection: "row", alignItems: "center", gap: 11 },
  promiseIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,179,77,0.08)", borderWidth: 1, borderColor: "rgba(255,179,77,0.2)", alignItems: "center", justifyContent: "center" },
  promiseTitle: { color: "#F6F8FD", fontWeight: "800", fontSize: 12 },
  promiseBody: { color: "#95A7C4", fontSize: 10.5, lineHeight: 15, marginTop: 2 },

  sectionInner: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingHorizontal: 24 },
  featuresSection: { backgroundColor: "#F6F3EC", paddingVertical: 86 },
  lightEyebrow: { color: "#C96E00", fontSize: 11, fontWeight: "900", letterSpacing: 1.25 },
  lightTitle: { color: "#14203A", fontSize: 38, lineHeight: 45, fontWeight: "800", marginTop: 9, fontFamily: FONT_DISPLAY },
  lightLead: { color: "#5E6878", fontSize: 16, lineHeight: 25, maxWidth: 760, marginTop: 11 },
  featureGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 36 },
  featureCard: { width: "100%", borderRadius: 24, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8E2D7", padding: 22, shadowColor: "#26334C", shadowOpacity: .05, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  featureCardWide: { flexGrow: 1, flexBasis: "31%", maxWidth: "32%" },
  featureIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  featureEyebrow: { marginTop: 17, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  featureTitle: { color: "#18243D", fontSize: 20, lineHeight: 25, fontWeight: "800", marginTop: 6, fontFamily: FONT_DISPLAY },
  featureBody: { color: "#697281", fontSize: 12.5, lineHeight: 20, marginTop: 8 },
  featurePoints: { marginTop: 15, gap: 8 },
  featurePoint: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  featurePointText: { flex: 1, color: "#465166", fontSize: 11.5, lineHeight: 17, fontWeight: "600" },

  tripStorySection: { backgroundColor: "#112654", paddingVertical: 86 },
  tripStoryInner: { flexDirection: "row", flexWrap: "wrap", gap: 48, alignItems: "center" },
  storyCopy: { flexGrow: 1, flexShrink: 1, minWidth: 0, flexBasis: 480 },
  darkEyebrow: { color: "#FFBC62", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  darkTitle: { color: "#F8FAFF", fontSize: 36, lineHeight: 44, fontWeight: "800", marginTop: 10, fontFamily: FONT_DISPLAY },
  darkLead: { color: "#B9C6DB", fontSize: 15, lineHeight: 24, marginTop: 12, maxWidth: 620 },
  storyBadges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 23 },
  storyBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  storyBadgeText: { color: "#DCE6F7", fontSize: 11, fontWeight: "700" },
  journeyCard: { flexGrow: 1, flexShrink: 1, minWidth: 0, flexBasis: 360, borderRadius: 26, padding: 24, backgroundColor: "#F8FAFF" },
  journeyStep: { flexDirection: "row", gap: 15 },
  journeyRail: { width: 40, alignItems: "center" },
  journeyDot: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#FFD38A", alignItems: "center", justifyContent: "center" },
  journeyLine: { width: 2, flex: 1, minHeight: 48, backgroundColor: "#DCE3EE", marginVertical: 4 },
  journeyContent: { flex: 1, paddingBottom: 23 },
  journeyNumber: { color: "#B66800", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  journeyTitle: { color: "#17233B", fontSize: 17, fontWeight: "800", marginTop: 3 },
  journeyBody: { color: "#657085", fontSize: 11.5, lineHeight: 18, marginTop: 4 },

  moneySection: { backgroundColor: "#FFF0D7", paddingVertical: 86 },
  moneySplit: { gap: 38, alignItems: "center" },
  moneySplitWide: { flexDirection: "row" },
  moneySplitNarrow: { flexDirection: "column" },
  moneyCopy: { flex: 1 },
  moneyEyebrow: { color: "#A75C00", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  moneyTitle: { color: "#3C2A15", fontSize: 35, lineHeight: 43, fontWeight: "800", marginTop: 10, fontFamily: FONT_DISPLAY },
  moneyLead: { color: "#705C45", fontSize: 15, lineHeight: 24, marginTop: 12 },
  moneyCta: { alignSelf: "flex-start", marginTop: 22, minHeight: 46, borderRadius: 23, paddingHorizontal: 17, backgroundColor: "#A75C00", flexDirection: "row", alignItems: "center", gap: 7 },
  moneyCtaText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  moneyCards: { flex: 1, gap: 12, width: "100%" },
  miniProductCard: { borderRadius: 22, backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: "rgba(167,92,0,0.16)", padding: 20 },
  miniProductHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  miniProductIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#FFE2B4", alignItems: "center", justifyContent: "center" },
  miniProductEyebrow: { color: "#A75C00", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  miniProductTitle: { color: "#3C2A15", fontSize: 17, fontWeight: "800", marginTop: 12 },
  miniLine: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9 },
  miniLineText: { color: "#6B5740", fontSize: 11.5, fontWeight: "600" },

  safetySection: { backgroundColor: "#0D3B2B", paddingVertical: 82 },
  safetyInner: { alignItems: "center" },
  safetyIcon: { width: 64, height: 64, borderRadius: 22, backgroundColor: "rgba(189,235,203,0.09)", borderWidth: 1, borderColor: "rgba(189,235,203,0.2)", alignItems: "center", justifyContent: "center" },
  safetyEyebrow: { color: "#BDEBCB", fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginTop: 18 },
  safetyTitle: { color: "#F3FFF7", fontSize: 35, lineHeight: 43, fontWeight: "800", marginTop: 8, textAlign: "center", fontFamily: FONT_DISPLAY },
  safetyLead: { color: "#B9D1C3", fontSize: 14.5, lineHeight: 24, textAlign: "center", maxWidth: 800, marginTop: 11 },
  safetyPills: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 9, marginTop: 24 },
  safetyPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, borderWidth: 1, borderColor: "rgba(189,235,203,0.18)", backgroundColor: "rgba(189,235,203,0.06)", paddingHorizontal: 11, paddingVertical: 8 },
  safetyPillText: { color: "#D9EFE0", fontSize: 11, fontWeight: "700" },

  extrasSection: { backgroundColor: "#F6F3EC", paddingVertical: 82 },
  extrasGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 30 },
  extraCard: { flexGrow: 1, flexBasis: 240, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E7E0D5", padding: 19 },
  extraTitle: { color: "#192640", fontWeight: "800", fontSize: 16, marginTop: 13 },
  extraBody: { color: "#6A7484", fontSize: 11.5, lineHeight: 18, marginTop: 6 },

  finalCtaSection: { backgroundColor: "#071735", paddingTop: 70, paddingBottom: 34 },
  finalCtaInner: { width: "100%", maxWidth: 1040, alignSelf: "center", paddingHorizontal: 24, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 28, borderRadius: 28, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "#102654", paddingVertical: 34 },
  finalCopy: { flexGrow: 1, flexShrink: 1, minWidth: 0, maxWidth: "100%" },
  finalEyebrow: { color: COLORS.saffron, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  finalTitle: { color: "#F8FAFF", fontSize: 28, lineHeight: 35, fontWeight: "800", marginTop: 7, maxWidth: 620, fontFamily: FONT_DISPLAY },
  finalLead: { color: "#AEBBD0", fontSize: 13, lineHeight: 20, marginTop: 7 },
  finalButtons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  finalPrimary: { minHeight: 46, borderRadius: 23, paddingHorizontal: 17, backgroundColor: COLORS.saffron, flexDirection: "row", alignItems: "center", gap: 7 },
  finalPrimaryText: { color: "#10214A", fontWeight: "900", fontSize: 13 },
  finalSecondary: { minHeight: 46, borderRadius: 23, paddingHorizontal: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.24)", alignItems: "center", justifyContent: "center" },
  finalSecondaryText: { color: "#F4F7FD", fontWeight: "800", fontSize: 13 },
  footerRow: { marginTop: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  footerText: { color: AUTH_COLORS.muted, fontSize: 11, fontWeight: "600" },
});
