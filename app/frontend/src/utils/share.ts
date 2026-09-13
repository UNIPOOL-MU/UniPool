import { Platform, Share } from "react-native";
import { Alert } from "@/src/utils/alert";

export async function shareText(payload: { title: string; text: string; url?: string }) {
  const message = [payload.text, payload.url].filter(Boolean).join("\n");
  if (Platform.OS === "web") {
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share(payload); return; }
      catch (error: any) { if (error?.name === "AbortError") return; }
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        Alert.alert("Copied", "Share it anywhere you like.");
        return;
      }
    } catch { /* Show selectable text when clipboard permission is unavailable. */ }
    Alert.alert("Copy this to share", message);
    return;
  }
  try { await Share.share({ title: payload.title, message }); }
  catch (error: any) { Alert.alert("Couldn't share", error?.message || "Please try again."); }
}
