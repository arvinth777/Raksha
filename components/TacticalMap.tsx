"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";

interface TacticalMapProps {
  latitude: number;
  longitude: number;
  citizenName: string;
  isEmergency: boolean;
  patrolDispatched?: boolean;
}

export default function TacticalMap({
  latitude,
  longitude,
  citizenName,
  isEmergency,
  patrolDispatched,
}: TacticalMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const citizenMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // 1. Initialize Leaflet Map
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([latitude, longitude], 15);

      // Dark tactical tiles (CartoDB Dark Matter)
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 19,
          subdomains: "abcd",
        }
      ).addTo(map);

      // Add Zoom Controls
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // 2. Verified Safe Haven Marker (MedPlus 24/7 Pharmacy)
      const safeHavenIcon = L.divIcon({
        className: "custom-div-icon",
        html: `
          <div style="background-color: #065f46; color: #34d399; padding: 4px 8px; border-radius: 9999px; border: 1px solid #10b981; font-size: 11px; font-weight: bold; white-space: nowrap; box-shadow: 0 4px 10px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 4px;">
            <span>🛡️</span>
            <span>MedPlus 24/7 Safe Haven (300m)</span>
          </div>
        `,
        iconSize: [200, 30],
        iconAnchor: [100, 15],
      });
      L.marker([latitude + 0.002, longitude - 0.003], { icon: safeHavenIcon }).addTo(map);

      // 3. Hoysala Patrol #14 Marker
      const hoysalaIcon = L.divIcon({
        className: "custom-div-icon",
        html: `
          <div style="background-color: #1e293b; color: #38bdf8; padding: 4px 8px; border-radius: 8px; border: 1.5px solid #0284c7; font-size: 11px; font-weight: bold; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.6); display: flex; align-items: center; gap: 4px;">
            <span>🚓</span>
            <span>Hoysala Patrol #14 (ETA ~2m)</span>
          </div>
        `,
        iconSize: [180, 30],
        iconAnchor: [90, 15],
      });
      L.marker([latitude - 0.003, longitude + 0.0025], { icon: hoysalaIcon }).addTo(map);

      mapInstanceRef.current = map;
    } else {
      mapInstanceRef.current.setView([latitude, longitude], 15);
    }

    // 4. Update Citizen Live Marker
    const map = mapInstanceRef.current;
    if (citizenMarkerRef.current) {
      citizenMarkerRef.current.remove();
    }

    const citizenIcon = L.divIcon({
      className: "custom-div-icon",
      html: `
        <div style="display: flex; flex-direction: column; align-items: center;">
          <div style="width: 18px; height: 18px; border-radius: 50%; background-color: ${
            isEmergency ? "#ef4444" : "#10b981"
          }; border: 3px solid white; box-shadow: 0 0 16px ${
        isEmergency ? "#ef4444" : "#10b981"
      };"></div>
          <div style="background-color: #070d18; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; border: 1px solid #334155; margin-top: 4px; white-space: nowrap;">
            ${citizenName} (Citizen)
          </div>
        </div>
      `,
      iconSize: [100, 45],
      iconAnchor: [50, 10],
    });

    citizenMarkerRef.current = L.marker([latitude, longitude], { icon: citizenIcon }).addTo(map);

    // Accuracy Circle
    const accuracyCircle = L.circle([latitude, longitude], {
      color: isEmergency ? "#ef4444" : "#10b981",
      fillColor: isEmergency ? "#ef4444" : "#10b981",
      fillOpacity: 0.12,
      radius: 50,
      weight: 1,
    }).addTo(map);

    return () => {
      accuracyCircle.remove();
    };
  }, [latitude, longitude, citizenName, isEmergency]);

  return (
    <div className="relative w-full h-full min-h-[340px] bg-bengaluru-dark rounded-xl overflow-hidden border border-bengaluru-border">
      <div ref={mapContainerRef} className="w-full h-full min-h-[340px]" />
      
      {/* Tactical HUD Overlay Top */}
      <div className="absolute top-3 left-3 z-[400] bg-bengaluru-dark/90 backdrop-blur-md border border-bengaluru-border px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span className="font-bold text-white uppercase tracking-wider text-[11px]">
          Bengaluru Suraksha 112 Grid
        </span>
        <span className="text-slate-400">|</span>
        <span className="text-slate-300 font-mono text-[11px]">
          {latitude.toFixed(4)}° N, {longitude.toFixed(4)}° E
        </span>
      </div>

      {/* Dispatched Patrol HUD */}
      {patrolDispatched && (
        <div className="absolute top-3 right-3 z-[400] bg-emerald-950/90 border border-emerald-500/70 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg animate-pulse">
          <span>🚓</span>
          <span>Hoysala Patrol #14 Dispatched (ETA ~2 mins)</span>
        </div>
      )}
    </div>
  );
}
