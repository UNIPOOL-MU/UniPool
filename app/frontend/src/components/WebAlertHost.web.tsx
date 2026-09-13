import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { createPortal } from "react-dom";
import { alertStore } from "@/src/utils/alert";
import { useTheme } from "@/src/theme_context/ThemeContext";

export default function WebAlertHost() {
  const request = useSyncExternalStore(alertStore.subscribe, alertStore.getSnapshot, alertStore.getServerSnapshot);
  const dialog = useRef<HTMLDialogElement>(null);
  const { colors } = useTheme();
  useEffect(() => {
    if (!request || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, [request]);
  if (Platform.OS !== "web" || typeof document === "undefined" || !request) return null;
  return createPortal(
    <dialog ref={dialog} aria-labelledby="unipool-alert-title" aria-describedby={request.message ? "unipool-alert-message" : undefined}
      onCancel={(event) => {
        event.preventDefault();
        const cancel = request.buttons.find((button) => button.style === "cancel");
        if (cancel || request.options?.cancelable) alertStore.finish(request, cancel);
      }}
      style={{ width: "min(420px, calc(100% - 32px))", boxSizing: "border-box", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", padding: 22, borderRadius: 20, border: `1px solid ${colors.border}`, background: colors.card, color: colors.onSurface, fontFamily: "inherit", boxShadow: "0 18px 60px rgba(0,0,0,.3)" }}>
      <style>{"dialog::backdrop{background:rgba(0,0,0,.5)}"}</style>
      <h2 id="unipool-alert-title" style={{ margin: "0 0 12px", fontSize: 19 }}>{request.title}</h2>
      {request.message ? <p id="unipool-alert-message" style={{ margin: "0 0 20px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{request.message}</p> : null}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
        {request.buttons.map((button, index) => <button key={index} type="button" autoFocus={button.style === "cancel" || (request.buttons.length === 1)}
          onClick={() => alertStore.finish(request, button)}
          style={{ minHeight: 44, padding: "10px 16px", borderRadius: 22, border: `1px solid ${colors.border}`, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 700, background: button.style === "cancel" ? colors.surface2 : button.style === "destructive" ? colors.error : colors.indigo, color: button.style === "cancel" ? colors.onSurface : "#fff" }}>{button.text || "OK"}</button>)}
      </div>
    </dialog>, document.body,
  );
}
