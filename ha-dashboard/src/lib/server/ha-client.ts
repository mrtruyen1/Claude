import "server-only";
import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { DashboardEntity, HaArea, HassState } from "@/lib/types";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

interface EntityRegistryEntry {
  entity_id: string;
  area_id: string | null;
  device_id: string | null;
  hidden_by: string | null;
  disabled_by: string | null;
}

interface DeviceRegistryEntry {
  id: string;
  area_id: string | null;
}

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
const REQUEST_TIMEOUT_MS = 15_000;

class HaClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private reconnectDelay = RECONNECT_MIN_MS;
  private connected = false;
  private ready: Promise<void> | null = null;
  private resolveReady: (() => void) | null = null;

  states = new Map<string, HassState>();
  areas = new Map<string, HaArea>();
  entityArea = new Map<string, string | null>();

  constructor() {
    super();
    this.setMaxListeners(200);
    this.connect();
  }

  private get wsUrl(): string {
    const base = process.env.HA_URL ?? "http://localhost:8123";
    return base.replace(/^http/, "ws").replace(/\/$/, "") + "/api/websocket";
  }

  private connect() {
    if (!this.ready) {
      this.ready = new Promise((resolve) => {
        this.resolveReady = resolve;
      });
    }

    const socket = new WebSocket(this.wsUrl);
    this.ws = socket;

    socket.on("message", (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      this.handleMessage(msg, socket);
    });

    socket.on("close", () => this.handleDisconnect());
    socket.on("error", () => {
      // "close" fires right after in ws; avoid double-handling.
    });
  }

  private handleDisconnect() {
    if (this.connected) {
      this.connected = false;
      this.emit("connection", false);
    }
    for (const { reject } of this.pending.values()) {
      reject(new Error("HA connection lost"));
    }
    this.pending.clear();
    this.ready = null;
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  private async handleMessage(msg: Record<string, unknown>, socket: WebSocket) {
    switch (msg.type) {
      case "auth_required": {
        socket.send(
          JSON.stringify({ type: "auth", access_token: process.env.HA_TOKEN }),
        );
        return;
      }
      case "auth_invalid": {
        console.error("[ha-client] auth_invalid:", msg.message);
        socket.close();
        return;
      }
      case "auth_ok": {
        this.reconnectDelay = RECONNECT_MIN_MS;
        await this.bootstrap();
        this.connected = true;
        this.emit("connection", true);
        this.resolveReady?.();
        return;
      }
      case "event": {
        this.handleEvent(msg);
        return;
      }
      case "result": {
        const id = msg.id as number;
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        if (msg.success) {
          pending.resolve(msg.result);
        } else {
          pending.reject(msg.error ?? new Error("HA request failed"));
        }
        return;
      }
      default:
        return;
    }
  }

  private handleEvent(msg: Record<string, unknown>) {
    const event = msg.event as Record<string, unknown> | undefined;
    if (!event || event.event_type !== "state_changed") return;
    const data = event.data as { entity_id: string; new_state: HassState | null };
    if (!data.new_state) {
      this.states.delete(data.entity_id);
      return;
    }
    this.states.set(data.entity_id, data.new_state);
    this.emit("state_changed", data.new_state);
  }

  private send<T>(payload: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("HA socket not open"));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`HA request ${payload.type} timed out`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ ...payload, id }));
    });
  }

  private async bootstrap() {
    const [states, areaList, deviceList, entityList] = await Promise.all([
      this.send<HassState[]>({ type: "get_states" }),
      this.send<HaArea[]>({ type: "config/area_registry/list" }),
      this.send<DeviceRegistryEntry[]>({ type: "config/device_registry/list" }),
      this.send<EntityRegistryEntry[]>({ type: "config/entity_registry/list" }),
    ]);

    this.states.clear();
    for (const s of states) this.states.set(s.entity_id, s);

    this.areas.clear();
    for (const a of areaList) this.areas.set(a.area_id, a);

    const deviceArea = new Map<string, string | null>();
    for (const d of deviceList) deviceArea.set(d.id, d.area_id);

    this.entityArea.clear();
    for (const e of entityList) {
      const area = e.area_id ?? (e.device_id ? deviceArea.get(e.device_id) ?? null : null);
      this.entityArea.set(e.entity_id, area);
    }

    if (this.ws) {
      await this.send({ type: "subscribe_events", event_type: "state_changed" });
    }
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  isConnected(): boolean {
    return this.connected;
  }

  listEntities(): DashboardEntity[] {
    return Array.from(this.states.keys()).map((entity_id) => {
      const domain = entity_id.split(".")[0];
      const attrs = this.states.get(entity_id)?.attributes ?? {};
      const name = (attrs.friendly_name as string | undefined) ?? entity_id;
      return {
        entity_id,
        domain,
        area_id: this.entityArea.get(entity_id) ?? null,
        name,
      };
    });
  }

  listAreas(): HaArea[] {
    return Array.from(this.areas.values());
  }

  async callService(
    domain: string,
    service: string,
    entityId?: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.send({
      type: "call_service",
      domain,
      service,
      service_data: data,
      target: entityId ? { entity_id: entityId } : undefined,
    });
  }

  async fetchCameraImage(entityId: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
    const base = (process.env.HA_URL ?? "http://localhost:8123").replace(/\/$/, "");
    const res = await fetch(`${base}/api/camera_proxy/${entityId}`, {
      headers: { Authorization: `Bearer ${process.env.HA_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return {
      body: await res.arrayBuffer(),
      contentType: res.headers.get("content-type") ?? "image/jpeg",
    };
  }
}

declare global {
  var __haClient: HaClient | undefined;
}

export function getHaClient(): HaClient {
  if (!global.__haClient) {
    global.__haClient = new HaClient();
  }
  return global.__haClient;
}
