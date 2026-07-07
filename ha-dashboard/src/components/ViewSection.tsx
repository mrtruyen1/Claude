import { Play } from "lucide-react";
import type { DashboardEntity, HassState } from "@/lib/types";
import { PRIMARY_DOMAINS } from "@/lib/domain-meta";
import { renderTile } from "@/components/tiles";
import { ScriptTile } from "@/components/tiles/ScriptTile";
import { chromeIconUrls } from "@/lib/icon-map";
import { SensorReadouts } from "@/components/SensorReadouts";
import type { CallService } from "@/components/tiles/tile-props";

interface Props {
  entities: DashboardEntity[];
  states: Record<string, HassState>;
  callService: CallService;
}

const PRIMARY = new Set<string>([...PRIMARY_DOMAINS, "button", "input_number", "number", "remote"]);

export function ViewSection({ entities, states, callService }: Props) {
  const available = entities.filter((e) => states[e.entity_id]);
  const primary = available.filter((e) => PRIMARY.has(e.domain));
  const allScripts = available.filter((e) => e.domain === "script");
  // Scripts with a matching chrome icon (door controls etc.) get a full tile
  // like the real dashboard; plain IR remote buttons stay as compact pills.
  const iconScripts = allScripts.filter((e) => chromeIconUrls(e.entity_id, "script"));
  const plainScripts = allScripts.filter((e) => !chromeIconUrls(e.entity_id, "script"));
  const sensors = available.filter((e) => e.domain === "sensor");

  if (available.length === 0) {
    return <p className="empty-state">Chưa có thiết bị nào trong tab này.</p>;
  }

  return (
    <div className="view-section">
      {(primary.length > 0 || iconScripts.length > 0) && (
        <div className="tile-grid">
          {primary.map((e) =>
            renderTile(e.domain, {
              entityId: e.entity_id,
              name: e.name,
              state: states[e.entity_id],
              callService,
            }),
          )}
          {iconScripts.map((e) => (
            <ScriptTile
              key={e.entity_id}
              entityId={e.entity_id}
              name={e.name}
              state={states[e.entity_id]}
              callService={callService}
            />
          ))}
        </div>
      )}
      {plainScripts.length > 0 && (
        <section>
          <h3 className="section-label">Điều khiển nhanh</h3>
          <div className="remote-grid">
            {plainScripts.map((s) => (
              <button
                key={s.entity_id}
                type="button"
                className="remote-btn"
                onClick={() => callService("script", "turn_on", s.entity_id)}
              >
                <span className="remote-btn-icon">
                  <Play size={16} />
                </span>
                {s.name}
              </button>
            ))}
          </div>
        </section>
      )}
      {sensors.length > 0 && (
        <section>
          <h3 className="section-label">Cảm biến</h3>
          <SensorReadouts entities={sensors} states={states} />
        </section>
      )}
    </div>
  );
}
