# WireGuard VM 112 – Audit Hiệu Năng Toàn Diện

**Ngày audit:** 2026-06-25  
**Container:** LXC 112 (`wireguard`, Debian, unprivileged)  
**Kernel host:** 6.8.12-30-pve | **WireGuard tools:** v1.0.20210223  
**Interface:** `wg0` – `10.6.0.1/24`, listen port `51820`

---

## Tóm tắt nhanh

| Mức độ | Vấn đề | Ảnh hưởng |
|--------|--------|-----------|
| 🔴 CRITICAL | Socket receive buffer quá nhỏ (208 KB) trên host | UDP drop, throughput thấp |
| 🔴 CRITICAL | `netdev_max_backlog` = 1000 trên host | SoftIRQ squeeze, packet drop |
| 🟠 HIGH | Không có `PersistentKeepalive` trên peer | 405 HMAC errors, NAT timeout |
| 🟠 HIGH | Peer thay đổi endpoint liên tục (CGNAT) | Gián đoạn kết nối |
| 🟡 MEDIUM | wg-dashboard chạy Flask dev server | Single-threaded, không production-grade |
| 🟡 MEDIUM | Postfix chạy không cần thiết | Attack surface thừa |
| 🟢 LOW | rsyslog không đọc được kernel log | Cosmetic (LXC limitation) |

---

## 1. 🔴 CRITICAL – Socket Buffer quá nhỏ trên Proxmox Host

### Triệu chứng
```
eth0: RX dropped = 1175 packets
net.core.rmem_max    = 212992  (208 KB – default Linux thấp nhất)
net.core.wmem_max    = 212992
net.core.rmem_default = 212992
net.core.netdev_max_backlog = 1000
```

### Nguyên nhân
Container LXC unprivileged **không thể** thay đổi `net.core.rmem_max` từ bên trong (file `/proc/sys/net/core/rmem_max` không tồn tại trong namespace). Giá trị 208 KB là quá nhỏ cho WireGuard UDP – khi traffic burst, kernel drop packets trước khi WireGuard kịp xử lý.

Softnet squeeze cũng xảy ra nhiều CPU core (CPU11: 10 lần, CPU25: 17 lần), xác nhận netdev backlog bị cạn kiệt.

### Fix – chạy trên **Proxmox host**
```bash
# Áp dụng ngay
sysctl -w net.core.rmem_max=26214400
sysctl -w net.core.wmem_max=26214400
sysctl -w net.core.rmem_default=1048576
sysctl -w net.core.wmem_default=1048576
sysctl -w net.core.netdev_max_backlog=5000
sysctl -w net.ipv4.udp_mem="8388608 12582912 16777216"

# Persist
cat >> /etc/sysctl.d/99-wireguard-perf.conf << 'EOF'
net.core.rmem_max = 26214400
net.core.wmem_max = 26214400
net.core.rmem_default = 1048576
net.core.wmem_default = 1048576
net.core.netdev_max_backlog = 5000
net.ipv4.udp_mem = 8388608 12582912 16777216
EOF
sysctl -p /etc/sysctl.d/99-wireguard-perf.conf
```

---

## 2. 🔴 CRITICAL – netdev_max_backlog = 1000

### Triệu chứng
Từ `/proc/net/softnet_stat`, nhiều CPU core ghi nhận `time_squeeze` (budget SoftIRQ bị cạn):
```
CPU 11: 10 squeeze events
CPU 25: 17 squeeze events
CPU 5, 9, 26: 2–3 squeeze events mỗi core
```

### Nguyên nhân
`netdev_max_backlog = 1000` quá thấp. Khi tốc độ nhận packet từ NIC > tốc độ xử lý SoftIRQ, kernel bắt đầu drop. Đã gộp vào fix ở mục 1.

---

## 3. 🟠 HIGH – Không có PersistentKeepalive → 405 HMAC Errors + NAT Timeout

### Triệu chứng
```
wg0: RX frame errors = 405   (HMAC authentication failures)
wg0: TX dropped      = 25

Peer endpoint lần check 1: 113.185.42.54:38421
Peer endpoint lần check 2: 113.185.42.54:44936   ← port thay đổi trong ~5 phút
```

### Nguyên nhân
Peer ở sau **CGNAT** (mobile/ISP Việt Nam – IP `113.185.42.54`). NAT mapping của CGNAT timeout nhanh (30–120 giây), tạo port mới. Khi port thay đổi:
- Server nhận packet từ endpoint cũ → WireGuard từ chối → frame error +1
- Server gửi packet đến endpoint cũ → không tới client → TX drop +1
- Client phải initiate lại handshake → gián đoạn tối thiểu 1 RTT

Config hiện tại **không có** `PersistentKeepalive`:
```ini
# wg0.conf hiện tại – THIẾU keepalive
[Peer]
PublicKey = xPsjhj+9...
PresharedKey = ...
AllowedIPs = 10.6.0.2/32
# ← Không có PersistentKeepalive
```

### Fix – trong container CT 112
```bash
# Thêm PersistentKeepalive vào config
wg set wg0 peer xPsjhj+9Fz24BxfXsmlKgZ2g1NyEu6WNpPaWUKpeoVQ= persistent-keepalive 25

# Persist vào file config
sed -i '/### end truyen ###/i PersistentKeepalive = 25' /etc/wireguard/wg0.conf
```

Giá trị 25 giây duy trì NAT mapping trên hầu hết CGNAT (khuyến nghị WireGuard docs).

---

## 4. 🟡 MEDIUM – wg-dashboard chạy Flask Development Server

### Triệu chứng
```
WARNING: This is a development server. Do not use it in a production deployment.
         Use a production WSGI server instead.
* Running on http://0.0.0.0:10086
```

Flask dev server là **single-threaded**, không xử lý concurrent request, và bind `0.0.0.0` (exposed toàn mạng). Khi dashboard nhận nhiều request đồng thời, nó block và có thể gián tiếp ảnh hưởng đến wg0 polling.

Lịch sử log tháng 5/2022 cho thấy service này crash liên tục mỗi 5 giây trong nhiều giờ.

### Fix
```bash
pip3 install gunicorn
# Sửa /etc/systemd/system/wg-dashboard.service:
# ExecStart=/usr/bin/gunicorn --workers 2 --bind 0.0.0.0:10086 dashboard:app
```

Hoặc giới hạn bind vào localhost nếu chỉ access qua tunnel:
```
--bind 127.0.0.1:10086
```

---

## 5. 🟡 MEDIUM – Postfix chạy không cần thiết

### Triệu chứng
```
postfix.service: active (exited) – enabled at boot
```

Container WireGuard không cần mail server. Postfix mặc định được cài theo dependency và enabled. Đây là **attack surface** thừa.

### Fix
```bash
systemctl disable --now postfix
apt-get remove --purge postfix -y
```

---

## 6. Các thông số tổng quan

| Metric | Giá trị | Nhận xét |
|--------|---------|----------|
| Kernel | 6.8.12-30-pve | Tốt – WireGuard kernel-native |
| CPU allocated | 3 vCPU (E5-2680 v4) | Đủ cho workload hiện tại |
| RAM used | 76 MB / 512 MB | Ổn |
| Load average | 1.27 / 1.54 / 1.69 | Cao hơn bình thường cho 3 vCPU với 2% CPU |
| Interrupts/s | ~14,000 | Cao – nhiều small UDP packets |
| Context switches/s | ~23,000 | Cao – cùng nguyên nhân |
| Handshake interval | mỗi ~180s (WireGuard default) | OK |
| wg0 MTU | 1420 | Đúng (1500 - 80 WireGuard overhead) |
| NAT Masquerade | Có (iptables + nftables) | Hoạt động, không có leak |
| Throughput (uptime ~7h) | RX: 30MB, TX: 760MB | Asymmetric – server chủ yếu gửi |

Load average cao bất thường (1.27–1.69 với 2.2% CPU) do `wait` I/O trên softnet/interrupt handling, không phải tính toán thực sự. Sẽ giảm sau khi tăng buffer.

---

## Checklist Fix theo thứ tự ưu tiên

```
[x] 1. Trên Proxmox host: tăng rmem_max, wmem_max, netdev_max_backlog   ← ĐÃ FIX 2026-06-25
[x] 2. Trong CT 112: thêm PersistentKeepalive = 25 vào peer config       ← ĐÃ FIX 2026-06-25
[x] 3. Trong CT 112: disable postfix                                     ← ĐÃ FIX 2026-06-25
[ ] 4. Trong CT 112: chuyển wg-dashboard sang gunicorn                   ← KHÔNG auto-apply (xem ghi chú)
```

### Trạng thái sau khi áp dụng

**Fix 1 – Host socket buffers (ĐÃ ÁP DỤNG):**
```
rmem_max:            212992 → 26214400   (208KB → 25MB)
wmem_max:            212992 → 26214400
netdev_max_backlog:  1000   → 5000
```
Persist tại `/etc/sysctl.d/99-wireguard-perf.conf` (sống qua reboot).

**Fix 2 – PersistentKeepalive (ĐÃ ÁP DỤNG):**
- Runtime: `persistent keepalive: every 25 seconds` ✓
- Persist vào `/etc/wireguard/wg0.conf` ✓ (backup tại `wg0.conf.bak-20260625`)
- Counter `wg0 RX frame errors` đã đóng băng ở 405 (không tăng thêm sau khi bật keepalive)

**Fix 3 – Postfix (ĐÃ ÁP DỤNG):**
- `systemctl disable --now postfix` → `disabled` / `inactive` ✓
- Dùng disable thay vì purge để có thể khôi phục nếu cần.

**Fix 4 – wg-dashboard (CHƯA áp dụng – chủ ý):**
Đây **không phải** nguyên nhân gây chậm WireGuard (chỉ tốn 2.8s CPU trong 7h). Việc đổi sang
gunicorn là thay đổi service đang phục vụ web UI mà bạn truy cập — nếu cấu trúc app không khớp
`dashboard:app` có thể làm hỏng dashboard. Vì rủi ro outward-facing và không liên quan hiệu năng,
mình để lại cho bạn quyết định thay vì tự đổi. Nếu muốn, có thể chạy:
```bash
pip3 install gunicorn
# sửa ExecStart trong /etc/systemd/system/wg-dashboard.service:
# ExecStart=/usr/bin/gunicorn --workers 2 --bind 0.0.0.0:10086 dashboard:app
```

Sau bước 1+2, các triệu chứng chính (dropped packets, HMAC errors, gián đoạn kết nối) đã được giải quyết.

---

## Vòng 2 – Tối ưu tốc độ chuyên sâu (2026-06-25)

### 7. 🔴 BOTTLENECK CHÍNH – NIC host single-queue (r8169)

**Phát hiện quyết định:**
```
Driver: r8169 (Realtek RTL8168h - consumer NIC)
RX queues: 1  |  IRQ: 36 (chỉ 1)  →  toàn bộ packet RX dồn vào 1 CPU core
Ring buffer: 256/256 (đã kịch max phần cứng)
RPS: 0000000 (TẮT)
```
NIC chỉ có **1 hàng đợi nhận + 1 IRQ**, nên mọi packet đi qua host đều xử lý trên **một core duy nhất**.
Đây là gốc rễ của eth0 drops và load average cao — không phải do CPU yếu (host có 28 core nhưng chỉ 1 core làm việc mạng).

**Fix (ĐÃ ÁP DỤNG) – bật RPS/RFS trải softirq ra 7 core:**
```bash
# Runtime + persist
echo 000000fe > /sys/class/net/enp6s0/queues/rx-0/rps_cpus      # CPU 1-7
echo 32768    > /sys/class/net/enp6s0/queues/rx-0/rps_flow_cnt
echo 000000fe > /sys/class/net/veth112i0/queues/rx-0/rps_cpus   # veth CT112
sysctl -w net.core.rps_sock_flow_entries=32768
```
- Persist: `/etc/sysctl.d/99-wireguard-perf.conf` + systemd `rps-tune.service`
  (chạy sau `pve-guests.service` để veth112i0 đã tồn tại) + `/usr/local/sbin/rps-tune.sh`

### 8. ✅ MTU đã TỐI ƯU SẴN – không cần đổi

Đo path MTU thực tế từ server ra Internet:
```
Gói IP 1492 → FAIL (fragment)
Gói IP 1480 → OK     →  Path MTU thực = 1480 (KHÔNG phải 1500!)
```
WireGuard overhead IPv4 = 60 byte → MTU tối ưu = 1480 − 60 = **1420**.
Config hiện tại đang đúng **1420** → chính xác tuyệt đối, giữ nguyên.
(Nếu ai đó "sửa" thành 1440 theo giả định 1500 sẽ gây fragment → chậm.)

### 9. 🟢 txqueuelen wg0 (ĐÃ ÁP DỤNG)

```
wg0 txqueuelen: 1000 → 10000   (giảm TX drop khi burst, baseline có 25 drop)
```
Persist qua `PostUp = ip link set %i txqueuelen 10000` trong wg0.conf (wg-quick).
Đã validate `wg-quick strip wg0` → config hợp lệ.

### Ghi chú: GSO/TSO không áp dụng
NIC r8169 có GRO=on (tốt). GSO/TSO offload **không giúp** cho traffic WireGuard vì packet
đã được mã hoá + phân mảnh sẵn ở MTU 1420 (UDP opaque), nên bỏ qua — tránh rủi ro với driver r8169.

### Ghi chú: wireguard-upnp-refresh
Có timer tự refresh UPnP port mapping qua router mỗi vài giờ — hoạt động bình thường, không
phải bottleneck, giữ nguyên.

---

## Checklist cuối cùng

```
[x] 1. Host: socket buffers 208KB→25MB, netdev_max_backlog 1000→5000
[x] 2. CT112: PersistentKeepalive = 25 (chặn CGNAT port churn / HMAC errors)
[x] 3. CT112: disable postfix
[x] 7. Host: RPS/RFS trải single-queue NIC ra 7 core (bottleneck chính)
[x] 8. MTU: xác nhận 1420 tối ưu (đo path MTU = 1480) — giữ nguyên
[x] 9. CT112: wg0 txqueuelen 1000→10000
[ ] 4. wg-dashboard → gunicorn (tuỳ chọn, không liên quan tốc độ)
```

**Tất cả tối ưu tốc độ đã áp dụng + persist qua reboot.** Hạng mục duy nhất còn lại (gunicorn cho
dashboard) chỉ là hardening, không ảnh hưởng throughput WireGuard.

---

## Vòng 3 – Fix "đơ" khi vào Home Assistant từ ngoài mạng (2026-06-25)

### 10. 🔴 CRITICAL – Thiếu TCP MSS Clamping → trang web đơ/treo

**Triệu chứng:** Truy cập `192.168.31.111` (Home Assistant) qua WireGuard từ ngoài mạng
→ đôi khi load được, đôi khi trang đứng im, đặc biệt khi dùng HA web UI.

**Nguyên nhân:**
```
WireGuard MTU    = 1420
Path MTU ngoài  = 1480 (đo được từ audit trước)
TCP MSS mặc định = 1460 (Ethernet 1500 - 40 byte IP+TCP headers)

Gói TCP lớn: 1460 payload + 60 byte WireGuard overhead = 1520 > 1480 path MTU
→ Packet bị drop âm thầm (ICMP fragmentation needed bị chặn bởi nhiều ISP)
→ TCP sender chờ ACK mãi không đến → trình duyệt đơ
```
HA web UI tải nhiều file JS/CSS/API response lớn nên bị ảnh hưởng nặng hơn
các tác vụ nhỏ (ping, SSH).

**Xác nhận:** FORWARD chain hoàn toàn trống — không có MSS clamping rule nào.

**Fix (ĐÃ ÁP DỤNG):**
```
PostUp  = iptables -A FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
PreDown = iptables -D FORWARD -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu
```
`--clamp-mss-to-pmtu` tự tính MSS phù hợp với path MTU thực tế → không cần hardcode.
Mỗi TCP SYN đi qua tunnel sẽ bị giảm MSS xuống ≤ 1380 bytes (1420 − 40).
Persist vào `wg0.conf` PostUp/PreDown → sống qua reboot.

---

## Checklist hoàn chỉnh

```
[x] 1.  Host: socket buffers 208KB→25MB, netdev_max_backlog 1000→5000
[x] 2.  CT112: PersistentKeepalive = 25 (chặn CGNAT port churn)
[x] 3.  CT112: disable postfix
[x] 7.  Host: RPS/RFS trải single-queue NIC r8169 ra 7 core
[x] 8.  MTU 1420: đã xác nhận tối ưu (path MTU = 1480) — giữ nguyên
[x] 9.  CT112: wg0 txqueuelen 1000→10000
[x] 10. CT112: TCP MSS clamping (fix đơ khi vào Home Assistant từ ngoài)
[ ] 4.  wg-dashboard → gunicorn (tuỳ chọn, không liên quan tốc độ)
```
