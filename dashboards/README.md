# Dashboards

## Overview (`lovelace`)

- `lovelace-overview-current.json` — snapshot config hiện tại (sau khi thêm hiệu ứng `fx-overview-2026`, 2026-07-06).
- `backups/lovelace-overview-2026-07-06-pre-effects.json` — bản backup **trước** khi thêm hiệu ứng.
- Backup trên máy HA: `/homeassistant/.storage/lovelace.lovelace.bak-20260706-pre-effects`.

### Hiệu ứng đã thêm (marker `fx-overview-2026-v2`)

CSS card-mod ghép vào cuối style của từng card hiển thị (không đổi cấu trúc view/card):

- **Fade-in**: card trượt nhẹ lên + hiện dần (0.4s) khi mở tab/chuyển view.
- **Chạm (mobile)**: card co nhẹ `scale(0.97)` khi bấm — phản hồi xúc giác.
- **Hover (desktop)**: card nâng 2px + glow cyan `rgba(8,145,178,0.30)`.

Lịch sử: bản v1 có thêm `backdrop-filter: blur(10px)` trên 114 card — quá nặng
GPU trên điện thoại, làm card-mod áp style sâu (cú pháp `$`) bị timeout → mất màu
icon cyan. Đã rollback (hash khớp bản gốc `0937ccadf1bac6b2`) rồi áp v2 không blur.

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
