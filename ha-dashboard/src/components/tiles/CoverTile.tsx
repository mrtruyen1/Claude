"use client";

import { Blinds, ChevronUp, Square, ChevronDown } from "lucide-react";
import { isUnavailable } from "@/lib/domain-meta";
import type { TileProps } from "./tile-props";

export function CoverTile({ entityId, name, state, callService }: TileProps) {
  const unavailable = isUnavailable(state.state);
  const open = state.state === "open";
  const position = state.attributes.current_position as number | undefined;

  return (
    <div className={`tile tile-cover ${open ? "tile-on" : ""} ${unavailable ? "tile-unavailable" : ""}`}>
      <div className="tile-tap" style={{ cursor: "default" }}>
        <span className="tile-icon">
          <Blinds size={20} strokeWidth={2} />
        </span>
        <span className="tile-text">
          <span className="tile-name">{name}</span>
          <span className="tile-subtitle">
            {position !== undefined ? `${position}%` : open ? "Đang mở" : "Đang đóng"}
          </span>
        </span>
      </div>
      {!unavailable && (
        <div className="tile-cover-controls">
          <button type="button" onClick={() => callService("cover", "open_cover", entityId)}>
            <ChevronUp size={16} />
          </button>
          <button type="button" onClick={() => callService("cover", "stop_cover", entityId)}>
            <Square size={14} />
          </button>
          <button type="button" onClick={() => callService("cover", "close_cover", entityId)}>
            <ChevronDown size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
