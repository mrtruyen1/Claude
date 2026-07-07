"use client";

import { CircleDot } from "lucide-react";
import { TileShell } from "./TileShell";
import { isUnavailable } from "@/lib/domain-meta";
import type { TileProps } from "./tile-props";

export function ButtonTile({ entityId, name, state, callService }: TileProps) {
  const unavailable = isUnavailable(state.state);

  return (
    <TileShell
      icon={CircleDot}
      name={name}
      domain="button"
      active={false}
      unavailable={unavailable}
      subtitle="Nhấn để chạy"
      onActivate={() => callService("button", "press", entityId)}
    />
  );
}
