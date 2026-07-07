export interface HassState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HaArea {
  area_id: string;
  name: string;
  icon: string | null;
  floor_id: string | null;
}

export interface DashboardEntity {
  entity_id: string;
  domain: string;
  area_id: string | null;
  name: string;
}

export interface DashboardSnapshot {
  connected: boolean;
  areas: HaArea[];
  entities: DashboardEntity[];
  states: Record<string, HassState>;
}

export type StateEventPayload =
  | { type: "state_changed"; entity_id: string; state: HassState }
  | { type: "connection"; connected: boolean };
