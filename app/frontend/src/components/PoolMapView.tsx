import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";

import { roadRoute, RoadRoute } from "@/src/api/routing";
import { FONT, RADIUS, SPACING } from "@/src/theme";
import { useTheme } from "@/src/theme_context/ThemeContext";
import { geocode, loadLeafletRoutingMachine } from "@/src/utils/mapUtils";

type Coords = { lat?: number | null; lng?: number | null } | null;
type Pool = {
  pool_id: string;
  user_id?: string;
  user_name: string;
  from_location: string;
  to_location: string;
  from_coords?: Coords;
  to_coords?: Coords;
  user_rating_avg?: number | null;
};

function validCoords(value?: Coords): { lat: number; lng: number } | null {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function distanceLabel(metres: number) {
  if (!Number.isFinite(metres) || metres <= 0) return "Distance unavailable";
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}

function durationLabel(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "ETA unavailable";
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

function providerLabel(provider: string) {
  if (provider === "openrouteservice") return "OpenRouteService";
  if (provider.startsWith("osrm")) return "OpenStreetMap routing";
  return "Road routing";
}

function addRoutingMachineRoute(map: any, from: { lat: number; lng: number }, to: { lat: number; lng: number }, route: RoadRoute) {
  const L = window.L;
  if (!L?.Routing?.control) throw new Error("Route renderer unavailable");
  const coordinates = route.coordinates.map(([lat, lng]) => L.latLng(lat, lng));
  const waypoints = [L.Routing.waypoint(L.latLng(from.lat, from.lng)), L.Routing.waypoint(L.latLng(to.lat, to.lng))];
  const router = {
    route(inputWaypoints: any[], callback: any, context: any) {
      const result = {
        name: "UniPool road route",
        coordinates,
        instructions: [],
        summary: { totalDistance: route.distance_m, totalTime: route.duration_s },
        inputWaypoints,
        waypoints,
        waypointIndices: [0, Math.max(0, coordinates.length - 1)],
      };
      setTimeout(() => callback.call(context || this, null, [result]), 0);
    },
  };

  return L.Routing.control({
    waypoints: [L.latLng(from.lat, from.lng), L.latLng(to.lat, to.lng)],
    router,
    show: false,
    addWaypoints: false,
    draggableWaypoints: false,
    routeWhileDragging: false,
    fitSelectedRoutes: false,
    createMarker: () => null,
    lineOptions: {
      styles: [
        { color: "#FFFFFF", opacity: 0.9, weight: 7 },
        { color: "#2F55B9", opacity: 0.92, weight: 4 },
      ],
      extendToWaypoints: true,
      missingRouteTolerance: 0,
    },
  }).addTo(map);
}

export default function PoolMapView({ pools }: { pools: Pool[] }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const routeControlsRef = useRef<any[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [resolvedCount, setResolvedCount] = useState(0);
  const [roadRouteCount, setRoadRouteCount] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;

    (async () => {
      try {
        setStatus("loading");
        setResolvedCount(0);
        setRoadRouteCount(0);
        await loadLeafletRoutingMachine();
        if (cancelled || !window.L) return;

        if (!mapRef.current) {
          mapRef.current = window.L.map("pool-map-container", { attributionControl: true }).setView([22.9734, 78.6569], 5);
          window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "&copy; OpenStreetMap contributors",
          }).addTo(mapRef.current);
        }

        routeControlsRef.current.forEach((control) => {
          try { mapRef.current.removeControl(control); } catch {}
        });
        routeControlsRef.current = [];
        layersRef.current.forEach((layer) => {
          try { mapRef.current.removeLayer(layer); } catch {}
        });
        layersRef.current = [];

        const uniquePools = pools.slice(0, 15);
        const bounds: [number, number][] = [];

        for (const pool of uniquePools) {
          if (cancelled) return;
          const canonicalFrom = validCoords(pool.from_coords);
          const canonicalTo = validCoords(pool.to_coords);
          const [fromCoords, toCoords] = await Promise.all([
            canonicalFrom ? Promise.resolve(canonicalFrom) : geocode(pool.from_location),
            canonicalTo ? Promise.resolve(canonicalTo) : geocode(pool.to_location),
          ]);

          if (cancelled) return;
          if (!fromCoords || !toCoords) {
            setResolvedCount((count) => count + 1);
            continue;
          }

          let route: RoadRoute | null = null;
          try {
            route = await roadRoute(fromCoords, toCoords);
            if (!cancelled && route.coordinates.length >= 2) {
              const control = addRoutingMachineRoute(mapRef.current, fromCoords, toCoords, route);
              routeControlsRef.current.push(control);
              setRoadRouteCount((count) => count + 1);
              for (const [lat, lng] of route.coordinates) bounds.push([lat, lng]);
            }
          } catch (routeError) {
            console.warn("Road route failed", routeError);
            const fallback = window.L.polyline([[fromCoords.lat, fromCoords.lng], [toCoords.lat, toCoords.lng]], {
              color: "#8B8B8B", weight: 2, opacity: 0.55, dashArray: "6 6",
            }).addTo(mapRef.current);
            layersRef.current.push(fallback);
            bounds.push([fromCoords.lat, fromCoords.lng], [toCoords.lat, toCoords.lng]);
          }

          const ratingText = pool.user_rating_avg ? `★ ${pool.user_rating_avg}/10` : "New traveller";
          const routeText = route
            ? `<br/><strong>${distanceLabel(route.distance_m)} · ${durationLabel(route.duration_s)}</strong><br/><span style="color:#777">Road route via ${providerLabel(route.provider)}</span>`
            : `<br/><span style="color:#888">Road route temporarily unavailable</span>`;

          const fromMarker = window.L.circleMarker([fromCoords.lat, fromCoords.lng], {
            radius: 8, color: "#F57F17", fillColor: "#F57F17", fillOpacity: 0.95, weight: 2,
          }).addTo(mapRef.current);
          const popup = document.createElement("div");
          const person = document.createElement(pool.user_id ? "a" : "strong");
          person.textContent = pool.user_name;
          if (pool.user_id) (person as HTMLAnchorElement).href = `/network?userId=${encodeURIComponent(pool.user_id)}&name=${encodeURIComponent(pool.user_name)}`;
          popup.append(person, document.createElement("br"), document.createTextNode(`${pool.from_location} → ${pool.to_location}`), document.createElement("br"), document.createTextNode(ratingText));
          const summary = document.createElement("div");
          summary.innerHTML = routeText;
          popup.append(summary);
          fromMarker.bindPopup(popup);
          layersRef.current.push(fromMarker);

          const toMarker = window.L.circleMarker([toCoords.lat, toCoords.lng], {
            radius: 6, color: "#2F55B9", fillColor: "#2F55B9", fillOpacity: 0.95, weight: 2,
          }).addTo(mapRef.current);
          toMarker.bindPopup(`<strong>Drop:</strong> ${pool.to_location}${route ? `<br/>${distanceLabel(route.distance_m)} · ${durationLabel(route.duration_s)}` : ""}`);
          layersRef.current.push(toMarker);
          bounds.push([fromCoords.lat, fromCoords.lng], [toCoords.lat, toCoords.lng]);
          setResolvedCount((count) => count + 1);
        }

        if (bounds.length > 0 && mapRef.current) mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
        if (!cancelled) setStatus("ready");
      } catch (e) {
        console.warn("Map load failed", e);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => { cancelled = true; };
  }, [pools]);

  if (Platform.OS !== "web") return <View style={styles.center}><Text style={styles.msg}>Map view is available on the web app.</Text></View>;

  return <View style={{ flex: 1 }}>
    <View nativeID="pool-map-container" style={{ flex: 1 }} />
    {status === "loading" && <View style={styles.overlay} pointerEvents="none"><ActivityIndicator color={colors.indigo} /><Text style={styles.overlayText}>Routing {resolvedCount}/{Math.min(pools.length, 15)} rides…</Text></View>}
    {status === "ready" && roadRouteCount > 0 && <View style={styles.readyBadge} pointerEvents="none"><IoniconsSafe /><Text style={styles.readyText}>{roadRouteCount} road route{roadRouteCount === 1 ? "" : "s"}</Text></View>}
    {status === "error" && <View style={styles.overlay}><Text style={styles.msg}>Couldn't load the map right now.</Text></View>}
    {pools.length === 0 && status === "ready" && <View style={styles.overlay} pointerEvents="none"><Text style={styles.msg}>No pools to show on the map yet.</Text></View>}
  </View>;
}

function IoniconsSafe() {
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#2F55B9" }} />;
}

const makeStyles = (colors: any) => StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  msg: { color: colors.muted, textAlign: "center" },
  overlay: { position: "absolute", top: SPACING.md, alignSelf: "center", backgroundColor: colors.card, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  overlayText: { fontSize: FONT.sm, color: colors.muted, fontWeight: "600" },
  readyBadge: { position: "absolute", bottom: SPACING.md, left: SPACING.md, backgroundColor: colors.card, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border },
  readyText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
});
