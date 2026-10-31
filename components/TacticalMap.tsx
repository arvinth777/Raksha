"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { Navigation, LocateFixed } from "lucide-react";

interface TacticalMapProps {
  latitude: number;
  longitude: number;
  accuracyM?: number;
  citizenName: string;
  isEmergency: boolean;
  patrolDispatched?: boolean;
}

export default function TacticalMap({
  latitude,
  longitude,
  accuracyM = 12,
  citizenName,
  isEmergency,
  patrolDispatched,
}: TacticalMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const citizenMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const hoysalaMarkerRef = useRef<L.Marker | null>(null);

  // Initialize Map Once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([latitude, longitude], 16);

    // OpenStreetMap Standard Tiles (No API Key Required)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Verified Safe Haven (24/7 MedPlus Pharmacy)
    const safeHavenIcon = L.divIcon({
      className: "custom-div-icon",
      html: `
        <div style="background-color: #064e3b; color: #a7f3d0; padding: 4px 8px; border-radius: 9999px; border: 1.5px solid #10b981; font-size: 11px; font-weight: bold; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.6); display: flex; align-items: center; gap: 4px;">
          <span>🛡️</span>
          <span>MedPlus 24/7 Safe Haven (300m)</span>
        </div>
      `,
      iconSize: [210, 30],
      iconAnchor: [105, 15],
    });
    L.marker([latitude + 0.0018, longitude - 0.0025], { icon: safeHavenIcon }).addTo(map);

    // Hoysala Patrol #14
    const hoysalaIcon = L.divIcon({
      className: "custom-div-icon",
      html: `
        <div style="background-color: #0f172a; color: #38bdf8; padding: 4px 8px; border-radius: 8px; border: 1.5px solid #0284c7; font-size: 11px; font-weight: bold; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.7); display: flex; align-items: center; gap: 4px;">
          <span>🚓</span>
          <span>Hoysala Patrol #14 (ETA ~2m)</span>
        </div>
      `,
      iconSize: [190, 30],
      iconAnchor: [95, 15],
    });
    hoysalaMarkerRef.current = L.marker([latitude - 0.0028, longitude + 0.002], { icon: hoysalaIcon }).addTo(map);

    mapInstanceRef.current = map;
  }, []);

  // Live Location & State Updates
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Pan map smoothly to new coordinates
    map.panTo([latitude, longitude], { animate: true, duration: 0.8 });

    // Update Citizen Marker
    if (citizenMarkerRef.current) {
      citizenMarkerRef.current.remove();
    }

    const citizenIcon = L.divIcon({
      className: "custom-div-icon",
      html: `
        <div style="display: flex; flex-direction: column; align-items: center;">
          <div style="width: 20px; height: 20px; border-radius: 50%; background-color: ${
            isEmergency ? "#dc2626" : "#059669"
          }; border: 3px solid white; box-shadow: 0 0 20px ${
        isEmergency ? "#ef4444" : "#10b981"
      };"></div>
          <div style="background-color: #070d18; color: white; padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid #334155; margin-top: 4px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.5);">
            ${citizenName} (Live GPS)
          </div>
        </div>
      `,
      iconSize: [120, 50],
      iconAnchor: [60, 10],
    });

    citizenMarkerRef.current = L.marker([latitude, longitude], { icon: citizenIcon }).addTo(map);

    // Update Accuracy Radius Circle
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.remove();
    }

    accuracyCircleRef.current = L.circle([latitude, longitude], {
      color: isEmergency ? "#ef4444" : "#10b981",
      fillColor: isEmergency ? "#ef4444" : "#10b981",
      fillOpacity: 0.15,
      radius: Math.max(accuracyM, 25),
      weight: 1.5,
    }).addTo(map);
  }, [latitude, longitude, accuracyM, citizenName, isEmergency]);

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([latitude, longitude], 16, { animate: true });
    }
  };

  return (
    <div className="relative w-full h-full min-h-[340px] bg-[#070d18] rounded-xl overflow-hidden border border-[#1e293b]">
      <div ref={mapContainerRef} className="w-full h-full min-h-[340px]" />

      {/* Top Left: Live HUD */}
      <div className="absolute top-3 left-3 z-[400] bg-[#070d18]/90 backdrop-blur-md border border-[#1e293b] px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs shadow-lg">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="font-bold text-white uppercase tracking-wider text-[11px]">
          Bengaluru Suraksha 112 Grid
        </span>
        <span className="text-slate-400">|</span>
        <span className="text-emerald-400 font-mono text-[11px] font-semibold">
          {latitude.toFixed(5)}° N, {longitude.toFixed(5)}° E (±{Math.round(accuracyM)}m)
        </span>
      </div>

      {/* Top Right: Dispatched Badge */}
      {patrolDispatched && (
        <div className="absolute top-3 right-3 z-[400] bg-emerald-950/90 border border-emerald-500/70 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-xl animate-pulse">
          <span>🚓</span>
          <span>Hoysala Patrol #14 Dispatched (ETA ~2 mins)</span>
        </div>
      )}

      {/* Bottom Left: Recenter Button */}
      <div className="absolute bottom-3 left-3 z-[400]">
        <button
          onClick={handleRecenter}
          className="bg-[#0f172a]/90 hover:bg-[#1e293b] text-white border border-[#334155] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md backdrop-blur-sm transition-all"
          title="Snap view to Citizen GPS"
        >
          <LocateFixed className="w-3.5 h-3.5 text-emerald-400" />
          <span>Snap to Citizen</span>
        </button>
      </div>
    </div>
  );
}
