# ha-dashboard

Bảng điều khiển Home Assistant tùy chỉnh, xây bằng Next.js (App Router), chạy
độc lập trên LXC CT 114 (`nextjs-dashboard`, `192.168.31.115`) trên Proxmox —
tách biệt hoàn toàn khỏi VM 101 (Home Assistant OS).

Thiết kế lại tab **Overview** mặc định của HA: nhóm theo khu vực (area),
dùng tile gọn cho các domain điều khiển được (đèn, công tắc, điều hòa, rèm,
quạt, khóa, media player), gộp cảm biến/nhị phân thành các chip/nhãn thay vì
chiếm cả ô, ẩn automation/script/update vào một khay hệ thống có thể mở ra —
tránh cảnh 500+ entity dồn hết lên một màn hình.

## Kiến trúc

- **Server**: một tiến trình Next.js duy nhất giữ 1 kết nối WebSocket bền tới
  HA (`src/lib/server/ha-client.ts`), tự đăng ký `subscribe_events`
  `state_changed`, và tự reconnect với backoff khi mất kết nối.
- **API routes** (`src/app/api/*`) chỉ là lớp proxy mỏng — token HA
  (`HA_TOKEN`) không bao giờ rời server:
  - `GET /api/states` — snapshot toàn bộ state + area registry lúc tải trang.
  - `GET /api/stream` — Server-Sent Events, đẩy từng `state_changed` xuống
    trình duyệt theo thời gian thực (không polling).
  - `POST /api/call-service` — gọi service HA (bật/tắt đèn, đặt nhiệt độ...).
  - `GET /api/camera/[entity_id]` — proxy ảnh snapshot camera kèm header
    `Authorization`.
- **Client** (`src/lib/useHaStore.ts`) load snapshot ban đầu rồi mở
  `EventSource` để nhận cập nhật, có optimistic update khi bấm nút.

## Chạy dev

```bash
cd ha-dashboard
cp .env.example .env
# điền HA_URL + HA_TOKEN (tạo tại HA: Profile -> Security -> Long-lived access tokens)
npm install
npm run dev
```

## Build & deploy production (CT 114)

```bash
npm ci
npm run build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
```

Chạy bằng `node .next/standalone/server.js` (xem `deploy/ha-dashboard.service`
để chạy qua systemd, cổng mặc định lấy từ biến `PORT`, mặc định 3000).
