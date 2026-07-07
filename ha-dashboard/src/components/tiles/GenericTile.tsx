"use client";

import { domainIcon, isUnavailable } from "@/lib/domain-meta";
import { TileShell } from "./TileShell";
import type { TileProps } from "./tile-props";

interface GenericTileProps extends TileProps {
  domain: string;
}

export function GenericTile({ entityId, name, state, callService, domain }: GenericTileProps) {
  const unavailable = isUnavailable(state.state);
  const on = state.state === "on";

  return (
    <TileShell
      icon={domainIcon(domain)}
      name={name}
      active={on}
      unavailable={unavailable}
      subtitle={state.state}
      onActivate={() =>
        callService("homeassistant", "toggle", entityId, undefined, {
          state: on ? "off" : "on",
        })
      }
    />
  );
}
