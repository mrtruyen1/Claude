import type { DashboardEntity, HassState } from "@/lib/types";
import { isOn, isUnavailable } from "@/lib/domain-meta";

interface Props {
  entities: DashboardEntity[];
  states: Record<string, HassState>;
}

export function BinaryIndicators({ entities, states }: Props) {
  const active = entities.filter((e) => {
    const s = states[e.entity_id];
    return s && !isUnavailable(s.state) && isOn(s.state);
  });
  if (active.length === 0) return null;

  return (
    <div className="indicator-row">
      {active.map((e) => (
        <span key={e.entity_id} className="indicator-dot" title={e.name}>
          {e.name}
        </span>
      ))}
    </div>
  );
}
