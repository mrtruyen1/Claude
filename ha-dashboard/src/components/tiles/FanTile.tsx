"use client";

import { Fan } from "lucide-react";
import { TileShell } from "./TileShell";
import { isUnavailable } from "@/lib/domain-meta";
import type { TileProps } from "./tile-props";

export function FanTile({ entityId, name, state, callService }: TileProps) {
  const on = state.state === "on";
  const unavailable = isUnavailable(state.state);
  const pct = state.attributes.percentage as number | undefined;

  return (
    <TileShell
      icon={Fan}
      name={name}
      domain="fan"
      active={on}
      unavailable={unavailable}
      subtitle={on ? (pct !== undefined ? `${pct}%` : "Đang chạy") : "Đang tắt"}
      onActivate={() =>
        callService("fan", "toggle", entityId, undefined, { state: on ? "off" : "on" })
      }
    />
  );
}
