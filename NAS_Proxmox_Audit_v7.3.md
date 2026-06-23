# NAS + Proxmox VM Audit & Optimization Prompt — v7.3
> Synology DVA1622 trên Proxmox 8.x · Cập nhật từ phiên 2026-06-23
> **v7.3:** Audit 2026-06-23 — score 81→83/100. Phát hiện CT108 "9router" + CT111 "open-webui" chưa có trong kiến trúc; thêm cả 2 vào backup job Sunday. Pin open-webui image sang `v0.9.6` + tạo compose file. Xác nhận vmbr0 drops=1.15M là BENIGN (multicast snooping — không phải lỗi). Xác nhận `10_Frigate_Alert_Night.yaml` đã `mode:single` từ v8. VM101 KVM swap leo 1.36→2.46GB (watch). Camera ngoai_troi RTSP crash 23:45 Jun22 (watchdog recovered). Bổ sung kiến trúc CT108/111 + script count note.
> **v7.2 (2026-06-22):** Fix vzdump CT102 global exclude-path; xác nhận backup VM100 snapshot OK; dọn 2 stale_restored HA entities; baseline swap VM101=1.36GB; camera phong_ngu RTSP timeout.
> **v7.1:** Sửa 3 lỗi prompt live audit; ghi baseline mới.
> **v7.0:** Gộp toàn bộ thông tin trùng lặp; bổ sung 3 mảng audit; thêm rubric chấm điểm.

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
| **9router CT108** | `192.168.31.108` | `Proxmox:ct_exec ctid=108` | — | — | Debian 13 · mục đích chưa rõ · không có app cụ thể |
| **open-webui CT111** | `192.168.31.111`* | `Proxmox:ct_exec ctid=111` | — | — | Docker open-webui:v0.9.6 · port 3000→8080 · compose tại `/opt/open-webui/` |

> *CT111 và HA VM101 cùng dải IP nhưng khác VMID/subnet — không xung đột.

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

## 🗺️ KIẾN TRÚC HỆ THỐNG (2026-06-23)

```
Physical (31 GiB RAM · Xeon E5-2680 v4 · 28 vCPU)
└── Proxmox Host — PVE 8.x / kernel 6.8.12-30-pve · 192.168.31.84   ← LỚP 1
    ├── VM 100 — Synology DSM/DVA1622  192.168.31.116  10G RAM, balloon min 6144     ← LỚP 2
    ├── VM 101 — Home Assistant        192.168.31.111  10G RAM, balloon min 6144, discard=on
    ├── VM 103 — Windows 10            192.168.31.19   8G RAM, balloon 4096 ✅, thường STOPPED
    ├── VM 105 — n8n (Ubuntu)          192.168.31.105  4G RAM, balloon min 2048, thường STOPPED
    ├── CT 102 — mcp-server            192.168.31.26   512M · mcp-server/node/nginx/tailscaled (Funnel ingress)
    ├── CT 104 — Frigate NVR           192.168.31.104  4096M RAM, swap 2048M, GPU passthrough DRI · 5 cameras
    ├── CT 106 — mqtt-broker (Mosquitto) 512M, nesting=1
    ├── CT 107 — mariadb 10.11.14      512M, unprivileged, swap 256M
    ├── CT 108 — 9router               192.168.31.108  Debian 13 · chưa có app chính · mục đích chưa rõ
    ├── CT 110 — zigbee2mqtt (Node.js) 512M, nesting=1
    ├── CT 111 — open-webui            Docker open-webui v0.9.6 · port 3000→8080 · 2GB RAM · ANTHROPIC_API_KEY
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
| `ct_exec` | LXC | Params `command`,`ctid`. Dùng cho CT 102/104/106/107/108/110/111/112/113 |
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
| LVM thin `data%` | ~**46%** (sau fstrim) | >70 fstrim · >80 urgent |
| DSM volume1 / volume2 / volume3 | **4% / 56% / 12%** | vol2/vol3 baseline 2026-06-23; >80 action |
| mdstat DSM | `[4/26] UUUU` | Bình thường DVA1622 |
| Balloon min | VM100/101=**6144**, VM103=**4096**, VM105=**2048** | Thiếu min = watch |
| Kernel | `6.8.12-30-pve` | Bump minor = benign |
| cloudflared tunnel | **4** connections, `/ready`=200 | <4 = restart cloudflared |
| Backup VM100 (job 03:00) | `mode snapshot` (đổi từ stop 2026-06-21) | `stop` = reboot DSM mỗi đêm → đổi lại snapshot |
| DSM net buffer (rmem/wmem) | **16777216** (16MB, trong DSM) | check bằng `dsm_run`, KHÔNG host (host=212992 mặc định OK) |
| NCQ kernel cmdline | `libata.force=noncq` **hiện ABSENT** (chỉ 2/3 lớp) | queue_depth=1 vẫn giữ qua udev+rc.d; thêm vào GRUB nếu muốn đủ 3 lớp |
| Camera Frigate | `ngoai_troi`(AI,5fps) + `phong_ngu`(5fps) + `phong_khach` + `ban_hang` + `ban_hang_2` | 5 cameras total; "No new valid recording segments" lặp = NFS volume3 rớt |
| VM101 KVM swap | **2.46GB** (2026-06-23, up từ 1.36GB) | Tăng tiếp → xem xét tăng RAM VM101 |
| vmbr0 RX dropped | ~1.15M — **BENIGN** (multicast snooping) | KHÔNG phải lỗi mạng; multicast_snooping=1 |
| open-webui image | `ghcr.io/open-webui/open-webui:v0.9.6` (pinned 2026-06-23) | `:main` = floating = nguy hiểm |
| MariaDB size | **470MB** dir, **277.66 MiB** HA estimate | >500MB dir = kiểm tra purge policy |

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
**DSM (Proxmox:dsm_run):** `free -h`; `dmesg | grep -iE "NCQ|ICRC|abort|error" | tail`; `sudo grep synobios /var/log/messages | tail -5` (chỉ "unload" lúc boot/03:02 và chỉ đến 2026-06-21 = benign; từ 06-22 trở đi không có = snapshot mode OK).

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

### PHASE 3 — Network & connectivity
```bash
# Lỗi/drop trên bridge + NIC VM
ip -s link show vmbr0   # RX dropped ~1.15M = BENIGN (multicast snooping) — KHÔNG flag là lỗi
# DNS phân giải
getent hosts github.com >/dev/null && echo "DNS OK" || echo "DNS FAIL"
# Tailscale (chạy trên HOST, KHÔNG CT102)
tailscale status 2>/dev/null | head; tailscale status --json 2>/dev/null | grep -E "ExitNode|PrimaryRoutes"
sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding   # = 1
# cloudflared tunnel (trong CT113)
pct exec 113 -- curl -s http://127.0.0.1:20241/ready   # status 200, readyConnections:4
```

### PHASE 4 — Services / Containers / VMs + App-layer health
```bash
# Tổng quan VM/CT
qm list; pct list
# Failed units mọi tầng
systemctl --failed --no-legend
for ct in 102 104 106 107 108 110 111 113; do
  echo "=== CT$ct ==="; pct exec $ct -- systemctl --failed --no-legend 2>/dev/null
done
# PCI passthrough còn sống? (Frigate phụ thuộc DRI; VM100 phụ thuộc disk passthrough)
pct exec 104 -- ls -la /dev/dri 2>/dev/null     # GPU cho Frigate
qm config 100 | grep -E "sata|scsi|args"        # disk passthrough VM100
```
**App-layer:**
- **CT102:** `pct exec 102 -- systemctl is-active mcp-server tailscaled nginx` → đều `active`.
- **CT104 Frigate:** `pct exec 104 -- sh -c 'docker ps --filter name=frigate --format "{{.Status}}"; ls /dev/dri; free -m'` → `(healthy)`, GPU OK, RAM. Camera logs: `docker logs frigate 2>&1 | grep -iE "ngoai_troi|phong_ngu|No new valid|error" | tail` → check RTSP timeout tần suất.
- **CT106 Mosquitto:** `pct exec 106 -- systemctl is-active mosquitto`.
- **CT107 MariaDB:** `pct exec 107 -- sh -c 'systemctl is-active mariadb; du -sh /var/lib/mysql'` → 0 failed, theo dõi kích thước.
- **CT108 9router:** `pct exec 108 -- sh -c 'ps aux | head; df -h /'` → xem đã có app chưa.
- **CT110 z2m:** `pct exec 110 -- systemctl is-active zigbee2mqtt`.
- **CT111 open-webui:** `pct exec 111 -- docker ps` → `(healthy)`, image phải là `v0.9.6`.
- **VM101 HA:** `ha_logs level=error lines=30` → không lỗi lặp.
- **Balloon actual** mọi VM đang chạy (`balloon_status`).

### PHASE 5 — Performance optimization
```bash
for d in sda sdb sdc; do
  [ -f /sys/block/$d/device/queue_depth ] && echo "$d queue_depth: $(cat /sys/block/$d/device/queue_depth)"  # = 1
  [ -f /sys/block/$d/queue/scheduler ] && echo "$d sched: $(cat /sys/block/$d/queue/scheduler)"
done
# Network buffer 16MB tune nằm TRONG DSM (KHÔNG ở host)
# Xác nhận qua dsm_run: sysctl net.core.rmem_max net.core.wmem_max  → phải = 16777216
# VM101 KVM swap: theo dõi PID kvm process
for pid in $(ls /proc | grep -E '^[0-9]+$'); do
  s=$(grep -s VmSwap /proc/$pid/status | awk '{print $2}')
  [ "${s:-0}" -gt 1048576 ] && echo "PID $pid ($(cat /proc/$pid/comm 2>/dev/null)): ${s} kB"
done
```

### PHASE 6 — Security & Backup verification
**Checklist bảo mật:**
- [ ] NIC virtio? (VM100/101/103/105 ✅) · discard=on mọi VM? · balloon driver bật + min config?
- [ ] ZFS ARC giới hạn 4 GiB? · Failed units = 0? · NFS online? · CT112 Wireguard stopped?
- [ ] Tailscale: HOST advertise exit + `192.168.31.0/24`? IP forwarding = 1?
- [ ] SSH log có IP lạ? (`192.168.31.19` = VM103 = bình thường — bài học #21)
- [ ] CT111 open-webui: image = `v0.9.6` (KHÔNG `:main`)? ANTHROPIC_API_KEY trong `.env` file?

**Cập nhật & backup:**
```bash
# Verify backup THỰC SỰ chạy
pvesm list local | grep vzdump | tail
ls /volume2/Proxmox/dump/ 2>/dev/null   # qua SSH DSM
journalctl -u cron --since "yesterday" | grep -iE "backup|vzdump" | tail
# Backup job vmid phải bao gồm: 101,102,104,105,106,107,108,110,111,113
pvesh get /cluster/backup/backup-ba3eae41-f29f --output-format json | grep vmid
# backup-all.sh: CT array gồm 102/104/106/107/110/113? (108/111 chưa có trong script)
grep -E "CTS=|ctids=|PHASE 5b" /opt/backup-all.sh
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
- **#32** `pct` ở **`/usr/sbin/pct`** (KHÔNG `/usr/bin/pct`) → systemd unit/script phải dùng full path.
- CT 106/110/113 cần `--features nesting=1`, thiếu = 21+ systemd unit fail.
- LXC unprivileged KHÔNG ghi được `sysctl net.core.rmem_max` → không tune UDP buffer trong CT.
- **(v7.1)** `wtmpdb-rotate.timer` failed sau `apt upgrade` Debian 13 = vô hại → `systemctl reset-failed`.
- **(v7.1)** `systemctl --failed --no-legend` vẫn in cột `●` → parse bằng `--plain` hoặc `awk '{print $2}'`.
- **(v7.1)** CT106 mosquitto: repo `repo.mosquitto.org` `NO_PUBKEY 61611AE430993623` = key GPG hết hạn; gói Debian vẫn update bình thường.
- **(v7.2)** vzdump CT102: `exclude-path` job-level KHÔNG áp dụng khi manual CLI — chỉ global `/etc/vzdump.conf`. Fix: thêm cả 2 nơi.
- **(v7.3)** CT108/CT111 mới: **luôn thêm vào backup job khi phát hiện CT mới**. `pvesh set /cluster/backup/<id> --vmid "..."`. Hiện vmid: `101,102,104,105,106,107,108,110,111,113`.
- **(v7.3)** open-webui CT111: image `:main` = floating → tạo compose + pin version. Compose tại `/opt/open-webui/docker-compose.yml`; key trong `/opt/open-webui/.env`.

### Tailscale / Network / cloudflared
- Exit node + subnet router **trên HOST** `proxmox-pve` (100.97.18.51), KHÔNG CT102.
- Sau reboot, Funnel re-propagate mất vài phút → MCP reconnect chậm là **bình thường**.
- cloudflared: **QUIC bị chặn** → phải `--protocol http2`.
- Health check cloudflared: `http://127.0.0.1:20241/ready` → `status:200, readyConnections:4`.
- **(v7.3)** **vmbr0 RX dropped ~1.15M = BENIGN** — multicast_snooping=1 prune packets không có listener trong MDB. KHÔNG phải lỗi network. KHÔNG cần fix.

### n8n (VM105)
- Image **pin** `n8nio/n8n:2.25.7` trong `/opt/n8n/docker-compose.yml`.

### Home Assistant (VM101)
- `shell_command` **âm thầm bỏ mọi thứ sau `&&` hoặc `;`** → tách thành 2 entry riêng + delay giữa chúng.

### DSM (VM100)
- DSM UI hiện "Celeron J4125" = hardcode firmware, **chỉ cosmetic**.
- Docker binary: `/volume2/@appstore/ContainerManager/usr/bin/docker` (cần `sudo`/`dsm_sudo_run`).
- **(v7.1 SỬA):** "synobios unload 03:02 daily" = dấu vết DSM bị reboot do job backup `mode stop`. Đã fix sang `mode snapshot`. Nếu thấy lại → kiểm tra job vzdump.

### Backup
- Full VM snapshot + config backup (37MB, daily 2AM) bổ trợ nhau.
- `backup-all.sh` phủ CT 102/104/106/107/110/112/113; PHASE 5b backup mosquitto/mysqldump/z2m/cloudflared.
- **⚠️ backup-all.sh ctids=(102 104 106 107 110 113) chưa bao gồm CT108/111** — thêm thủ công nếu cần service data backup.
- **(v7.1)** Job vzdump VM100 `mode stop` = tắt VM → reboot DSM. Đổi sang `mode snapshot`.

### Camera / Frigate
- **(v7.3)** Camera `ngoai_troi` RTSP timeout sporadic → 192.168.31.4:554 (Hikvision). Watchdog auto-restart ffmpeg trong ~10s. Nếu tần suất tăng → check RTSP stream stability từ camera hoặc `input_stream_args` trong Frigate config.
- Frigate hiện có **5 cameras**: ngoai_troi, phong_ngu, phong_khach, ban_hang, ban_hang_2.

---

## 🚫 KHÔNG BAO GIỜ
- Kết luận disk chết chỉ từ `dmesg` trong VM (verify từ host).
- Kết luận LVM thin đầy khi chưa fstrim · swap cao = ZFS ARC khi chưa soi process.
- Kết luận VM chết chỉ vì guest agent timeout (#24).
- Coi SSH từ `192.168.31.19` là brute force (#21 — đó là VM103).
- Coi vmbr0 dropped packets là lỗi mạng — đây là BENIGN multicast snooping.
- Reset RAID / format disk / xóa data user.
- Restart service quan trọng chưa confirm · chạy `destroy`/`format`/`dd` không backup+confirm.
- Dùng `root@` cho DSM hoặc port 22 cho HA.
- `ssh_run` vào CT102 (#22 — dùng `ct_exec`) · `qm agent exec` để chạy lệnh trong VM (#23 — dùng SSH).
- Thêm `discard=1` vào LXC config (#31) · dùng `pct fstrim`/fstrim trong CT (#26 — dùng host-side rootfs).
- Gọi `/usr/bin/pct` trong systemd unit (#32 — dùng `/usr/sbin/pct`).
- Bật lại NCQ (đã khóa 3 lớp có chủ đích).
- Deploy open-webui với image tag `:main` — luôn pin version cụ thể.

---

## 📁 SCRIPTS HIỆN TẠI TRÊN HỆ THỐNG

### `/etc/cron.weekly/fstrim-vms` (cập nhật 2026-06-20)
```bash
#!/bin/bash
LOG="/var/log/fstrim-vms-$(date +%Y%m).log"
echo "=== $(date) ===" >> $LOG
# 1. DSM VM100 (Btrfs) — qua SSH
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes admin@192.168.31.116 \
    "nohup sudo fstrim -av > /tmp/fstrim.log 2>&1 & echo PID:\$!" >> $LOG 2>&1
# 2. VM103 Windows (nếu stopped) — disk-1 NTFS
# 3. CT 106/107/110/113 — host-side rootfs fstrim
for ct in 106 107 110 113; do
    fstrim -v "/var/lib/lxc/$ct/rootfs" >> $LOG 2>&1
done
# 4. LVM thin status
lvs -o lv_name,lv_size,data_percent --units g pve >> $LOG
```

### `/opt/open-webui/docker-compose.yml` (tạo 2026-06-23)
```yaml
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:v0.9.6
    container_name: open-webui
    restart: always
    ports:
      - "3000:8080"
    volumes:
      - open-webui:/app/backend/data
    env_file:
      - .env
    environment:
      USE_OLLAMA_DOCKER: "false"
      SCARF_NO_ANALYTICS: "true"
      DO_NOT_TRACK: "true"
      ANONYMIZED_TELEMETRY: "false"
volumes:
  open-webui:
    external: true
```
> `.env` tại `/opt/open-webui/.env` — chứa `ANTHROPIC_API_KEY` và `WEBUI_SECRET_KEY`. KHÔNG commit.

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

### `/etc/vzdump.conf` (global, cập nhật 2026-06-22)
```
exclude-path: /var/log/nginx /var/lib/nginx /var/spool/postfix /var/lib/postfix /var/cache/apt /var/lib/apt/lists/partial
tmpdir: /var/tmp/vzdump-tmp
```

---

## 📌 TRẠNG THÁI PHIÊN GẦN NHẤT (2026-06-23) — Audit 81/100 → sau fix **83/100**

**Fix đã làm phiên này:**
1. **✅ Fix [3]: Thêm CT108 + CT111 vào backup job Sunday** — `pvesh set /cluster/backup/backup-ba3eae41-f29f --vmid "101,102,104,105,106,107,108,110,111,113"`. Xác nhận OK.
2. **✅ Fix [4]: Pin open-webui image** — Tạo `/opt/open-webui/docker-compose.yml` với `image: v0.9.6`; tag local image `sha256:7f1b0a1a50cf` → `v0.9.6`; tạo `.env` template. **Cần làm thêm:** điền `ANTHROPIC_API_KEY` + `WEBUI_SECRET_KEY` vào `.env`; next restart dùng compose.
3. **✅ Fix [5]: vmbr0 drops = BENIGN** — Điều tra xác nhận: multicast_snooping=1, ebtables/nftables = không có rule, 10 MDB entries temp (mDNS/SSDP/UPnP). Drops là multicast pruning bình thường. Hạ từ MEDIUM → INFO.
4. **✅ Fix [2]: Đã done từ v8 (2026-06-10)** — `10_Frigate_Alert_Night.yaml` đang `mode:single` + `max_exceeded:silent` đúng rồi.

**Snapshot baseline xác nhận (2026-06-23 08:11):**
Host RAM avail 5.3Gi (VM103 đang chạy) · swap 4.0Gi (VM101 KVM=2.46GB, pvedaemon workers) · PSI avg300=0.16 (thấp) · 0 OOM · load 4.64/4.16/3.07 · failed units 0 host+0 CT · LVM 52.97% · ZFS ARC 4GiB · SMART 3/3 PASSED UDMA_CRC 18/65/0 · temp 38/39/33°C · NFS 55%/local 57%/lvm 52%. DSM vol 4/56/12% · mdstat UUUU · NCQ sata1-4=1 · net buffer 16MB. CT tất cả active · cloudflared 4 conns · MariaDB 470MB · Frigate (healthy) 5 cameras · HA 2026.6.4 healthy · 0 repairs · 0 stale_restored.

### ⏳ Watch items (monitor phiên sau)
1. **VM103 Windows đang RUNNING** — nếu không dùng thì `qm stop 103` để giải phóng RAM.
2. **VM101 (HA) KVM swap 2.46GB** — tăng từ 1.36GB. Nếu >3GB → tăng RAM VM101 lên 12GB.
3. **Camera `ngoai_troi` RTSP timeout** — sporadic crash 23:45 Jun22. Watchdog recovered. Monitor tần suất.
4. **LVM data% 52.97%** — ngưỡng action 70%. fstrim tuần tới.
5. **CT111 open-webui** `.env` cần điền key; `WEBUI_SECRET_KEY` hiện rỗng (security risk).
6. **backup-all.sh** ctids chưa có CT108/111 — service data backup chưa phủ 2 CT mới.
7. **CT108 "9router"** — chưa rõ mục đích. Làm rõ hoặc remove.

### Next steps phiên sau
1. Stop VM103 nếu không dùng (giải phóng ~5.7GB RAM)
2. Điền `ANTHROPIC_API_KEY` + `WEBUI_SECRET_KEY` vào `/opt/open-webui/.env` CT111
3. Monitor VM101 swap trend
4. Monitor camera ngoai_troi RTSP crash frequency
5. Thêm CT108/111 vào `backup-all.sh` ctids nếu có service data cần backup
6. Làm rõ mục đích CT108 "9router"
7. (Tùy) thêm `libata.force=noncq` vào GRUB đủ 3 lớp NCQ
8. **Cập nhật file này** sau phiên tiếp theo

---

## 📋 APPENDIX — CHANGELOG

| Version | Thay đổi chính |
|---|---|
| v7.3 | +CT108/111 kiến trúc; backup job +108/111; pin open-webui v0.9.6; vmbr0 drops=BENIGN; VM101 swap baseline 2.46GB; 5 cameras |
| v7.2 | Fix vzdump CT102 exclude-path; snapshot backup OK; dọn stale_restored; baseline swap VM101=1.36GB |
| v7.1 | Sửa net-buffer/Frigate API/synobios; +bài học wtmpdb/parse/mosquitto-key/mode-stop |
| v7.0 | Tái cấu trúc: 1 bảng nguồn; +PHASE 3 Network; +PHASE 6 Backup verify; +app-layer health; rubric chấm điểm |

> File này cần update sau mỗi phiên audit thành công.
