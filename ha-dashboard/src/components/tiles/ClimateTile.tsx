"use client";

import { Thermometer, Minus, Plus } from "lucide-react";
import { isUnavailable } from "@/lib/domain-meta";
import { chromeIconUrls } from "@/lib/icon-map";
import type { TileProps } from "./tile-props";

const MODE_LABEL_VI: Record<string, string> = {
  off: "Tắt",
  heat: "Sưởi",
  cool: "Làm lạnh",
  auto: "Tự động",
  dry: "Hút ẩm",
  fan_only: "Quạt",
};

export function ClimateTile({ entityId, name, state, callService }: TileProps) {
  const unavailable = isUnavailable(state.state);
  const current = state.attributes.current_temperature as number | undefined;
  const target = state.attributes.temperature as number | undefined;
  const step = (state.attributes.target_temp_step as number | undefined) ?? 0.5;
  const active = state.state !== "off";
  const chrome = chromeIconUrls(entityId, "climate");

  const setTemp = (next: number) => {
    callService(
      "climate",
      "set_temperature",
      entityId,
      { temperature: next },
      { attributes: { ...state.attributes, temperature: next } },
    );
  };

  return (
    <div
      className={`tile tile-climate ${active ? "tile-on" : ""} ${unavailable ? "tile-unavailable" : ""}`}
      data-domain="climate"
    >
      <div className="tile-tap" style={{ cursor: "default" }}>
        <span className="tile-icon">
          {chrome ? (
            // eslint-disable-next-line @next/next/no-img-element -- served straight from HA's unauthenticated /local/ static host
            <img
              className="tile-icon-chrome"
              src={active ? chrome.on : chrome.off}
              alt=""
              loading="lazy"
            />
          ) : (
            <Thermometer size={20} strokeWidth={2} />
          )}
        </span>
        <span className="tile-text">
          <span className="tile-name">{name}</span>
          <span className="tile-subtitle">
            {current !== undefined ? `${current}°C` : ""} · {MODE_LABEL_VI[state.state] ?? state.state}
          </span>
        </span>
      </div>
      {target !== undefined && !unavailable && (
        <div className="tile-climate-controls">
          <button type="button" onClick={() => setTemp(Math.round((target - step) * 10) / 10)}>
            <Minus size={16} />
          </button>
          <span className="tile-climate-target">{target}°C</span>
          <button type="button" onClick={() => setTemp(Math.round((target + step) * 10) / 10)}>
            <Plus size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
