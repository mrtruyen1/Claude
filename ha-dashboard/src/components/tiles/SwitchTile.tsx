"use client";

import { Power, ToggleLeft } from "lucide-react";
import { TileShell } from "./TileShell";
import { isUnavailable } from "@/lib/domain-meta";
import type { TileProps } from "./tile-props";

interface SwitchTileProps extends TileProps {
  domain: "switch" | "input_boolean" | "humidifier";
}

export function SwitchTile({ entityId, name, state, callService, domain }: SwitchTileProps) {
  const on = state.state === "on";
  const unavailable = isUnavailable(state.state);

  return (
    <TileShell
      icon={domain === "input_boolean" ? ToggleLeft : Power}
      name={name}
      domain={domain}
      entityId={entityId}
      active={on}
      unavailable={unavailable}
      subtitle={on ? "Đang bật" : "Đang tắt"}
      onActivate={() =>
        callService(domain, "toggle", entityId, undefined, { state: on ? "off" : "on" })
      }
    />
  );
}
