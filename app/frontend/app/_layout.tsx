import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { useAuth, AuthProvider } from "@/src/auth/AuthContext";
import { ThemeProvider, useTheme } from "@/src/theme_context/ThemeContext";
import { applyPremiumFontDefaults } from "@/src/utils/setupFonts";
import AnimatedSplash from "@/src/components/AnimatedSplash";
import WebTopBar from "@/src/components/WebTopBar";
import SiteFooter from "@/src/components/SiteFooter";
import FloatingChatLauncher from "@/src/components/FloatingChatLauncher";
import PolicyConsentGate from "@/src/components/PolicyConsentGate";
import CampusUtilityStrip from "@/src/components/CampusUtilityStrip";
import FirstLoginTour from "@/src/components/FirstLoginTour";
import MessageAlerts from "@/src/components/MessageAlerts";
import WebAlertHost from "@/src/components/WebAlertHost";
import PasswordSetupPrompt from "@/src/components/PasswordSetupPrompt";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();
applyPremiumFontDefaults();

const PUBLIC_ROOTS = new Set(["terms", "privacy", "faq", "community-guidelines"]);

function AuthGate() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();
  const segments = useSegments();
  const parts = segments as unknown as string[];
  const router = useRouter();
  const root = String(parts[0] || "");
  const isPublic = PUBLIC_ROOTS.has(root);
  const isLanding = !root || root === "index";
  const inTabs = root === "(tabs)";
  const onHome = inTabs && (!parts[1] || parts[1] === "index");

  useEffect(() => {
    if (loading) return;

    // Signed-out users can only stay on the landing/legal pages. This avoids
    // maintaining a fragile allow-list every time a new authenticated screen is added.
    if (!user && !isPublic && !isLanding) {
      router.replace("/");
    }

    // Signed-in users are intentionally allowed to remain on the landing page.
    // The landing page is the product front door even when a cached session exists.
  }, [user, loading, isPublic, isLanding, router]);

  if (loading) return <AnimatedSplash />;

  const shell = (
    <View style={{ flex: 1, width: "100%", minWidth: 0, backgroundColor: colors.surface }}>
      {user && !isLanding ? <WebTopBar /> : null}
      {user && onHome ? <CampusUtilityStrip /> : null}
      <View style={{ flex: 1, minWidth: 0, width: "100%" }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface }, animation: "fade_from_bottom" }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />

          <Stack.Screen name="terms" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="privacy" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="faq" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="community-guidelines" options={{ animation: "slide_from_right" }} />

          <Stack.Screen name="post-request" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="notifications" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="people" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="admin" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="campus" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="safety" options={{ animation: "slide_from_right" }} />

          <Stack.Screen name="circles/index" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="circles/personal" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="circles/[groupId]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="circle-tools" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="circle-export" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="circle-invite" options={{ animation: "slide_from_right" }} />

          <Stack.Screen name="games/trivia" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="games/word-scramble" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="games/airport-codes" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="games/destination-detective" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="games/travel-reveal" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="games/daily-challenge" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="games/guess-state" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="games/station-codes" options={{ animation: "slide_from_right" }} />

          <Stack.Screen name="chat/[userId]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="chat/group/[conversationId]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="pool/[poolId]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="trip-live/[poolId]" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="trip-feedback" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="network" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="heatmap" options={{ animation: "slide_from_right" }} />
          <Stack.Screen name="trip-receipt/[poolId]" options={{ animation: "slide_from_bottom" }} />
        </Stack>
      </View>
      {user && !isLanding ? <SiteFooter /> : null}
      {user && !isLanding ? <FloatingChatLauncher /> : null}
      <MessageAlerts />
      {user ? <FirstLoginTour /> : null}
      {user ? <PasswordSetupPrompt /> : null}
    </View>
  );

  return user ? <PolicyConsentGate bypass={isPublic}>{shell}</PolicyConsentGate> : shell;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  useEffect(() => { if (loaded || error) SplashScreen.hideAsync(); }, [loaded, error]);
  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <AuthGate />
            <WebAlertHost />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
