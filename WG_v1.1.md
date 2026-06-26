# WireGuard & External-Access Performance Audit — v1.1

> Smarthome TruyenND · Audit 2026-06-26 (live) · WireGuard CT112 + đường truy cập ngoài
> **Kết luận nhanh:** Server WireGuard **đã gần như tối ưu** (kernel module in-kernel, MTU khớp path-MTU, MSS clamp, txqueuelen 10000, NAT/forward đúng). Trần tốc độ truy cập từ ngoài bị giới hạn bởi **upload WAN ~60 Mbps** — WireGuard tuning KHÔNG vượt được trần này. Lợi ích thực sự nằm ở **client-side (split-tunnel)**, **chọn 1 đường thay vì chạy trùng**, **BBR trên server nội dung**, và **DDNS** (IP nhà động). Điểm hạ tầng WG: **94/100** → **96/100** (sau khi khóa WGDashboard).
>
> **v1.1 (2026-06-26) — ĐÃ ÁP DỤNG (Truyền duyệt):**
> 1. ✅ **BBR + fq trên Proxmox host** (`/etc/sysctl.d/99-network-tune.conf` + `/etc/modules-load.d/bbr.conf`, `tc qdisc replace enp6s0 root fq`). Backup `/root/.audit_backups/`.
> 2. ✅ **BBR per-CT** cho CT104/108/111/113 (cc per-netns, host change không tự lan; unprivileged CT ghi được) — `/etc/sysctl.d/99-bbr.conf` mỗi CT. Phục vụ open-webui / frigate UI / 9router / **cloudflared** ra ngoài.
> 3. ✅ **WGDashboard khóa LAN**: `app_ip 0.0.0.0 → 192.168.31.143` (backup `.bak`), restart dashboard (KHÔNG đụng tunnel wg0). Vẫn truy cập từ LAN + WG client (route 192.168.31.0/24).
> 4. ⛔ **Ring buffer enp6s0**: đã ở **max phần cứng 256/256** → không nâng được.
> 5. ⛔ **BBR trên HAOS (VM101) & DSM/NAS (VM100)**: kernel không có module BBR (HAOS 6.18 chỉ reno/cubic; DSM 4.4 dùng `westwood`) — là appliance, không can thiệp.
> 6. 🔲 **Còn lại cho Truyền (client/router, ngoài tầm server):** split-tunnel `AllowedIPs` trên app client · DDNS cho IP nhà động · xác nhận router KHÔNG forward 10086 · chọn 1 đường WG/Tailscale tránh trùng.

---

## 0 · NGUYÊN TẮC (giống PVE/HA prompt)

- **KHÔNG phá dữ liệu / không restart service quan trọng khi chưa confirm.** Đổi MTU hoặc `wg-quick restart` sẽ **rớt mọi peer đang kết nối** → chỉ làm khi Truyền duyệt và biết mình không đang dùng tunnel.
- Backup config (`.bak-YYYYMMDD`) trước khi sửa.
- **Không in bí mật**: redact PrivateKey/PresharedKey/PublicKey, token.
- Audit-first → bảng xếp hạng → menu chờ chọn.

---

## 1 · KIẾN TRÚC TRUY CẬP NGOÀI (3 đường song song)

| Đường | Vị trí | Trạng thái | Vai trò | Ghi chú tốc độ |
|---|---|---|---|---|
| **WireGuard** | CT112 (192.168.31.143) | running, 2 peer | VPN full-LAN, UDP 51820 (port-forward router) | Direct P2P, overhead thấp nhất, full `192.168.31.0/24` |
| **Tailscale** | host `proxmox-pve` (exit-node), CT104 frigate, CT102 mcp-server | active | Mesh WG, tự xuyên NAT, không cần DDNS | `nitro5` đang **direct** `14.255.21.183:1082` (CÙNG IP với peer WG) → cùng vị trí remote |
| **Cloudflare Tunnel** | CT113 cloudflared `2026.6.1` | active | Expose web service qua Cloudflare edge | Thêm 1 hop edge; tốt cho web UI public, vẫn bị trần upload nhà cho file lớn |

> ⚠️ **Trùng lặp:** Truyền (remote IP `14.255.21.183`) đang có **cả** WireGuard **và** Tailscale (`nitro5` direct) tới cùng đích. Cả hai đều là giao thức WireGuard → **không có lợi tốc độ khi chạy song song**; chọn 1 đường cho mỗi mục đích.

---

## 2 · BASELINE WIREGUARD (CT112)

```
CT112: unprivileged LXC · Debian 11 bullseye · 3 cores · 512MB (dùng 92MB) · onboot:1 · IP 192.168.31.143
Host:  Xeon E5-2680 v4 (28T, AES-NI) · kernel 6.8.12-30-pve · WG module 1.0.0 (IN-KERNEL ✓)
NIC:   enp6s0 1000Mb/s Full · ring 256/256 · default_qdisc pfifo_fast · cong cubic
WAN:   ~203 Mbps down / ~60 Mbps up (Viettel, IP ĐỘNG 171.229.55.177) · path-MTU ~1480
```

**wg0:** `10.6.0.1/24` · MTU **1420** · ListenPort **51820** · txqueuelen **10000**
- Peer `truyen` → `10.6.0.2/32`, keepalive 25, PSK ✓, handshake **tươi (~48s)**, đang dùng
- Peer `device2` → `10.6.0.3/32`, keepalive 25, PSK ✓, handshake 4h15m (idle)
- Cả 2 peer endpoint = `14.255.21.183` (cùng NAT remote)

**Đã chuẩn (không cần sửa):**
- ✅ `net.ipv4.ip_forward=1`, `conf.all.src_valid_mark=1`
- ✅ NAT: `POSTROUTING -s 10.6.0.0/24 -o eth0 -j MASQUERADE`
- ✅ MSS clamp: `FORWARD ... TCPMSS --clamp-mss-to-pmtu` (xử lý PMTU cho TCP)
- ✅ `PostUp ip link set wg0 txqueuelen 10000`
- ✅ WG kernel module (không phải userspace/boringtun) → throughput tối đa
- ✅ MTU **1420** khớp **chính xác** path-MTU WAN: 1420 + 60 (IP/UDP/WG IPv4) = **1480** = path-MTU đo được → **không phân mảnh** (đã verify gói 1480 DF qua được)
- ✅ Không lỗi WG trong journal/dmesg

---

## 3 · BẢNG XẾP HẠNG PHÁT HIỆN

| # | Mức | Hạng mục | Nguyên nhân / Hiện trạng | Tác động tốc độ | Fix |
|---|---|---|---|---|---|
| 1 | 🟢 INFO | **Trần upload WAN ~60 Mbps** | FTTH Viettel asymmetric; truy cập ngoài = upload nhà | Trần cứng ~55 Mbps qua tunnel (sau overhead). KHÔNG fix bằng WG tuning | Nâng gói cước / chấp nhận |
| 2 | 🟠 MED | **Client full-tunnel?** `AllowedIPs=0.0.0.0/0` | Nếu client route TẤT CẢ qua nhà → mọi internet của client vòng qua pipe 60 Mbps + thêm latency | Lớn (cảm nhận chậm khi lướt web lúc bật VPN) | **Split-tunnel** client: `AllowedIPs=192.168.31.0/24,10.6.0.0/24` |
| 3 | 🟠 MED | **WGDashboard `0.0.0.0:10086` HTTP trần** | Bind mọi interface, không TLS | Bảo mật (không phải tốc độ) | Bind `127.0.0.1`/`10.6.0.1`/LAN-only + firewall; đảm bảo router KHÔNG forward 10086 |
| 4 | 🟠 MED | **IP nhà ĐỘNG, không rõ DDNS** | Endpoint client trỏ IP/DDNS nhà; IP đổi → mất kết nối | Reliability (mất kết nối > chậm) | Dùng DDNS hostname cho Endpoint client; chạy updater. (Tailscale tự lo việc này) |
| 5 | 🟡 LOW | **Cong control = cubic, chưa BBR** | Forwarder CT112 không terminate TCP → BBR ở đây ít tác dụng cho traffic forward | TB trên đường lossy/mobile/xa | Bật **BBR + fq trên server nội dung** (HA VM101, NAS, open-webui) — nơi thực sự gửi TCP |
| 6 | 🟡 LOW | **NIC ring 256/256 + default_qdisc pfifo_fast** | Mặc định; bottleneck queue thực ở router ISP | Marginal (WAN-bound) | `fq_codel` host + ring lên max — lợi ích nhỏ, đổi NIC gây blip |
| 7 | 🟡 LOW | **Chạy trùng WireGuard + Tailscale cùng đích** | Hai đường WG song song | 0 lợi tốc độ; rủi ro double-encrypt nếu full-tunnel cả hai | Chọn 1: WG (lean, cần DDNS) hoặc Tailscale (tiện, tự NAT) |
| 8 | 🟢 INFO | **MTU mobile peer** | Peer mobile có thể path-MTU <1480 → gói UDP/QUIC inner rớt (TCP đã có MSS clamp) | Nhỏ, chỉ peer mobile | (Tùy chọn) hạ wg0 MTU 1420→1380 nếu peer mobile gặp lỗi UDP. Mặc định GIỮ 1420 |
| 9 | 🟢 INFO | CT112 Debian 11 EOL 2026-08 | Userspace cũ (kernel module từ host nên không ảnh hưởng perf) | 0 (bảo trì) | Lên bookworm khi tiện |

---

## 4 · KHUYẾN NGHỊ ƯU TIÊN (theo lợi ích thực tế)

1. **[Lợi nhất, client-side] Split-tunnel** trên app WireGuard của client → giữ internet client đi đường riêng, chỉ traffic về nhà mới vào tunnel. Sửa `AllowedIPs` trong config client (không phải server).
2. **[Reliability] DDNS** cho Endpoint (IP nhà động) — hoặc dùng Tailscale cho thiết bị hay đổi mạng.
3. **[Bảo mật] Khóa WGDashboard** về LAN/loopback, xác nhận router không forward 10086.
4. **[Server tuning] BBR+fq** trên HA VM101 / NAS / open-webui (nơi gửi TCP) — cải thiện throughput khi remote ở xa/lossy:
   ```
   net.core.default_qdisc=fq
   net.ipv4.tcp_congestion_control=bbr
   ```
5. **[Dọn] Chọn 1 đường** cho mỗi mục đích, tránh full-tunnel chồng WG+Tailscale.
6. **Giữ nguyên** MTU 1420, txqueuelen, MSS clamp, NAT, in-kernel WG — đã tối ưu.

> ❗ Mọi thay đổi đụng `wg0` (MTU/restart) **rớt peer đang kết nối** → chỉ làm khi Truyền duyệt và không đang dùng tunnel.

---

## 5 · ĐIỂM

**WG hạ tầng: 94/100.** Server tuning xuất sắc; trừ điểm cho WGDashboard phơi nhiễm + thiếu DDNS rõ ràng. Tốc độ truy cập ngoài bị chặn bởi upload WAN 60 Mbps (ngoài tầm WG). Lợi ích lớn nhất là split-tunnel client.

---

## 6 · TRẠNG THÁI PHIÊN

- 2026-06-26 v1.0: Audit đầu tiên cho WireGuard. Baseline ghi nhận ở §2. Chưa áp dụng thay đổi nào (chờ Truyền chọn menu §4). Có peer đang kết nối lúc audit.
