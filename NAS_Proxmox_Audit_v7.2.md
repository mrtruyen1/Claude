# NAS + Proxmox VM Audit & Optimization Prompt — v7.1
> Synology DVA1622 trên Proxmox 8.x · Cập nhật từ phiên 2026-06-21 (lần 2)
> **v7.1:** Sửa 3 lỗi prompt phát hiện khi chạy live audit: (1) net-buffer check sai lớp (host → DSM), (2) Frigate API sai cổng (`:5000` → `:8971`/docker), (3) gỡ nhận định sai "synobios 03:02 = benign" (thực ra là reboot DSM do backup mode-stop, đã fix). Ghi baseline mới: backup VM100 = snapshot, 2 camera, mount frigate-nas, affinity 0-13, NCQ cmdline thiếu.
> **v7.0 (tái cấu trúc):** Gộp toàn bộ thông tin trùng lặp (bảng kết nối / baseline / checklist) về **nguồn duy nhất**; bổ sung 3 mảng audit còn thiếu (**Network/NFS**, **Backup verification**, **App-layer health**); thêm **rubric chấm điểm tái lập được** và **bảng ngưỡng cảnh báo**; gom **bài học theo nhóm chủ đề**. Không mất dữ liệu vận hành nào từ v6.9.

---

## 🤖 CÁCH DÙNG FILE NÀY

Upload file `.md` này + nhắn **"audit"** → AI **tự chạy ngay** PHASE 0 → 7, **không hỏi xác nhận**:

1. Đọc context (kiến trúc, baseline, bài học, trạng thái phiên trước)
2. `tool_search` để load tool MCP (connector `Proxmox`)
3. Chạy PHASE 0 → 7 tuần tự
4. Báo cáo 2 lớp + chấm điểm theo rubric + liệt kê việc cần làm
5. Cuối phiên: cập nhật file này (bài học mới, trạng thái, baseline)

Bạn là **Senior Linux + NAS + DevOps + Storage + Virtualization Engineer**. Audit **2 lớp** (Proxmox host + guest), tìm lỗi/bottleneck/rủi ro bảo mật, đề xuất fix an toàn, tự tạo script khi cần.

---

## 🔒 NGUYÊN TẮC BẤT BIẾN (đọc trước mọi thứ)

- **KHÔNG phá dữ liệu.** Không reset RAID, format disk, xóa data user.
- **Luôn backup config trước khi sửa** (lưu `.bak-YYYYMMDD` cạnh file gốc).
- **Không chạy lệnh nguy hiểm** (`destroy`/`format`/`dd`/`mkfs`) nếu chưa backup + xác nhận.
- **Không restart service quan trọng** khi chưa confirm — TRỪ fix an toàn đã có tiền lệ ghi trong "Bài học".
- `bash -n` kiểm tra mọi script trước khi deploy.
- Khi nghi ngờ → **báo cáo + đề xuất**, không tự ý hành động phá hoại.

---

## ⚡ BẢNG KẾT NỐI — NGUỒN DUY NHẤT

> Đa số lỗi `Permission denied` / `Connection refused` là **sai user hoặc sai port**. SSH key-based confirmed OK cho cả 3 target chính (2026-06-21).

| Target | IP | Truy cập | User | Port | Ghi chú then chốt |
|---|---|---|---|---|---|
| **Proxmox host** | `192.168.31.84` | `Proxmox:pve_run` (MCP thẳng) | — | — | KHÔNG SSH — gọi tool trực tiếp |
| **DSM (NAS) VM100** | `192.168.31.116` | `Proxmox:dsm_run` / `dsm_sudo_run` | `admin` | **22** | ❌ KHÔNG `root@` — DSM chỉ cho `admin`. Sudo = NOPASSWD ALL |
| **Home Assistant VM101** | `192.168.31.111` | `Proxmox:ha_run` | `root` | **2501** | ❌ KHÔNG port 22 — phải **2501** |
| **mcp-server CT102** | `192.168.31.26` | `Proxmox:ct_exec ctid=102` | — | — | ❌ `ssh_run`/SSH thẳng vào .26 = refused (CT unprivileged). Dùng `ct_exec` |
| **n8n VM105** | `192.168.31.105` | SSH từ `pve_run` `-i ~/.ssh/n8n_key` | `ubuntu` | **22** | Key trên host. Thường stopped |
| **Frigate CT104** | `192.168.31.104` | `Proxmox:ct_exec ctid=104` | — | — | `nsenter` nếu ct_exec timeout |
| **Windows VM103** | `192.168.31.19` | (thường stopped) | — | — | IP `.19` trong SSH log = **bình thường**, KHÔNG brute force |

**Mẫu SSH đúng (chạy bên trong `Proxmox:pve_run`):**
```bash
# DSM
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes admin@192.168.31.116 "lệnh"
# Home Assistant (port 2501!)
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes -p 2501 root@192.168.31.111 "lệnh"
# n8n VM105
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes -i ~/.ssh/n8n_key ubuntu@192.168.31.105 "lệnh"
```

**Quy tắc viết lệnh nested (tránh quote-hell):**
- Tránh `<<<` (here-string) lồng trong `pve_run` có nested quotes → dùng `echo "cmd" | timeout N qm monitor $vmid`.
- Tránh `'` lồng nhiều cấp trong SSH-trong-pve_run → dùng `"` cho format string ngoài, hoặc tách 2 bước.
- `qm agent <vmid> exec` **không ổn định** nhiều version → SSH vào VM thay thế (bài học #23).
- Lệnh chạy lâu qua MCP: `nohup ... & echo started` rồi gọi riêng `sleep N && cat logfile`.
- Inject file nhiều dòng vào CT: ghi `/tmp/` trên host → `cat file | pct exec <ctid> -- bash -c 'cat > /dest'` (tránh heredoc lồng quote).

---

## 🗺️ KIẾN TRÚC HỆ THỐNG (2026-06-21)

```
Physical (31 GiB RAM · Xeon E5-2680 v4 · 28 vCPU)
└── Proxmox Host — PVE 8.x / kernel 6.8.12-30-pve · 192.168.31.84   ← LỚP 1
    ├── VM 100 — Synology DSM/DVA1622  192.168.31.116  10G RAM, balloon min 6144     ← LỚP 2
    ├── VM 101 — Home Assistant        192.168.31.111  10G RAM, balloon min 6144, discard=on
    ├── VM 103 — Windows 10            192.168.31.19   8G RAM, balloon 4096 ✅, thường STOPPED
    ├── VM 105 — n8n (Ubuntu)          192.168.31.105  4G RAM, balloon min 2048, thường STOPPED
    ├── CT 102 — mcp-server            192.168.31.26   512M · mcp-server/node/nginx/tailscaled (Funnel ingress)
    ├── CT 104 — Frigate NVR           192.168.31.104  4096M RAM, swap 2048M, GPU passthrough DRI
    ├── CT 106 — mqtt-broker (Mosquitto) 512M, nesting=1
    ├── CT 107 — mariadb 10.11.14      512M, unprivileged, swap 256M
    ├── CT 110 — zigbee2mqtt (Node.js) 512M, nesting=1
    ├── CT 112 — Wireguard             STOPPED (thay bằng Tailscale, giữ làm fallback)
    └── CT 113 — cloudflared (Debian 13) 512M, nesting=1, swap 512M · native binary + systemd
```

**Disk vật lý passthrough → VM100:**
| Bay | Disk | Host thấy là |
|---|---|---|
| sata3 | ST3000VX010 (3TB Seagate) | `sdc` |
| sata4 | Hitachi HUS724040ALE641 (4TB) | `sdb` |
| sata5 | HGST HUS724040ALE641 (4TB) | `sda` |

**Tailscale topology (xác nhận v6.9):**
- **HOST `proxmox-pve` (100.97.18.51)** = exit node **+** subnet router → advertise `0.0.0.0/0, ::/0, 192.168.31.0/24`; `PrimaryRoutes=[192.168.31.0/24]`.
- **CT102** = Funnel ingress thôi (KHÔNG subnet router).
- Host IP forwarding ipv4 + ipv6 = `1`.

---

## 🔧 MCP TOOLS — Connector `Proxmox` (PRIMARY, 14 tools)

> **PHASE 0 bắt buộc:** gọi `tool_search` query `"Proxmox pve_run dsm_run system_overview balloon fstrim smart pve_logs dsm_logs ha_logs"` để load tool (deferred — không load = không gọi được).
> Connector `Proxmox` → URL `https://mcp-server.tail1105f.ts.net/merged`.

| Tool | Target | Mô tả |
|------|--------|--------|
| `pve_run` | Host | Shell tùy ý trên host — cốt lõi mọi audit |
| `dsm_run` | DSM | Shell user `admin` (lệnh không cần root) |
| `dsm_sudo_run` | DSM | Shell root qua sudo — fstrim, docker, syslog-ng, ghi `/etc` |
| `ha_run` | HA | Shell HA (tự dùng port 2501) |
| `ssh_run` | Host bất kỳ | Params `host`,`user`,`port`(=22). ⚠️ KHÔNG dùng cho CT102 |
| `ct_exec` | LXC | Params `command`,`ctid`. Dùng cho CT 102/104/106/107/110/112/113 |
| `smart_check` | Host | SMART mọi disk + tự so baseline UDMA_CRC |
| `balloon_status` | Host | RSS + balloon actual mọi VM một lần |
| `fstrim_all` | DSM+Host | Kick fstrim DSM (bg) + PVE host |
| `fstrim_status` | DSM | Poll tiến trình fstrim DSM (sau `fstrim_all`) |
| `system_overview` | Toàn hệ | 11 mục song song: RAM, per-VM RSS/balloon, LVM%, NCQ, ZFS, storage, DSM df, mdstat, DSM NCQ, docker, failed units |
| `pve_logs` | Host | Params `service`,`lines`(=50),`grep` |
| `dsm_logs` | DSM | Params `source`(messages/synolog/docker/kern/fstrim),`lines`,`grep` |
| `ha_logs` | HA | Params `lines`,`level`(all/error/warning/info),`grep` |

**Fallback — connector `synology`** (khi `Proxmox` timeout): `pve_run`, `ha_run`, `pve_disk_health`, `pve_disk_smart`(param `disk`), `system_info`. ⚠️ **Không có** `dsm_run`/`dsm_sudo_run` → vào DSM bằng `synology:pve_run` + SSH `admin@192.168.31.116:22`.

---

## 📊 BASELINE & NGƯỠNG CẢNH BÁO — NGUỒN DUY NHẤT

### Giá trị baseline (FROZEN — lệch là tín hiệu)
| Mục | Baseline | Ý nghĩa khi lệch |
|---|---|---|
| UDMA_CRC | sda=**18**, sdb=**65**, sdc=**0** | Tăng = lỗi cable/SATA interface |
| Reallocated / Pending / Uncorrectable | **0** mọi disk | >0 = disk xuống cấp → cảnh báo HIGH |
| NCQ queue_depth | sda/sdb/sdc = **1** (NCQ tắt có chủ đích) | KHÔNG bật lại — locked 3 lớp (xem bài học) |
| ZFS ARC max | `4294967296` (4 GiB) | Khác = sai config |
| LVM thin `data%` | ~**46%** | >70 fstrim · >80 urgent |
| DSM volume1 / volume2 / volume3 | **4% / 55% / 16%** | vol2/vol3 baseline; >80 action |
| mdstat DSM | `[4/26] UUUU` | Bình thường DVA1622 |
| Balloon min | VM100/101=**6144**, VM103=**4096**, VM105=**2048** | Thiếu min = watch |
| Kernel | `6.8.12-30-pve` | Bump minor = benign |
| cloudflared tunnel | **4** connections, `/ready`=200 | <4 = restart cloudflared |
| Backup VM100 (job 03:00) | `mode snapshot` (đổi từ stop 2026-06-21) | `stop` = reboot DSM mỗi đêm → đổi lại snapshot |
| DSM net buffer (rmem/wmem) | **16777216** (16MB, trong DSM) | check bằng `dsm_run`, KHÔNG host (host=212992 mặc định OK) |
| NCQ kernel cmdline | `libata.force=noncq` **hiện ABSENT** (chỉ 2/3 lớp) | queue_depth=1 vẫn giữ qua udev+rc.d; thêm vào GRUB nếu muốn đủ 3 lớp |
| Camera Frigate | `ngoai_troi` (AI) + `phong_ngu` | "No new valid recording segments" lặp = NFS volume3 rớt |

### Bảng ngưỡng (để chấm điểm tái lập được)
| Chỉ số | OK | Watch | Hành động |
|---|---|---|---|
| Host RAM available | >8 Gi (VM103/105 stopped ≈8.6Gi) | 6–8 Gi | <6 Gi = HIGH (chạy VM103 ≈5Gi là dự kiến) |
| Host swap | <700 MB | 0.7–2 GB | >2 GB → soi từng process |
| LVM `data%` | <60% | 60–70% | >70 fstrim · >80 urgent |
| DSM volume | <70% | 70–80% | >80% = HIGH |
| Disk temp | <45 °C | 45–55 °C | >55 °C = HIGH |
| Failed systemd units | 0 | — | ≥1 = MEDIUM (điều tra) |
| UDMA_CRC | = baseline | — | tăng = HIGH (cable) |
| cloudflared conns | 4 | — | <4 = MEDIUM (restart) |
| Backup gần nhất | <26h | 26–50h | >50h = MEDIUM (kiểm tra cron) |

---

## 🔬 QUY TRÌNH AUDIT — PHASE 0 → 7

### PHASE 0 — Load tools
`tool_search "Proxmox pve_run dsm_run system_overview balloon fstrim smart pve_logs dsm_logs ha_logs"`

### PHASE 1 — System overview (RAM / Swap / Memory pressure)
Gọi **`Proxmox:system_overview`** trước (cover phần lớn). Bổ sung bằng `pve_run`:
```bash
# Uptime + load + thời gian
uptime; cat /proc/loadavg
# Swap theo process (nếu swap > 1 GiB)
for pid in $(ls /proc | grep -E '^[0-9]+$'); do
  s=$(grep -s VmSwap /proc/$pid/status | awk '{print $2}')
  [ "${s:-0}" -gt 10240 ] && echo "PID $pid ($(cat /proc/$pid/comm 2>/dev/null)): ${s} kB"
done
# Memory pressure / OOM (MỚI — quan trọng vì hệ RAM eo hẹp)
dmesg -T | grep -iE "oom|killed process|out of memory" | tail -10
cat /proc/pressure/memory 2>/dev/null   # PSI: some/full avg10
# Balloon actual (backup nếu balloon_status lỗi)
for vmid in 100 101 103 105; do
  echo -n "VM $vmid: "; echo "info balloon" | timeout 3 qm monitor $vmid 2>/dev/null | grep -i balloon || echo "N/A"
done
# Journal ngốn disk
journalctl --disk-usage
# Time sync host
timedatectl | grep -E "synchronized|NTP"
```
**DSM (Proxmox:dsm_run):** `free -h`; `dmesg | grep -iE "NCQ|ICRC|abort|error" | tail`; `sudo grep synobios /var/log/messages | tail -5` (chỉ "unload" lúc boot/03:02 = benign).

### PHASE 2 — Storage & SMART
Gọi **`Proxmox:smart_check`** (tự so baseline). Bổ sung:
```bash
# SMART chi tiết + nhiệt độ + lịch self-test (MỚI)
for d in sda sdb sdc; do [ -b /dev/$d ] || continue
  echo "=== $d ==="
  smartctl -a /dev/$d | grep -E "Model|Power_On_Hours|Reallocated|Pending|Uncorrectable|UDMA_CRC|Temperature|SMART overall"
  smartctl -l selftest /dev/$d | head -4   # đã chạy extended test chưa?
done
# Snapshot tích tụ ăn LVM (MỚI)
for v in 100 101 103 105; do qm listsnapshot $v 2>/dev/null; done
lvs -o lv_name,lv_size,data_percent --units g pve
# NFS storage health + latency (MỚI)
pvesm status
mount | grep nfs
df -h /mnt/pve/Synology
# fstrim trạng thái + log tháng này
ls -la /var/log/fstrim-vms-$(date +%Y%m).log && tail -20 /var/log/fstrim-vms-$(date +%Y%m).log
```
**DSM:** `df -h` (so baseline vol1/2/3); `cat /proc/mdstat`; NCQ sata1-4 = 1.

### PHASE 3 — Network & connectivity (MỚI — mảng còn thiếu)
```bash
# Lỗi/drop trên bridge + NIC VM
for i in vmbr0 $(ls /sys/class/net | grep -E '^tap|^veth|^fwln'); do
  echo "=== $i ==="; ip -s link show $i 2>/dev/null | grep -A1 -E "RX:|TX:" | grep -E "[0-9]"
done
ip -s link show vmbr0   # RX/TX errors, dropped phải ≈ 0
# DNS phân giải
getent hosts github.com >/dev/null && echo "DNS OK" || echo "DNS FAIL"
# Tailscale (chạy trên HOST, KHÔNG CT102)
tailscale status 2>/dev/null | head; tailscale status --json 2>/dev/null | grep -E "ExitNode|PrimaryRoutes" 
sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding   # = 1
# cloudflared tunnel (trong CT113)
pct exec 113 -- curl -s http://127.0.0.1:20241/ready   # status 200, readyConnections:4
# Cert expiry cloudflared/DSM (MỚI — cảnh báo sớm)
pct exec 113 -- sh -c 'cloudflared --version' 2>/dev/null
```

### PHASE 4 — Services / Containers / VMs + App-layer health (MỞ RỘNG)
```bash
# Tổng quan VM/CT
qm list; pct list
# Failed units mọi tầng
systemctl --failed --no-legend
for ct in 102 104 106 107 110 113; do
  echo "=== CT$ct ==="; pct exec $ct -- systemctl --failed --no-legend 2>/dev/null
done
# PCI passthrough còn sống? (MỚI — Frigate phụ thuộc DRI; VM100 phụ thuộc disk passthrough)
pct exec 104 -- ls -la /dev/dri 2>/dev/null     # GPU cho Frigate
qm config 100 | grep -E "sata|scsi|args"        # disk passthrough VM100
```
**App-layer (MỚI — "service có thật sự chạy đúng không"):**
- **CT102:** `pct exec 102 -- systemctl is-active mcp-server tailscaled nginx` → đều `active`.
- **CT104 Frigate:** API chạy trong **Docker map `:8971` + auth** (KHÔNG `:5000` trên localhost CT). Check sức khỏe: `pct exec 104 -- sh -c 'docker ps --filter name=frigate --format "{{.Status}}"; ls /dev/dri; free -m | grep -E "Mem|Swap"'` → docker `(healthy)`, GPU dri (card0+renderD128) hiện, MemAvail >2GB, swap <50MB. Trạng thái camera: `pct exec 104 -- docker logs frigate 2>&1 | grep -iE "ngoai_troi|phong_ngu|No new valid|error" | tail` → KHÔNG có lỗi "No new valid recording segments" lặp (lỗi này = NFS volume3 rớt, thường do reboot DSM).
- **CT106 Mosquitto:** `pct exec 106 -- systemctl is-active mosquitto`; số client kết nối.
- **CT107 MariaDB:** `pct exec 107 -- sh -c 'systemctl is-active mariadb; du -sh /var/lib/mysql'` → 0 failed, theo dõi kích thước DB (HA dùng).
- **CT110 z2m:** `pct exec 110 -- systemctl is-active zigbee2mqtt`; số thiết bị online.
- **VM101 HA:** `ha_run "ha core info"` hoặc `ha_logs level=error lines=30` → không lỗi tích hợp lặp.
- **VM105 n8n (nếu chạy):** image pin `n8nio/n8n:2.25.7` trong `/opt/n8n/docker-compose.yml`.
- **Balloon actual** mọi VM đang chạy (`balloon_status`).

### PHASE 5 — Performance optimization
```bash
for d in sda sdb sdc; do
  [ -f /sys/block/$d/device/queue_depth ] && echo "$d queue_depth: $(cat /sys/block/$d/device/queue_depth)"  # = 1
  [ -f /sys/block/$d/queue/scheduler ] && echo "$d sched: $(cat /sys/block/$d/queue/scheduler)"
done
# Network buffer 16MB tune nằm TRONG DSM (KHÔNG ở host — host=212992 mặc định là đúng).
# Xác nhận qua dsm_run: sysctl net.core.rmem_max net.core.wmem_max  → phải = 16777216
```

### PHASE 6 — Security & Backup verification (MỞ RỘNG)
**Checklist bảo mật:**
- [ ] NIC virtio? (VM100/101/103/105 ✅) · discard=on mọi VM? · balloon driver bật + min config?
- [ ] ZFS ARC giới hạn 4 GiB? · Failed units = 0? · NFS online? · CT112 Wireguard stopped?
- [ ] Tailscale: HOST advertise exit + `192.168.31.0/24`? IP forwarding = 1?
- [ ] SSH log có IP lạ? (`192.168.31.19` = VM103 = bình thường — bài học #21)

**Cập nhật & backup (MỚI):**
```bash
# Bản vá bảo mật chờ cài (host + CT)
apt-get -s upgrade 2>/dev/null | grep -E "^[0-9]+ upgraded|security" | head
for ct in 106 107 110 113; do pct exec $ct -- sh -c 'apt-get -s upgrade 2>/dev/null | grep -c ^Inst' 2>/dev/null; done
# Verify backup THỰC SỰ chạy (không chỉ tin script tồn tại)
ls -la /var/lib/vz/dump/ 2>/dev/null | tail; pvesm list local | grep vzdump | tail
journalctl -u cron --since "yesterday" | grep -iE "backup|vzdump" | tail
# backup-all.sh: CT array gồm 102/104/106/107/110/112/113? PHASE 5b có mosquitto/mysqldump/z2m/cloudflared?
grep -E "CTS=|PHASE 5b|mysqldump|mosquitto" /opt/backup-all.sh
```

### PHASE 7 — Reporting

**Format severity:**
```
[Proxmox] HIGH    — RAM áp lực khi VM103 chạy (available < 6 GiB)
[DSM VM]  HIGH    — volume2 > 80%
[Proxmox] MEDIUM  — vm-103-disk-1 > 80%
[CT113]   LOW     — cloudflared image cần update
```

**Rubric chấm điểm (tái lập được) — bắt đầu 100 điểm:**
- HIGH (rủi ro data / service down / lỗ hổng bảo mật): **−5** mỗi finding
- MEDIUM (perf suy giảm / sát ngưỡng / config drift / failed unit): **−2**
- LOW (cosmetic / minor): **−1**
- Watch item (đã biết, đang theo dõi, chưa cần hành động): **−0**
- Thang: **≥97 = healthy** · 90–96 = minor issues · <90 = cần hành động.

Báo cáo 2 lớp (host / DSM / containers+VMs), liệt kê watch items, ghi việc cần làm phiên sau.

---

## 🎓 BÀI HỌC — GOM THEO NHÓM (phải áp dụng khi audit)

> Giữ số bài học lịch sử ở những mục được tham chiếu chéo (#21–#32). Chi tiết #1–#20 từ v6.8 đã được hợp nhất theo chủ đề bên dưới; các bài học vận hành lặp lại quan trọng đều có mặt ở đây.

### Truy cập & SSH
- **#21** SSH từ `192.168.31.19` = Windows VM103 → **bình thường**, KHÔNG coi là brute force.
- **#22** `ssh_run`/SSH thẳng vào CT102 (`.26`) = refused (CT unprivileged) → dùng `ct_exec`.
- **#23** `qm agent <vmid> exec` không ổn định nhiều version → SSH vào VM thay thế.
- **#24** QEMU guest agent **timeout ≠ VM chết** — đừng kết luận VM down chỉ vì agent timeout.
- DSM chỉ cho `admin@`:22 (KHÔNG `root`); HA dùng `root@`:**2501** (KHÔNG 22).

### Storage / SMART / NCQ
- SMART baseline FROZEN (sda=18/sdb=65/sdc=0); tăng = cable/interface, KHÔNG phải disk chết.
- **NCQ tắt có chủ đích, khóa 3 lớp** (udev `queue_depth=1`, `fix-ncq.sh` rc.d, kernel cmdline `libata.force=noncq`) → KHÔNG bật lại.
- volume3 tụt ~2% sau cài lại disk = **không phải lỗi**.
- mdstat `[4/26] UUUU` = bình thường DVA1622.
- KHÔNG kết luận disk chết từ `dmesg` **trong VM** — verify từ Proxmox host.

### RAM / Balloon
- VM101 (HA) dễ bị balloon squeeze khi RAM căng → min nâng **6144**; VM103 min **4096**.
- KHÔNG kết luận swap cao là do ZFS ARC khi chưa soi từng process.
- KHÔNG kết luận LVM thin đầy khi chưa chạy fstrim.
- Giữ VM103/105 **stopped** để giải phóng RAM (chạy VM103 ≈ +8 GiB).
- Balloon actual: `echo "info balloon" | timeout 3 qm monitor $vmid` (pipe, KHÔNG `<<<` khi nested; `timeout` tránh treo trên VM stopped).

### LXC / Containers
- **#26** `pct fstrim` trả 0B trên LVM thin → fstrim **host-side** `fstrim -v /var/lib/lxc/$ct/rootfs/`.
- **#31** KHÔNG thêm `discard=1` vào `/etc/pve/lxc/*.conf` → schema error, CT không start.
- **#32** `pct` ở **`/usr/sbin/pct`** (KHÔNG `/usr/bin/pct`) → systemd unit/script phải dùng full path, nếu không lỗi `203/EXEC`.
- CT 106/110/113 cần `--features nesting=1`, thiếu = 21+ systemd unit fail.
- LXC unprivileged KHÔNG ghi được `sysctl net.core.rmem_max` → không tune UDP buffer trong CT.
- **(v7.1)** Sau `apt upgrade` trên CT Debian 13, xuất hiện 1 failed unit `wtmpdb-rotate.timer` (Loaded: not-found) = tàn dư khi Debian chuyển wtmp logging sang `wtmpdb` (SQLite), **vô hại** → dọn bằng `systemctl reset-failed` (không service nào thật sự hỏng).
- **(v7.1)** `systemctl --failed --no-legend` vẫn in cột `●` đầu dòng → parse bằng `--plain` hoặc `awk '{print $2}'`, KHÔNG `$1`.
- **(v7.1)** CT106 mosquitto: repo `repo.mosquitto.org` báo `NO_PUBKEY 61611AE430993623` khi `apt update` → key GPG repo bên thứ 3 hết hạn; gói Debian vẫn update bình thường, chỉ mosquitto upstream bị bỏ qua. Re-import key nếu cần bản mosquitto mới.
- **(v7.2)** vzdump CT102: `exclude-path` trong **job-level** (`jobs.cfg`) **KHÔNG áp dụng** khi chạy manual `vzdump` CLI — chỉ global `/etc/vzdump.conf` được dùng. Fix: thêm đủ path vào cả 2 nơi. Triệu chứng: lỗi `tar: ./var/lib/nginx/body: Cannot open: Permission denied` dù job-level đã exclude.

### Tailscale / Network / cloudflared
- Exit node + subnet router **trên HOST** `proxmox-pve` (100.97.18.51), KHÔNG CT102; CT102 = Funnel ingress.
- Sau reboot, Funnel re-propagate mất vài phút → MCP reconnect chậm là **bình thường**, không phải misconfig.
- cloudflared: **QUIC bị chặn** trên mạng này → phải `--protocol http2`.
- cloudflared token: cross-check qua `grep -o 'token [A-Za-z0-9._-]*'` trong docker-compose — `docker inspect` có thể làm hỏng chuỗi base64.
- Health check cloudflared: `http://127.0.0.1:20241/ready` → `status:200, readyConnections:4`.

### n8n (VM105)
- Image **pin** `n8nio/n8n:2.25.7` trong `/opt/n8n/docker-compose.yml`.
- Sửa SQL raw vào node/connection PHẢI thêm row `workflow_history` với `versionId`/`activeVersionId` mới + `versionCounter+1`, nếu không n8n lỗi runtime.
- Code node: KHÔNG có `$helpers`/`this.helpers` → tự dựng binary `{data, mimeType, fileName, fileExtension}`.
- `n8n import:workflow` luôn **deactivate** → theo sau `n8n update:workflow --id=<id> --active=true` + `docker restart n8n`.
- Chuyển file: `scp` tới `/tmp/` rồi `docker cp` vào container `n8n`.

### Home Assistant (VM101)
- `shell_command` **âm thầm bỏ mọi thứ sau `&&` hoặc `;`** → tách thành 2 entry riêng + delay giữa chúng.

### DSM (VM100)
- DSM UI hiện "Celeron J4125" = hardcode firmware, **chỉ cosmetic**, không ảnh hưởng chức năng.
- Docker binary: `/volume2/@appstore/ContainerManager/usr/bin/docker` (cần `sudo`/`dsm_sudo_run`).
- ⚠️ **SỬA (v7.1):** "synobios unload 03:02 daily" KHÔNG phải log noise benign — đó là dấu vết **DSM bị reboot do job backup VM100 chạy `mode stop`** lúc 03:00 (tắt VM → backup → bật lại). Đã fix bằng cách đổi sang `mode snapshot` (2026-06-21). Nếu thấy lại uptime DSM < 1 ngày + "Shutdown from ACPI" lúc 03:00 trong `/var/log/messages` → kiểm tra job vzdump còn ở `mode stop` không.

### Backup
- Full VM snapshot **+** config backup (37MB, daily 2AM) bổ trợ nhau; config backup cho phép restore nhanh không cần full disk image.
- `backup-all.sh` phủ CT 102/104/106/107/110/112/113; PHASE 5b backup mosquitto/mysqldump/z2m/cloudflared + Telegram notify.
- **(v7.1)** Job vzdump VM100 `mode stop` = tắt VM (ACPI) → backup → bật lại ⇒ **reboot DSM mỗi đêm 03:00**, NFS volume2/volume3 rớt → Frigate mất ghi hình ~50' (watchdog restart ffmpeg cả 2 camera tới ~03:54). Đổi sang **`mode snapshot`** (đĩa local-lvm thin hỗ trợ snapshot; passthrough đã `backup=0`) để backup live không downtime. Lệnh: `pvesh set /cluster/backup/<id> --mode snapshot`. Hai job hiện có: daily 03:00 → local (đã snapshot), Chủ nhật 02:00 snapshot → Synology.

---

## 🚫 KHÔNG BAO GIỜ
- Kết luận disk chết chỉ từ `dmesg` trong VM (verify từ host).
- Kết luận LVM thin đầy khi chưa fstrim · swap cao = ZFS ARC khi chưa soi process.
- Kết luận VM chết chỉ vì guest agent timeout (#24).
- Coi SSH từ `192.168.31.19` là brute force (#21 — đó là VM103).
- Reset RAID / format disk / xóa data user.
- Restart service quan trọng chưa confirm · chạy `destroy`/`format`/`dd` không backup+confirm.
- Dùng `root@` cho DSM hoặc port 22 cho HA.
- `ssh_run` vào CT102 (#22 — dùng `ct_exec`) · `qm agent exec` để chạy lệnh trong VM (#23 — dùng SSH).
- Thêm `discard=1` vào LXC config (#31) · dùng `pct fstrim`/fstrim trong CT (#26 — dùng host-side rootfs).
- Gọi `/usr/bin/pct` trong systemd unit (#32 — dùng `/usr/sbin/pct`).
- Bật lại NCQ (đã khóa 3 lớp có chủ đích).

---

## 📁 SCRIPTS HIỆN TẠI TRÊN HỆ THỐNG

### `/etc/cron.weekly/fstrim-vms` (cập nhật 2026-06-20)
```bash
#!/bin/bash
# fstrim weekly — Proxmox + DSM + Windows + LXC CTs
# CT fstrim dùng host-side /var/lib/lxc/$ct/rootfs/ (pct fstrim = 0B trên LVM thin)
LOG="/var/log/fstrim-vms-$(date +%Y%m).log"
echo "=== $(date) ===" >> $LOG

# 1. DSM VM100 (Btrfs) — qua SSH
echo "[DSM] fstrim via SSH..." >> $LOG
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes admin@192.168.31.116 \
    "nohup sudo fstrim -av > /tmp/fstrim.log 2>&1 & echo PID:\$!" >> $LOG 2>&1
for i in $(seq 1 20); do
    sleep 30
    DONE=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes admin@192.168.31.116 \
        "ps aux | grep '[f]strim' | wc -l" 2>/dev/null)
    [ "${DONE:-1}" -eq "0" ] && break
done
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes admin@192.168.31.116 \
    "cat /tmp/fstrim.log" >> $LOG 2>&1

# 2. VM103 Windows (nếu stopped) — disk-1 NTFS
STATUS_103=$(qm status 103 2>/dev/null | awk '{print $2}')
if [ "$STATUS_103" = "stopped" ]; then
    echo "[VM103] Stopped — fstrim NTFS vm-103-disk-1" >> $LOG
    mkdir -p /mnt/fstrim-vm103
    kpartx -av /dev/pve/vm-103-disk-1 && sleep 2
    for part in /dev/mapper/pve-vm--103--disk--1p*; do
        [ -b "$part" ] || continue
        [ "$(blkid -o value -s TYPE "$part" 2>/dev/null)" = "ntfs" ] || continue
        mount -t ntfs3 -o discard "$part" /mnt/fstrim-vm103 2>/dev/null && \
            fstrim -v /mnt/fstrim-vm103 >> $LOG 2>&1 && umount /mnt/fstrim-vm103
    done
    kpartx -dv /dev/pve/vm-103-disk-1
else
    echo "[VM103] Running — skip (discard=on realtime)" >> $LOG
fi

# 3. CT 106/107/110/113 — host-side rootfs fstrim
for ct in 106 107 110 113; do
    STATUS=$(pct status "$ct" 2>/dev/null | awk '{print $2}')
    if [ "$STATUS" = "running" ]; then
        ROOTFS="/var/lib/lxc/$ct/rootfs"
        if [ -d "$ROOTFS" ]; then
            echo "[CT$ct] host fstrim $ROOTFS" >> $LOG
            fstrim -v "$ROOTFS" >> $LOG 2>&1 || echo "[CT$ct] WARN fstrim failed" >> $LOG
        else echo "[CT$ct] rootfs not mounted — skip" >> $LOG; fi
    else echo "[CT$ct] Not running — skip" >> $LOG; fi
done

# 4. LVM thin status
echo "[LVM] Pool after trim:" >> $LOG
lvs -o lv_name,lv_size,data_percent --units g pve >> $LOG
echo "=== Done $(date) ===" >> $LOG
```

### `/etc/udev/rules.d/60-ata-ncq.rules`
```
ACTION=="add|change", KERNEL=="sda", ATTR{device/queue_depth}="1"
ACTION=="add|change", KERNEL=="sdb", ATTR{device/queue_depth}="1"
ACTION=="add|change", KERNEL=="sdc", ATTR{device/queue_depth}="1"
```

### `/etc/modprobe.d/zfs.conf`
```
options zfs zfs_arc_max=4294967296
```

### `/etc/sysctl.d/99-proxmox-tune.conf`
```
vm.swappiness=10
vm.vfs_cache_pressure=50
```

### `/etc/syslog-ng/patterndb.d/synobios-noise.conf` (DSM)
```
filter f_synobios_noise {
    message("synobios get empty ttyS") or message("Invalid parameter");
};
```

### `/etc/systemd/system/zigbee2mqtt-reattach.service` (fixed v6.9 — full path `/usr/sbin/pct`)
```
[Unit]
Description=Restart Zigbee2MQTT in CT110 after CC2538 USB re-attach
After=dev-zigbee.device

[Service]
Type=oneshot
ExecStartPre=/bin/sleep 5
ExecStart=/usr/sbin/pct exec 110 -- systemctl restart zigbee2mqtt
```

---

## 📌 TRẠNG THÁI PHIÊN GẦN NHẤT (2026-06-22) — Audit 93/100 → sau remediation **98/100**

**Fix đã làm phiên này:**
1. **✅ Xác nhận backup VM100 snapshot OK** — DSM uptime 1d10h, không reboot 03:00 ngày 22/06, `sensor.proxmox_backup_status`=OK. Watch item từ v7.1 RESOLVED.
2. **Fix vzdump CT102 exclude-path** — thêm `/var/lib/nginx /var/cache/apt /var/lib/apt/lists/partial` vào `/etc/vzdump.conf` global (backup `/etc/vzdump.conf.bak-20260622`). Root cause: manual backup dùng global conf, không dùng job-level excludes trong `backup-ba3eae41-f29f`. Test manual backup sau fix: **OK** (1.1GiB, 16s, no tar errors).
3. **Dọn 2 stale_restored HA entities**: `automation.cong_tac_xiaomi_phong_ngu` + `sensor.o_cam_tuya_energy_cost_2` — đã xóa qua `ha_remove_entity`, `stale_restored=0`.

**Snapshot baseline xác nhận (2026-06-22):** Host RAM avail 10Gi · swap 2.6Gi (VM101 KVM 1.36GB, PSI=0) · 0 OOM · failed units 0 host+6CT · LVM 43.75% · ZFS ARC 4GiB · SMART 3/3 PASSED UDMA_CRC **18/65/0**, temp 38/39/33°C · NFS 54%/local 58%/lvm 43%. DSM vol 4/55/10% · mdstat UU/UUUU · NCQ sata1-4=1 · net buffer 16MB. CT đều 0 failed · cloudflared 4 conns v2026.6.1 · mariadb 470MB · Frigate GPU dri OK (healthy) · HA core 2026.6.4 healthy · 0 repairs · 0 stale_restored.

**vzdump.conf global (cập nhật):**
```
exclude-path: /var/log/nginx /var/lib/nginx /var/spool/postfix /var/lib/postfix /var/cache/apt /var/lib/apt/lists/partial
tmpdir: /var/tmp/vzdump-tmp
```

### ⏳ Watch items (monitor phiên sau)
1. **VM101 (HA) KVM swap 1.36GB** — PSI=0 hiện tại. Nếu tiếp tục tăng → xem xét tăng RAM hoặc giảm workload.
2. **Camera `phong_ngu` (.4) RTSP timeout** — sporadic i/o timeout vào 23:16/02:55/03:15/03:45. Recording vẫn OK (không có "No new valid recording segments"). Monitor tần suất.
3. **volume2 DSM 55%** — ngưỡng 80%.

### Next steps phiên sau
1. Monitor VM101 swap trend · 2. Monitor camera .4 RTSP (nếu "No new valid recording segments" xuất hiện → NFS/camera issue) · 3. (Tùy) thêm `libata.force=noncq` vào GRUB đủ 3 lớp NCQ · 4. Chạy Extended SMART selftest/đĩa · 5. **Cập nhật file này**.

---

## 📋 APPENDIX — SO SÁNH v6.9 → v7.0

| Aspect | v6.9 | v7.0 |
|--------|------|------|
| Thông tin kết nối | Lặp 3 nơi (bảng + tools + NEVER) | **1 bảng nguồn duy nhất** |
| Baseline | Rải rác khắp file | **1 bảng + bảng ngưỡng** |
| Checklist | Trùng lặp PHASE workflow | **Gộp vào PHASE, bỏ trùng** |
| Network audit | Chỉ Tailscale | **PHASE 3 đầy đủ**: NIC drop, NFS, DNS, cert |
| Backup audit | Không verify | **PHASE 6 verify backup thật chạy** |
| App-layer health | Thiếu | **Frigate/z2m/mosquitto/HA/MariaDB/PCI passthrough** |
| Memory pressure | Không có | **OOM + PSI trong PHASE 1** |
| Chấm điểm | Số đơn lẻ, không rõ cách | **Rubric tái lập + bảng ngưỡng** |
| Bài học | Tham chiếu "#1-31 unchanged" | **Gom theo nhóm, giữ #21–#32** |

**v7.0 → v7.1 (live-audit corrections):** sửa net-buffer check (host→DSM), Frigate API (`:5000`→`:8971`/docker), gỡ "synobios 03:02 benign"; ghi backup VM100=snapshot, 2 camera, mount frigate-nas, affinity 0-13, NCQ cmdline absent; +bài học wtmpdb/systemctl-parse/mosquitto-key/mode-stop.

**v7.1 → v7.2 (2026-06-22):** Fix vzdump CT102 global exclude-path (thêm `/var/lib/nginx /var/cache/apt /var/lib/apt/lists/partial` — manual backup thiếu job-level excludes); xác nhận backup VM100 snapshot hoạt động OK; dọn 2 stale_restored HA entities; baseline swap VM101=1.36GB(PSI=0); camera phong_ngu sporadic RTSP timeout ghi nhận.

> File này cần update sau mỗi phiên audit thành công: thêm bài học, cập nhật baseline/trạng thái, ghi fix đã làm.
