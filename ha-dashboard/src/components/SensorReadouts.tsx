import type { DashboardEntity, HassState } from "@/lib/types";
import { isUnavailable } from "@/lib/domain-meta";

interface Props {
  entities: DashboardEntity[];
  states: Record<string, HassState>;
}

export function SensorReadouts({ entities, states }: Props) {
  const visible = entities.filter((e) => {
    const s = states[e.entity_id];
    return s && !isUnavailable(s.state) && s.attributes.device_class !== "timestamp";
  });
  if (visible.length === 0) return null;

  return (
    <div className="readout-row">
      {visible.map((e) => {
        const s = states[e.entity_id];
        const unit = (s.attributes.unit_of_measurement as string | undefined) ?? "";
        return (
          <span key={e.entity_id} className="readout-chip" title={e.name}>
            {s.state}
            {unit}
          </span>
        );
      })}
    </div>
  );
}
