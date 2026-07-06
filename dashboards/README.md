# Dashboards

## Overview (`lovelace`)

- `lovelace-overview-current.json` — snapshot config hiện tại (sau khi thêm hiệu ứng `fx-overview-2026`, 2026-07-06).
- `backups/lovelace-overview-2026-07-06-pre-effects.json` — bản backup **trước** khi thêm hiệu ứng.
- Backup trên máy HA: `/homeassistant/.storage/lovelace.lovelace.bak-20260706-pre-effects`.

### Hiệu ứng đã thêm (marker `fx-overview-2026`)

CSS card-mod ghép vào cuối style của từng card hiển thị (không đổi cấu trúc view/card):

- **Fade-in**: card trượt nhẹ lên + hiện dần (0.45s) khi mở tab/chuyển view.
- **Hover**: card nâng lên 3px, viền + glow cyan (`rgba(8,145,178,…)` / `rgba(34,211,238,…)`) khớp theme sẵn có.
- **Kính mờ**: `backdrop-filter: blur(10px)` tăng hiệu ứng glassmorphism trên nền `rgba(20,13,45,0.45)`.

### Khôi phục nếu không ưng

Cách 1 — trên máy HA (nhanh nhất):

```sh
cp /homeassistant/.storage/lovelace.lovelace.bak-20260706-pre-effects /homeassistant/.storage/lovelace.lovelace
# rồi restart HA hoặc reload frontend
```

Cách 2 — qua MCP: dùng `ha_config_set_dashboard` với `config` = nội dung file
`backups/lovelace-overview-2026-07-06-pre-effects.json`.

Cách 3 — chỉ gỡ hiệu ứng, giữ chỉnh sửa mới: xoá mọi đoạn CSS bắt đầu từ
comment `/* fx-overview-2026 */` trong các `card_mod.style`.
