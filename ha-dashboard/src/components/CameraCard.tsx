"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import type { DashboardEntity } from "@/lib/types";

export function CameraCard({ entity }: { entity: DashboardEntity }) {
  const [tick, setTick] = useState(0);
  return (
    <button
      type="button"
      className="camera-card"
      onClick={() => setTick((t) => t + 1)}
      title={`${entity.name} — nhấn để làm mới`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic auth-proxied snapshot, cache-busted per click */}
      <img
        src={`/api/camera/${entity.entity_id}?t=${tick}`}
        alt={entity.name}
        loading="lazy"
      />
      <span className="camera-label">
        <Camera size={14} /> {entity.name}
      </span>
    </button>
  );
}
