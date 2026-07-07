"use client";

import { Play, Pause, SkipForward, Speaker } from "lucide-react";
import { isUnavailable } from "@/lib/domain-meta";
import type { TileProps } from "./tile-props";

export function MediaPlayerTile({ entityId, name, state, callService }: TileProps) {
  const unavailable = isUnavailable(state.state);
  const playing = state.state === "playing";
  const title = state.attributes.media_title as string | undefined;

  return (
    <div
      className={`tile tile-media ${playing ? "tile-on" : ""} ${unavailable ? "tile-unavailable" : ""}`}
      data-domain="media_player"
    >
      <div className="tile-tap" style={{ cursor: "default" }}>
        <span className="tile-icon">
          <Speaker size={20} strokeWidth={2} />
        </span>
        <span className="tile-text">
          <span className="tile-name">{name}</span>
          <span className="tile-subtitle">{title ?? (playing ? "Đang phát" : state.state)}</span>
        </span>
      </div>
      {!unavailable && (
        <div className="tile-cover-controls">
          <button
            type="button"
            onClick={() => callService("media_player", "media_play_pause", entityId)}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            onClick={() => callService("media_player", "media_next_track", entityId)}
          >
            <SkipForward size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
