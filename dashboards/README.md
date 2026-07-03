# Dashboards

Bản sao (backup) cấu hình Lovelace của HA để phục hồi khi cần.

## flux-mobile.json — "Flux UI" (mobile-first)

Dashboard mới, tối ưu cho điện thoại, **giữ nguyên cấu trúc như Overview** (`lovelace`):
5 view **Nhà / P.N / T1 / T2 / T3** dùng đúng entity của nhà, phong cách Flux
(tile bo tròn, hero header chào theo giờ, navbar 5 nút chuyển tầng, nút script bo tròn).

- **url_path:** `flux-mobile` · **sidebar:** `mdi:cellphone` · **mode:** storage
- **Overview cũ (`lovelace`) giữ nguyên, KHÔNG đụng tới.**

### Card HACS phụ thuộc
`button-card`, `auto-entities`, `scheduler-card`, `webrtc-camera` (đã có sẵn) +
**`card-mod`** và **`kiosk-mode`** (cài thêm trong phiên này).

### Khôi phục
Dùng MCP `ha_config_set_dashboard(url_path="flux-mobile", config=<nội dung file>)`
hoặc dán vào Raw configuration editor của dashboard trong HA UI.

> Lưu ý: `button_card_templates` và `kiosk_mode` là key gốc (root) của config,
> phải giữ khi khôi phục — không chỉ phần `views`.
