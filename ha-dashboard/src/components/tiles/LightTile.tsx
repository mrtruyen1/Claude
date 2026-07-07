"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { TileShell } from "./TileShell";
import { isUnavailable } from "@/lib/domain-meta";
import type { TileProps } from "./tile-props";

export function LightTile({ entityId, name, state, callService }: TileProps) {
  const on = state.state === "on";
  const unavailable = isUnavailable(state.state);
  const brightness = state.attributes.brightness as number | undefined;
  const [localPct, setLocalPct] = useState<number | null>(null);
  const pct = localPct ?? (brightness ? Math.round((brightness / 255) * 100) : null);

  return (
    <TileShell
      icon={Lightbulb}
      name={name}
      domain="light"
      active={on}
      unavailable={unavailable}
      subtitle={on ? (pct !== null ? `${pct}%` : "Đang bật") : "Đang tắt"}
      onActivate={() =>
        callService("light", "toggle", entityId, undefined, {
          state: on ? "off" : "on",
        })
      }
    >
      {on && brightness !== undefined && (
        <input
          type="range"
          min={1}
          max={100}
          value={pct ?? 0}
          className="tile-slider"
          onChange={(e) => setLocalPct(Number(e.target.value))}
          onPointerUp={(e) => {
            const value = Number((e.target as HTMLInputElement).value);
            callService("light", "turn_on", entityId, { brightness_pct: value });
            setLocalPct(null);
          }}
        />
      )}
    </TileShell>
  );
}
