// Maps entities to the same glossy "chrome" WEBP icon set already used on the
// real HA dashboard (HA config www/tiles_chrome_v2_webp/, served unauthenticated
// at /local/... on the HA instance). Extracted directly from that dashboard's
// card_mod overrides so devices show the exact icon the household already
// associates with them, with matching _on/_off variants.
export const ICON_BASE_BY_ENTITY: Record<string, string> = {
  "media_player.kdl_43w800c": "tv_sys3d",
  "script.cuacuon_dong": "door_close_sys3d",
  "script.cuacuon_mo": "door_open_sys3d",
  "script.cuacuon_stop": "stop_sys3d",
  "script.dongtam": "door_temp_sys3d",
  "script.mocua1p2": "door_half_sys3d",
  "script.mothoang": "vent_sys3d",
  "switch.binh_nong_lanh": "heater_sys3d",
  "switch.cau_thang_2": "stairs_sys3d",
  "switch.cau_thang_3": "stairs_sys3d",
  "switch.cau_thang_4_center": "tube_sys3d",
  "switch.den_ban_hang": "bulb_sys3d",
  "switch.den_cong_tac": "outlet_sys3d",
  "switch.den_ngu": "night_lamp_sys3d",
  "switch.den_nha_ve_sinh": "bath_light_sys3d",
  "switch.den_nha_ve_sinh_2": "bath_light_sys3d",
  "switch.den_phong_ngu": "tube_sys3d",
  "switch.den_tang_1_2": "multi_ceiling_sys3d",
  "switch.den_trong_tang_1_switch_1": "multi_ceiling_sys3d",
  "switch.kitchen_0": "bulb_sys3d",
  "switch.kitchen_1": "tube_sys3d",
  "switch.kitchen_2": "ceiling_sys3d",
  "switch.living2_room_lamp_1": "sign_sys3d",
  "switch.living2_room_lamp_2": "fan_sys3d",
  "switch.living_room_lamp_1": "bulb_sys3d",
  "switch.living_room_lamp_2": "ceiling_sys3d",
  "switch.nha_ve_sinh_tang_1_switch_1": "bath_light_sys3d",
  "switch.o_cam_tuya": "outlet_sys3d",
  "switch.o_cam_xiaomi": "outlet_sys3d",
  "switch.sonoff_1000e2aa15": "server_sys3d",
  "switch.tang3_recovery_solax3switch01_den_1": "tube_sys3d",
  "switch.tang3_recovery_solax3switch01_den_2": "altar_sys3d",
  "switch.tang3_recovery_solax3switch01_den_3": "tube_sys3d",
};

// Fallback per domain for entities not individually mapped above.
export const ICON_BASE_BY_DOMAIN: Record<string, string> = {
  light: "bulb_sys3d",
  switch: "outlet_sys3d",
  climate: "ac_sys3d",
  fan: "fan_sys3d",
  media_player: "tv_sys3d",
  button: "server_sys3d",
  cover: "door_open_sys3d",
};

const HA_PUBLIC_BASE = process.env.NEXT_PUBLIC_HA_URL ?? "http://192.168.31.111:8123";

export function chromeIconUrls(entityId: string, domain: string): { on: string; off: string } | null {
  const base = ICON_BASE_BY_ENTITY[entityId] ?? ICON_BASE_BY_DOMAIN[domain];
  if (!base) return null;
  return {
    on: `${HA_PUBLIC_BASE}/local/tiles_chrome_v2_webp/${base}_on.webp`,
    off: `${HA_PUBLIC_BASE}/local/tiles_chrome_v2_webp/${base}_off.webp`,
  };
}
