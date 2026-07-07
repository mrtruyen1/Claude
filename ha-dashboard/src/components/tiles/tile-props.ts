import type { HassState } from "@/lib/types";

export type CallService = (
  domain: string,
  service: string,
  entityId?: string,
  data?: Record<string, unknown>,
  optimisticState?: Partial<HassState>,
) => Promise<void>;

export interface TileProps {
  entityId: string;
  name: string;
  state: HassState;
  callService: CallService;
}
