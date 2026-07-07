"use client";

import { Gauge, Minus, Plus } from "lucide-react";
import { isUnavailable } from "@/lib/domain-meta";
import type { TileProps } from "./tile-props";

interface NumberTileProps extends TileProps {
  domain: "input_number" | "number";
}

export function NumberTile({ entityId, name, state, callService, domain }: NumberTileProps) {
  const unavailable = isUnavailable(state.state);
  const value = Number(state.state);
  const step = (state.attributes.step as number | undefined) ?? 1;
  const unit = (state.attributes.unit_of_measurement as string | undefined) ?? "";
  const service = domain === "number" ? "set_value" : "set_value";

  const setValue = (next: number) => {
    callService(domain, service, entityId, { value: next }, { state: String(next) });
  };

  return (
    <div
      className={`tile tile-climate ${unavailable ? "tile-unavailable" : ""}`}
      data-domain={domain}
    >
      <div className="tile-tap" style={{ cursor: "default" }}>
        <span className="tile-icon">
          <Gauge size={20} strokeWidth={2} />
        </span>
        <span className="tile-text">
          <span className="tile-name">{name}</span>
          <span className="tile-subtitle">
            {value}
            {unit}
          </span>
        </span>
      </div>
      {!unavailable && (
        <div className="tile-climate-controls">
          <button type="button" onClick={() => setValue(Math.round((value - step) * 100) / 100)}>
            <Minus size={16} />
          </button>
          <span className="tile-climate-target">
            {value}
            {unit}
          </span>
          <button type="button" onClick={() => setValue(Math.round((value + step) * 100) / 100)}>
            <Plus size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
