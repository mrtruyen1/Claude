import {
  Lightbulb,
  Power,
  Thermometer,
  Blinds,
  Fan,
  Lock,
  Speaker,
  Camera,
  Cloud,
  Activity,
  CircleDot,
  ToggleLeft,
  Gauge,
  type LucideIcon,
} from "lucide-react";

export const PRIMARY_DOMAINS = [
  "light",
  "switch",
  "climate",
  "cover",
  "fan",
  "lock",
  "media_player",
  "input_boolean",
  "humidifier",
  "vacuum",
] as const;

export const READOUT_DOMAINS = ["sensor"] as const;
export const INDICATOR_DOMAINS = ["binary_sensor"] as const;
export const HEADER_DOMAINS = ["person", "weather", "device_tracker"] as const;
export const SYSTEM_DOMAINS = ["automation", "script", "update"] as const;

export const DOMAIN_LABEL_VI: Record<string, string> = {
  light: "Đèn",
  switch: "Công tắc",
  climate: "Điều hòa / Nhiệt độ",
  cover: "Rèm / Cửa cuốn",
  fan: "Quạt",
  lock: "Khóa",
  media_player: "Media",
  input_boolean: "Công tắc ảo",
  humidifier: "Máy tạo ẩm",
  vacuum: "Robot hút bụi",
  sensor: "Cảm biến",
  binary_sensor: "Cảm biến nhị phân",
  camera: "Camera",
  person: "Người",
  weather: "Thời tiết",
  device_tracker: "Định vị",
  automation: "Automation",
  script: "Kịch bản",
  update: "Cập nhật",
};

export const DOMAIN_ICON: Record<string, LucideIcon> = {
  light: Lightbulb,
  switch: Power,
  climate: Thermometer,
  cover: Blinds,
  fan: Fan,
  lock: Lock,
  media_player: Speaker,
  input_boolean: ToggleLeft,
  camera: Camera,
  weather: Cloud,
  sensor: Activity,
  binary_sensor: CircleDot,
};

export function domainIcon(domain: string): LucideIcon {
  return DOMAIN_ICON[domain] ?? Gauge;
}

export function domainLabel(domain: string): string {
  return DOMAIN_LABEL_VI[domain] ?? domain;
}

export function isOn(state: string): boolean {
  return ["on", "open", "unlocked", "home", "playing", "heat", "cool", "auto"].includes(
    state,
  );
}

export function isUnavailable(state: string): boolean {
  return state === "unavailable" || state === "unknown";
}
