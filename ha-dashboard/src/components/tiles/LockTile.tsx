"use client";

import { Lock, LockOpen } from "lucide-react";
import { TileShell } from "./TileShell";
import { isUnavailable } from "@/lib/domain-meta";
import type { TileProps } from "./tile-props";

export function LockTile({ entityId, name, state, callService }: TileProps) {
  const locked = state.state === "locked";
  const unavailable = isUnavailable(state.state);

  return (
    <TileShell
      icon={locked ? Lock : LockOpen}
      name={name}
      domain="lock"
      active={!locked}
      unavailable={unavailable}
      subtitle={locked ? "Đã khóa" : "Đang mở"}
      onActivate={() =>
        callService(
          "lock",
          locked ? "unlock" : "lock",
          entityId,
          undefined,
          { state: locked ? "unlocked" : "locked" },
        )
      }
    />
  );
}
