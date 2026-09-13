import { Alert as NativeAlert, Platform } from "react-native";
import type { AlertButton, AlertOptions } from "react-native";

export type AlertRequest = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
const pending: AlertRequest[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

// React Native Web's Alert.alert is intentionally empty. Keep native behavior
// on devices and queue browser dialogs, including three-action confirmations.
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    if (Platform.OS !== "web") return NativeAlert.alert(title, message, buttons, options);
    pending.push({ title, message, buttons: buttons?.length ? buttons : [{ text: "OK" }], options });
    notify();
  },
};

export const alertStore = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot: () => pending[0] || null,
  getServerSnapshot: () => null,
  finish(request: AlertRequest, button?: AlertButton) {
    if (pending[0] !== request) return;
    pending.shift();
    notify();
    try {
      const result = button ? button.onPress?.() : request.options?.onDismiss?.();
      Promise.resolve(result).catch(() => Alert.alert("Couldn't complete action", "Please try again."));
    } catch { Alert.alert("Couldn't complete action", "Please try again."); }
  },
};
