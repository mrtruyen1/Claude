"use client";

import { useEffect, useState } from "react";
import { Cloud, User, Wifi, WifiOff } from "lucide-react";
import type { DashboardEntity, HassState } from "@/lib/types";

interface Props {
  connected: boolean;
  loaded: boolean;
  persons: DashboardEntity[];
  weather: DashboardEntity | null;
  states: Record<string, HassState>;
  search: string;
  onSearch: (v: string) => void;
}

export function HeaderBar({ connected, loaded, persons, weather, states, search, onSearch }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock tick, avoids SSR/client mismatch
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const weatherState = weather ? states[weather.entity_id] : undefined;

  return (
    <header className="header-bar">
      <div className="header-top">
        <div className="header-title">
          <span className="header-brand">Smarthome</span>
          <span className="header-clock">
            {now?.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) ?? ""}
          </span>
        </div>
        <div className="header-status">
          {weatherState && (
            <span className="header-chip">
              <Cloud size={16} />
              {weatherState.attributes.temperature as number}°C
            </span>
          )}
          {persons.map((p) => {
            const s = states[p.entity_id];
            const home = s?.state === "home";
            return (
              <span key={p.entity_id} className={`header-chip ${home ? "chip-home" : "chip-away"}`}>
                <User size={16} />
                {p.name}
              </span>
            );
          })}
          <span className={`header-chip ${connected ? "chip-home" : "chip-away"}`}>
            {connected ? <Wifi size={16} /> : <WifiOff size={16} />}
            {loaded ? (connected ? "Đã kết nối" : "Mất kết nối") : "Đang tải..."}
          </span>
        </div>
      </div>
      <input
        className="search-input"
        type="search"
        placeholder="Tìm phòng, thiết bị..."
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
    </header>
  );
}
