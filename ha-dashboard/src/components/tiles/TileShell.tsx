"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface TileShellProps {
  icon: LucideIcon;
  name: string;
  active: boolean;
  unavailable?: boolean;
  subtitle?: string;
  onActivate?: () => void;
  children?: ReactNode;
}

export function TileShell({
  icon: Icon,
  name,
  active,
  unavailable,
  subtitle,
  onActivate,
  children,
}: TileShellProps) {
  return (
    <div
      className={`tile ${active ? "tile-on" : ""} ${unavailable ? "tile-unavailable" : ""}`}
    >
      <button
        type="button"
        className="tile-tap"
        onClick={onActivate}
        disabled={unavailable || !onActivate}
        aria-label={name}
      >
        <span className="tile-icon">
          <Icon size={20} strokeWidth={2} />
        </span>
        <span className="tile-text">
          <span className="tile-name">{name}</span>
          <span className="tile-subtitle">{subtitle}</span>
        </span>
      </button>
      {children}
    </div>
  );
}
