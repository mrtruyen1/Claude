"use client";

import type { ViewDef } from "@/lib/views";

interface Props {
  views: ViewDef[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ views, active, onChange }: Props) {
  return (
    <nav className="tab-bar">
      {views.map((v) => (
        <button
          key={v.id}
          type="button"
          className={`tab-btn ${active === v.id ? "tab-btn-active" : ""}`}
          onClick={() => onChange(v.id)}
        >
          {v.label}
        </button>
      ))}
    </nav>
  );
}
