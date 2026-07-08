# Bộ icon tab v3 — "chrome neon sys3d"

Thiết kế lại 5 icon trên thanh tab của dashboard Overview (theme **SmartHome Neon Dark**),
đồng bộ phong cách chrome 3D + neon cyan với bộ tile `tiles_chrome_v2_webp` đang dùng trên Overview.

| Tab | View | File (off / on) | Ghi chú |
|---|---|---|---|
| 0 | Nhà | `home_tab3d_off/on.svg` | Nhà mái kính chữ A, ống khói |
| 1 | P.N | `bed_tab3d_off/on.svg` | Giường — chăn phát sáng neon khi active |
| 2 | T1 | `t1_tab3d_off/on.svg` | Nhà 2 tầng rộng kiểu shophouse + badge số 1 |
| 3 | T2 | `t2_tab3d_off/on.svg` | Tòa 3 tầng + hộp kỹ thuật trên mái + badge số 2 |
| 4 | T3 | `t3_tab3d_off/on.svg` | Tháp 4 tầng + ăng-ten + badge số 3 |

Điểm khác bản cũ:

- **SVG thay vì WebP**: nét ở mọi kích thước tab (45–56px), mỗi file chỉ ~4–5 KB.
- **3 tòa nhà T1/T2/T3 phân biệt bằng kiến trúc** (thấp–vừa–cao) chứ không dùng chung 1 icon.
- **Badge số 1/2/3 nướng sẵn trong icon** (số vẽ bằng path, không phụ thuộc font thiết bị) —
  đã bỏ CSS `::after` vẽ badge trong theme để không bị số đôi.
- Trạng thái **off** = kim loại gunmetal + kính tối; **on** = kính cyan phát sáng, viền neon
  nhiều lớp (không dùng SVG filter nên hiển thị giống nhau trên mọi trình duyệt).

## Triển khai

- File SVG: `/config/www/tiles_tabs_v3/` trên HA (truy cập qua `/local/tiles_tabs_v3/...`).
- Theme: `themes/smarthome_neon_dark.yaml` — khối `"ha-tab-group-tab$"` trỏ `background-image`
  từng panel tới bộ icon này (cache-buster `?v=tabv3_1`).
- Backup theme trước khi đổi: `smarthome_neon_dark.yaml.bak-tabicons-v3-20260708_222649`.

## Tái tạo / chỉnh sửa

`gen_icons.py` sinh toàn bộ 10 SVG (và PNG preview qua cairosvg):

```bash
pip install cairosvg pillow
python3 gen_icons.py
```

Preview: `tabicons_v3_sheet.png` (2 hàng off/on), `tabicons_v3_tabbar.png` (mock thanh tab kích thước thật).
