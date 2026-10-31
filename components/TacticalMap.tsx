"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
export default function TacticalMap({
  latitude,
  longitude,
  accuracyM,
  citizenName,
  isEmergency,
}: {
  latitude: number;
  longitude: number;
  accuracyM: number;
  citizenName: string;
  isEmergency: boolean;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const radius = useRef<L.Circle | null>(null);
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current).setView([latitude, longitude], 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(instance);
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    marker.current?.remove();
    radius.current?.remove();
    // Leaflet needs a literal colour: resolve the theme token at the map's own element.
    const token = getComputedStyle(element.current!).getPropertyValue(
      isEmergency ? "--c-danger" : "--c-safe",
    );
    const color = `oklch(${token.trim()})`;
    const label = document.createElement("span");
    label.textContent = citizenName + " · last-known location";
    marker.current = L.circleMarker([latitude, longitude], {
      radius: 8,
      color,
      fillOpacity: 1,
    })
      .addTo(instance)
      .bindTooltip(label);
    radius.current = L.circle([latitude, longitude], {
      radius: accuracyM,
      color,
      fillOpacity: 0.12,
    }).addTo(instance);
    instance.panTo([latitude, longitude]);
  }, [latitude, longitude, accuracyM, citizenName, isEmergency]);
  return (
    <div className="relative h-full min-h-[140px] isolate">
      <div ref={element} className="h-full min-h-[140px]" />
      <span className="absolute top-2 left-12 z-[400] bg-paper-2 text-ink border border-rule px-2 py-1 text-xs rounded-md">
        Last-known location · ±{Math.round(accuracyM)}m
      </span>
    </div>
  );
}
