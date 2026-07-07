"use client";

import { Play } from "lucide-react";
import { TileShell } from "./TileShell";
import type { TileProps } from "./tile-props";

export function ScriptTile({ entityId, name, callService }: TileProps) {
  return (
    <TileShell
      icon={Play}
      name={name}
      domain="script"
      entityId={entityId}
      active={false}
      subtitle="Nhấn để chạy"
      onActivate={() => callService("script", "turn_on", entityId)}
    />
  );
}
