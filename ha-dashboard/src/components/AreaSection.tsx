import type { DashboardEntity, HassState } from "@/lib/types";
import { PRIMARY_DOMAINS } from "@/lib/domain-meta";
import { renderTile } from "@/components/tiles";
import { SensorReadouts } from "@/components/SensorReadouts";
import { BinaryIndicators } from "@/components/BinaryIndicators";
import { CameraCard } from "@/components/CameraCard";
import type { CallService } from "@/components/tiles/tile-props";

interface Props {
  title: string;
  entities: DashboardEntity[];
  states: Record<string, HassState>;
  callService: CallService;
}

const PRIMARY = new Set<string>(PRIMARY_DOMAINS);

export function AreaSection({ title, entities, states, callService }: Props) {
  const primary = entities.filter((e) => PRIMARY.has(e.domain) && states[e.entity_id]);
  const sensors = entities.filter((e) => e.domain === "sensor");
  const binarySensors = entities.filter((e) => e.domain === "binary_sensor");
  const cameras = entities.filter((e) => e.domain === "camera" && states[e.entity_id]);

  if (primary.length === 0 && sensors.length === 0 && binarySensors.length === 0 && cameras.length === 0) {
    return null;
  }

  return (
    <section className="area-section">
      <h2 className="area-title">{title}</h2>
      <BinaryIndicators entities={binarySensors} states={states} />
      {primary.length > 0 && (
        <div className="tile-grid">
          {primary.map((e) =>
            renderTile(e.domain, {
              entityId: e.entity_id,
              name: e.name,
              state: states[e.entity_id],
              callService,
            }),
          )}
        </div>
      )}
      {cameras.length > 0 && (
        <div className="camera-grid">
          {cameras.map((e) => (
            <CameraCard key={e.entity_id} entity={e} />
          ))}
        </div>
      )}
      <SensorReadouts entities={sensors} states={states} />
    </section>
  );
}
