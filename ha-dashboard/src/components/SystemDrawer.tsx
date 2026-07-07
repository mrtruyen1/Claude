"use client";

import { useState } from "react";
import { ChevronDown, Play, RefreshCw, Zap } from "lucide-react";
import type { DashboardEntity, HassState } from "@/lib/types";
import type { CallService } from "@/components/tiles/tile-props";

interface Props {
  automations: DashboardEntity[];
  scripts: DashboardEntity[];
  updates: DashboardEntity[];
  states: Record<string, HassState>;
  callService: CallService;
}

export function SystemDrawer({ automations, scripts, updates, states, callService }: Props) {
  const [open, setOpen] = useState(false);
  const pendingUpdates = updates.filter((u) => states[u.entity_id]?.state === "on");

  return (
    <section className="system-drawer">
      <button type="button" className="system-drawer-toggle" onClick={() => setOpen((v) => !v)}>
        <span>
          Hệ thống · {automations.length} automation · {scripts.length} kịch bản
          {pendingUpdates.length > 0 && ` · ${pendingUpdates.length} cập nhật chờ`}
        </span>
        <ChevronDown size={18} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <div className="system-drawer-body">
          {pendingUpdates.length > 0 && (
            <div className="system-group">
              <h3>Cập nhật đang chờ</h3>
              <ul className="system-list">
                {pendingUpdates.map((u) => (
                  <li key={u.entity_id}>
                    <RefreshCw size={14} /> {u.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="system-group">
            <h3>Automation ({automations.length})</h3>
            <ul className="system-list">
              {automations.map((a) => {
                const s = states[a.entity_id];
                const on = s?.state === "on";
                return (
                  <li key={a.entity_id}>
                    <button
                      type="button"
                      className={`system-toggle ${on ? "on" : ""}`}
                      onClick={() =>
                        callService(
                          "automation",
                          on ? "turn_off" : "turn_on",
                          a.entity_id,
                          undefined,
                          { state: on ? "off" : "on" },
                        )
                      }
                    >
                      <Zap size={14} /> {a.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="system-group">
            <h3>Kịch bản ({scripts.length})</h3>
            <ul className="system-list">
              {scripts.map((s) => (
                <li key={s.entity_id}>
                  <button
                    type="button"
                    className="system-toggle"
                    onClick={() => callService("script", "turn_on", s.entity_id)}
                  >
                    <Play size={14} /> {s.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
