"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { chromeIconUrls } from "@/lib/icon-map";

interface TileShellProps {
  icon: LucideIcon;
  name: string;
  active: boolean;
  unavailable?: boolean;
  subtitle?: string;
  domain?: string;
  entityId?: string;
  onActivate?: () => void;
  children?: ReactNode;
}

export function TileShell({
  icon: Icon,
  name,
  active,
  unavailable,
  subtitle,
  domain,
  entityId,
  onActivate,
  children,
}: TileShellProps) {
  const chrome = domain && entityId ? chromeIconUrls(entityId, domain) : null;

  return (
    <div
      className={`tile ${active ? "tile-on" : ""} ${unavailable ? "tile-unavailable" : ""}`}
      data-domain={domain}
    >
      <button
        type="button"
        className="tile-tap"
        onClick={onActivate}
        disabled={unavailable || !onActivate}
        aria-label={name}
      >
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
            <Icon size={20} strokeWidth={2} />
          )}
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
