# SYSTEM AUDIT PROMPT — Proxmox/NAS + Home Assistant — v9.4
> **Smarthome TruyenND** · Synology DVA1622 trên Proxmox 8.x + HA OS trên VM101
> **v9.0 (2026-07-02): HỢP NHẤT** `PVE_v8.12.md` + `HA_v8.15.md` thành 1 file duy nhất. Toàn bộ bài học/baseline/quy trình giữ nguyên giá trị; changelog cũ nén ở APPENDIX.
>
> **TRẠNG THÁI MỚI NHẤT (phiên 2026-07-09, v9.4 — RE-AUDIT SẠCH, 0 finding):**
> - **PVE 100/100 · HA 100/100.** Audit đầy đủ 2 lớp (PHASE 0→7 + BATCH 1→4), 0 HIGH/MEDIUM/LOW mới — mọi baseline khớp nguyên trạng v9.3. Báo cáo đã gửi qua `telegram_bot.send_message` (chat_id cá nhân, verify log 0 lỗi, message_id 301214).
> - **PVE 98/100 → 100 sau fix (phiên 2026-07-08)** · **HA 100/100.**
> - **CT114 `nextjs-dashboard` — TẠO RỒI XÓA trong phiên (kết thúc: KHÔNG CÒN):** đầu phiên phát hiện CT114 MỚI (Ubuntu 24.04, `ha-dashboard.service` Next.js, `.115:3000`, LAN-only) thiếu backup → đã thêm vmid 114 vào weekly vzdump job (MEDIUM fix). **Sau đó Truyền XÓA hẳn CT114** (`pct destroy`). Verify dọn sạch: `114.conf` mất, LV `vm-114-disk-0` mất, 0 backup file sót (chưa từng backup), Proxmox **tự gỡ vmid 114** khỏi weekly job (nay lại `...,112,113`), 0 host unit/cron/job nhắc `nextjs/dashboard/114`. → **Trạng thái cuối: 9 LXC** (102 104 105 106 107 108 111 112 113). CT114 chiếm lại VMID openclaw cũ, nay lại trống. **Bài học:** khi destroy CT, Proxmox tự gỡ vmid khỏi backup job — không cần sửa job tay; nhưng vẫn kiểm LV + backup file + host unit sót.
> - **Host reboot 2 lần hôm nay (BENIGN):** 09:51 (kernel 6.8.12-32) → 15:28 (kernel **6.8.12-33**) = cập nhật kernel + reboot kích hoạt (từ baseline 6.8.12-30). Uptime ~6h. CT105 z2m fail start nhiều lần trong cửa sổ reboot (coordinator SLZB chưa sẵn sàng) rồi active ổn định từ 15:56:59 — giống bài học "fail start transient khi restart".
> - **open-webui update v0.9.6 → v0.10.2** (hôm nay 11:12) — healthy, HTTP 200, up 6h. Còn snapshot LXC `pre-openwebui-v0102-20260708-111220` (40G) làm rollback point → WATCH, dọn sau khi Truyền xác nhận v0.10.2 ổn định (`pct delsnapshot 111 ...`).
> - **Xác nhận recorder v9.2.1 GIỮ:** `o_cam_zigbee_20a_linkquality` ngừng ghi từ 07-07 15:58 (row cuối < mốc restart), 12300 rows đang purge. `proxmox_cpu_used` ngừng 07-02, `192_168_31_84_cpu_used` (id chết) ngừng 06-28 — đều purge đúng. 4 linkquality trong `include.entities` (`cau_thang_3/4`, `0xa4c138159e4ff542` Phòng ngủ, `0xa4c138e81699efa4`) vẫn ghi tiếp = mesh-monitor CHỦ ĐÍCH (giữ từ v9.2.1).
> - **Baseline drift (lành tính):** LVM data% đo lúc audit **61.02%** (khi còn CT114 8G + snapshot pre-openwebui 40G; sau khi xóa CT114 sẽ tụt lại ~vài %) · DSM vol2 66→**67%** vol3 41→**42%** (vẫn <70) · kernel 6.8.12-30→**33** · journal 624→**750MB** (<1GB) · automation domain baseline chỉnh **40→39** (đếm chuẩn: 23 file định nghĩa đúng 39 block, tất cả ON).
> - **Xác nhận tốt:** SMART 4 ổ khớp baseline (UDMA 18/65/0, NVMe Media Errors 0, Used 12%, temp 31–38°C), Btrfs scrub **0 errors** ×3 volume, failed units 0, Funnel chỉ CT102 + CT104 tailnet-only + 0 failed SSH, cloudflared 4 conns, Mosquitto 640, MariaDB 477MB, HA valid + 0 repairs/orphans, ping SLZB/Broadlink/ESPHome 0% loss, Zigbee bridge on, Core **2026.7.1**, backup sensor OK/3.76GB.
> - **Việc phiên sau:** (1) dọn snapshot `pre-openwebui` sau khi v0.10.2 ổn định; (2) theo dõi LVM (61%→fstrim nếu >70); (3) cập nhật DSM Update khi Truyền muốn; (4) theo dõi swap (leo lại khi VM103 chạy = benign nếu PSI=0).

---

## 🤖 CÁCH DÙNG FILE NÀY

Upload file `.md` này + nhắn **"audit"** → AI **tự chạy ngay, không hỏi xác nhận**:

1. Đọc context (kiến trúc, baseline, bài học, quyết định của Truyền)
2. `tool_search` load tool MCP (connector `Proxmox`) — xem PHASE 0
3. Chạy **PHẦN A — PVE PHASE 0→7** rồi **PHẦN B — HA BATCH 1→4** (mọi phiên audit gần đây đều chạy cả 2 lớp)
4. Báo cáo 2 lớp (2 score riêng PVE + HA) theo FORMAT BÁO CÁO + rubric
5. In error box và **fix ngay từng lỗi** HIGH→MEDIUM→LOW (trừ fix có `⚡ CẦN XÁC NHẬN`)
6. Cuối phiên: cập nhật file này (bài học mới, baseline, trạng thái, changelog) rồi lưu lên GitHub theo QUY TRÌNH LƯU FILE

**Vai trò:** Senior Linux + NAS + DevOps + Storage + Virtualization Engineer **kiêm** HA Senior Architect + Python/asyncio developer. Audit 2 lớp (Proxmox host + guest, HA config + runtime), tìm lỗi/bottleneck/rủi ro bảo mật, đề xuất fix an toàn, tự tạo script khi cần.

---

## 🔒 NGUYÊN TẮC BẤT BIẾN (đọc trước mọi thứ)

1. **KHÔNG phá dữ liệu.** Không reset RAID, format disk, xóa data user.
2. **Luôn backup trước khi sửa** — PVE/DSM: `.bak-YYYYMMDD` cạnh file gốc; HA: `/config/.mcp_backups/` (safe_write §B.5).
3. **Không chạy lệnh nguy hiểm** (`destroy`/`format`/`dd`/`mkfs`) nếu chưa backup + xác nhận.
4. **Không restart service quan trọng** khi chưa confirm — TRỪ fix an toàn đã có tiền lệ trong "Bài học".
5. **Verify sau sửa** — `bash -n` mọi script; HA: `ha core check` → reload/restart **đúng phạm vi** (ưu tiên reload hơn restart) → soi log.
6. **Không in bí mật ra báo cáo** — redact RTSP URL có user/pass, MQTT password, Telegram token/API key, `!secret` value, bearer token, cookie/session.
7. **Audit-first** — đọc hết file liên quan trước khi đề xuất fix.
8. **Không hỏi lại** khi Truyền terse — "Sửa tất cả"/"Tiếp tục"/"Ok"/"1" = duyệt, làm ngay.
9. **Báo cáo bằng tiếng Việt**; giữ tiếng Anh cho tên service, entity_id, lệnh, log trích ngắn.
10. Khi nghi ngờ → **báo cáo + đề xuất**, không tự ý hành động phá hoại.

---

## ✅ QUYẾT ĐỊNH CỦA TRUYỀN — KHÔNG FLAG LẠI

> Các mục dưới đã được Truyền xác nhận **chủ đích / chấp nhận rủi ro**. Chỉ báo lại nếu **hành vi thay đổi** so với mô tả.

| Mục | Quyết định | Nguồn |
|---|---|---|
| CT112 WireGuard active (2 peer `truyen`+`device2`, UDP 51820 port-forward) | VPN cá nhân, CHỦ ĐÍCH | 2026-06-29 |
| Frigate "không lưu trữ" | = `record:false` NHƯNG **GIỮ `snapshots:true` retain 7d** (ảnh AI). KHÔNG tắt snapshots | v7.7 |
| NCQ tắt (queue_depth=1, khóa nhiều lớp) | KHÔNG bật lại | lịch sử |
| Job vzdump thứ 3 `backup-a70339cc-f258` (sun 04:00, VM100→local, keep-last=1) | OK/chủ đích | v8.11.2 |
| Backup CT112 thủ công ngoài job (`root@pam`) | Chủ đích | v8.12.1 |
| sshd host `PermitRootLogin yes` + `PasswordAuthentication yes` | GIỮ NGUYÊN (chỉ LAN+tailnet, 0 failed login) | v8.12.1 |
| Fallback Tuya cửa cuốn `cover.cong_tac_cua_cuon_thong_minh_curtain` `unavailable` nhưng vẫn nằm trong `scripts/cuacuon_{mo,dong}.yaml` | KHÔNG SỬA — Watch/chấp nhận | v8.15.1 |
| ESPHome `bedroom` `.29` DOWN | `disabled_by: user` = tắt chủ đích, BENIGN | v8.13 |
| Funnel public duy nhất | CT102 MCP ingress. Mọi Funnel khác (đặc biệt CT104 Frigate khi auth off) = HIGH | v8.0 |

---

## ⚡ BẢNG KẾT NỐI — NGUỒN DUY NHẤT

> Đa số lỗi `Permission denied` / `Connection refused` là **sai user hoặc sai port**. SSH key-based confirmed OK cho 3 target chính (2026-06-21).

| Target | IP | Truy cập | User | Port | Ghi chú then chốt |
|---|---|---|---|---|---|
| **Proxmox host** | `192.168.31.84` | `Proxmox:pve_run` (MCP thẳng) | — | — | KHÔNG SSH — gọi tool trực tiếp |
| **DSM (NAS) VM100** | `192.168.31.116` | `Proxmox:dsm_run` / `dsm_sudo_run` | `admin` | **22** | ❌ KHÔNG `root@` — DSM chỉ cho `admin`. Sudo = NOPASSWD ALL |
| **Home Assistant VM101** | `192.168.31.111` | `Proxmox:ha_run` | `root` | **2501** | ❌ KHÔNG port 22 — phải **2501**. HTTP `:8123` |
| **mcp-server CT102** | `192.168.31.26` | `Proxmox:ct_exec ctid=102` | — | — | ❌ SSH thẳng `.26` = refused (unprivileged). Dùng `ct_exec` |
| **Frigate CT104** | `192.168.31.104` | `Proxmox:ct_exec ctid=104` | — | — | `nsenter` nếu ct_exec timeout · LIVE+AI, KHÔNG lưu recordings · Serve **tailnet-only**, `AllowFunnel` = HIGH |
| **Z2M CT105** | `192.168.31.43` | `Proxmox:ct_exec ctid=105` | — | — | zigbee2mqtt-new (thay CT110 đã xóa) · coordinator SLZB-06U `tcp://192.168.31.45:6638` |
| **Mosquitto CT106** | — | `Proxmox:ct_exec ctid=106` | — | — | `passwd`/`acl` phải `mosquitto:mosquitto 640` |
| **MariaDB CT107** | — | `Proxmox:ct_exec ctid=107` | — | — | `mysql` socket root, DB `homeassistant` |
| **9router CT108** | `192.168.31.108` | `Proxmox:ct_exec ctid=108` | — | — | 9Router AI Gateway v0.5.8 · LLM proxy OpenAI-compat `/v1` port **20128** · open-webui CT111 là client · tunnel public phải TẮT khi require-key off |
| **open-webui CT111** | `192.168.31.38` | `Proxmox:ct_exec ctid=111` | — | — | Docker `open-webui:v0.9.6` · port 3000→8080 · compose `/opt/open-webui/` · IP thật `.38` (verify 2026-07-03, tài liệu cũ ghi nhầm `.111`) |
| **WireGuard CT112** | — | `Proxmox:ct_exec ctid=112` | — | — | VPN cá nhân Truyền — CHỦ ĐÍCH |
| **cloudflared CT113** | — | `Proxmox:ct_exec ctid=113` | — | — | ready: `curl 127.0.0.1:20241/ready` → 200, conns=4 |
| **Windows VM103** | `192.168.31.19` | (thường stopped) | — | — | IP `.19` trong SSH log = **bình thường**, KHÔNG brute force |

> *CT111 IP thật = `192.168.31.38` (verified 2026-07-03; tài liệu cũ ghi nhầm `.111` trùng VM101). Docker bridge nội bộ `172.17.0.1`/`172.18.0.1`.
> Đã xóa hẳn (KHÔNG còn tồn tại, không flag): **VM105 n8n** (VMID 105 nay là CT zigbee2mqtt-new) · **CT110 z2m cũ** · **CT114 openclaw** · **CT114 nextjs-dashboard** (tạo + xóa cùng ngày 2026-07-08; VMID 114 nay trống).

**Mẫu SSH đúng (chạy bên trong `Proxmox:pve_run`):**
```bash
# DSM
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes admin@192.168.31.116 "lệnh"
# Home Assistant (port 2501!)
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes -p 2501 root@192.168.31.111 "lệnh"
```

**Quy tắc viết lệnh nested (tránh quote-hell):**
- Tránh `<<<` lồng trong `pve_run` có nested quotes → dùng `echo "cmd" | timeout N qm monitor $vmid`.
- Tránh `'` lồng nhiều cấp trong SSH-trong-pve_run → dùng `"` cho format string ngoài, hoặc tách 2 bước.
- `qm agent <vmid> exec` **không ổn định** → SSH vào VM thay thế (bài học #23).
- Lệnh chạy lâu qua MCP: `nohup ... & echo started` rồi gọi riêng `sleep N && cat logfile`.
- Inject file nhiều dòng vào CT: ghi `/tmp/` trên host → `cat file | pct exec <ctid> -- bash -c 'cat > /dest'`.

---

## 🗺️ KIẾN TRÚC HỆ THỐNG (cập nhật 2026-07-02)

```
Physical (31 GiB RAM · Xeon E5-2680 v4 · 28 vCPU)
└── Proxmox Host — PVE 8.x / kernel 6.8.12-30-pve · 192.168.31.84   ← LỚP 1
    ├── VM 100 — Synology DSM/DVA1622  192.168.31.116  10G RAM, balloon min 6144   ← LỚP 2
    ├── VM 101 — Home Assistant OS     192.168.31.111  10G RAM, balloon min 6144, discard=on
    ├── VM 103 — Windows 10            192.168.31.19   8G RAM, balloon min 4096, thường STOPPED (bật qua switch HA)
    ├── CT 102 — mcp-server            192.168.31.26   512M · mcp-server/node/nginx/tailscaled (Funnel ingress duy nhất)
    ├── CT 104 — Frigate NVR 0.17.2    192.168.31.104  4096M, swap 2048M, GPU DRI passthrough, shm 512MB · 5 camera · LIVE+AI (record:false + snapshots retain 7d)
    ├── CT 105 — zigbee2mqtt-new       192.168.31.43   Z2M 2.12.1 · SLZB-06U tcp://192.168.31.45:6638 (zstack, fw 20260310) · rootfs 8G · `enable_external_js: true` (app Zigbee Map cần) · `transmit_power: 14` (sweep 2026-07-03: 15 làm Cầu thang 4 lật route LQI 122→26; 12 và 14 ổn — chốt 14; KHÔNG tăng lên 15)
    ├── CT 106 — mqtt-broker (Mosquitto) 512M, nesting=1
    ├── CT 107 — MariaDB (recorder HA) 512M, unprivileged, swap 256M · version **10.11.14-MariaDB-0+deb12u2** (chốt 2026-07-03, KHÔNG phải 11.4)
    ├── CT 108 — 9router AI Gateway v0.5.8  192.168.31.108  LLM proxy /v1 :20128
    ├── CT 111 — open-webui v0.9.6     Docker · 3000→8080 · 2GB RAM · ANTHROPIC_API_KEY trong .env
    ├── CT 112 — WireGuard VPN cá nhân (onboot=1) · server 10.6.0.1/24 UDP 51820 · 2 peer · CHỦ ĐÍCH
    └── CT 113 — cloudflared (Debian 13) 512M, nesting=1 · native binary + systemd
```

**CT đang chạy (dùng cho mọi vòng lặp audit):** `102 104 105 106 107 108 111 112 113` (9 CT). **VM:** 100/101 running, 103 thường stopped. *(CT114 nextjs-dashboard tồn tại ngắn trong phiên 2026-07-08 rồi bị xóa — xem changelog v9.3.)*

**Disk vật lý passthrough → VM100:** sata3=ST3000VX010 3TB→`sdc` · sata4=Hitachi 4TB→`sdb` · sata5=HGST 4TB→`sda`. Host còn `nvme0n1`.

**Tailscale topology:** HOST `proxmox-pve` (100.97.18.51) = exit node + subnet router (`192.168.31.0/24`, ip_forward v4/v6=1) · CT102 = Funnel ingress thôi · CT104 = Serve tailnet-only, **KHÔNG AllowFunnel**.

**HA stack:** Core `2026.7.x` · HAOS `18.x` · Supervisor `2026.06.x` · Python `3.14.x` · DB MariaDB trên **CT107** (LXC, KHÔNG phải addon).
**Addon HA (5, trong Supervisor):** `Terminal & SSH` · `ESPHome Device Builder` · `MCP Server Dev` · `Nabu Casa Webhook Proxy` · `Studio Code Server`. Mosquitto/MariaDB/Z2M **KHÔNG** phải addon — là LXC riêng. `cloud logged_in=false` = bình thường (đi qua Tailscale + Webhook Proxy).

**Backup Proxmox (đủ 5 lớp — verify v9.1.1):** VM100 daily 02:30 `mode snapshot` → **`local`** keep-last=2 (KHÔNG phải Synology — log vzdump xác nhận đích) · weekly sun 02:00 vmid **`101,102,104,105,106,107,108,111,112,113`** → Synology keep-last=3 · job thứ 3 sun 04:00 VM100→local keep-last=1 (chủ đích) · `backup-all.sh` 02:00 ctids **`(102 104 105 106 107 108 111 113)`** (service-data → `/Synology/backups`) · **DSM Task id=8 "Copy Backhup Proxmox sang NAS" daily 06:30** (`rsync -av root@.84:/var/lib/vz/dump/ /volume2/Proxmox/dump/` — pull off-host CHỦ ĐÍCH, không prune) + **PHASE 3 trong `pve-backup-nas-side.sh` 01:00 prune chuỗi VM100 trên NAS keep-7** (thêm v9.1.1). Lưu ý: rsync pull sẽ re-copy MỌI file còn nằm ở local → muốn xóa hẳn 1 backup phải xóa Ở CẢ local lẫn NAS.

---

## 🔧 MCP TOOLS

> **PHASE 0 bắt buộc:** `tool_search` query `"Proxmox pve_run dsm_run system_overview balloon fstrim smart pve_logs dsm_logs ha_logs backup_status journal_errors security_check"` (deferred — không load = không gọi được).
> Connector `Proxmox` → `https://mcp-server.tail1105f.ts.net/merged` (aggregator trên CT102, server **v1.2.0, 17 tools infra** + tool HA WebSocket prefix `ha__*`). Mã nguồn snapshot: `mcp-server/server.js` trong repo.

### Tool infra (17)
| Tool | Target | Mô tả |
|------|--------|--------|
| `pve_run` | Host | Shell tùy ý trên host — cốt lõi mọi audit |
| `dsm_run` / `dsm_sudo_run` | DSM | Shell `admin` / root qua sudo (fstrim, docker, ghi `/etc`) |
| `ha_run` | HA VM | Shell HA (tự dùng port 2501) — đọc/ghi/grep YAML, `.storage`, Python |
| `ssh_run` | Host bất kỳ | Params `host`,`user`,`port`. ⚠️ KHÔNG dùng cho CT102 |
| `ct_exec` | LXC | Params `command`,`ctid` — CT 102/104/105/106/107/108/111/112/113 |
| `smart_check` | Host | SMART mọi disk **động qua `lsblk`, gồm NVMe** + tự so baseline |
| `balloon_status` | Host | RSS + balloon actual — danh sách VM **động từ `qm list`** |
| `fstrim_all` / `fstrim_status` | DSM+Host | Kick + poll fstrim |
| `system_overview` | Toàn hệ | 11 mục song song: RAM, per-VM RSS/balloon, LVM%, NCQ, storage, DSM df, mdstat, docker, failed units |
| `pve_logs` / `dsm_logs` / `ha_logs` | Host/DSM/HA | Log theo `service`/`source`/`level`/`grep` |
| `backup_status` | Host | Job vzdump + backup mới nhất từng guest (2 storage) + guest thiếu backup + lỗi vzdump 7d — **thay PHASE 6 thủ công** |
| `journal_errors` | Host+mọi CT | `journalctl -p err` host + TẤT CẢ CT đang chạy, param `hours` (24, max 168) |
| `security_check` | Host+mọi CT | Funnel/Serve + quét `AllowFunnel` (expected: chỉ CT102), port non-loopback, sshd policy, failed SSH login 24h |

### Tool HA (`ha__*` qua connector `Proxmox`, hoặc connector `ha` riêng)
| Việc | Tool |
|---|---|
| Overview / repairs / system_info | `ha_get_overview` |
| config_check / dead_entities | `ha_get_system_health(include="config_check,dead_entities,repairs")` |
| Log structured | `ha_get_logs(source="system"\|"error_log", level=, search=)` |
| Entity state · service · template | `ha_get_state` · `ha_call_service` · `ha_eval_template` |
| Reload / restart | `ha_reload_core(target=)` · `ha_restart(confirm=True)` |
| Automation CRUD | `ha_config_*` |

> `ha_config_get_automation`/`get_script` trả `RESOURCE_NOT_FOUND` cho item YAML-defined → đọc bằng `ha_run` (Python file ops). Xóa automation YAML-defined: gỡ file → `ha_reload_core(automations)`.
> `ha_write_file` chỉ nhận path trong `www/ themes/ custom_templates/ dashboards/` — path khác dùng Python script qua `ha_run`.
> **Fallback — connector `synology`** (khi `Proxmox` timeout): có `pve_run`, `ha_run`, `pve_disk_health`, `pve_disk_smart`, `system_info`; KHÔNG có `dsm_run` → vào DSM bằng SSH `admin@192.168.31.116:22` trong `pve_run`.

---

## 📊 BASELINE PVE & NGƯỠNG — NGUỒN DUY NHẤT

### Giá trị baseline (FROZEN — lệch là tín hiệu)
| Mục | Baseline | Ý nghĩa khi lệch |
|---|---|---|
| UDMA_CRC | sda=**18**, sdb=**65**, sdc=**0** | Tăng = lỗi cable/SATA, KHÔNG phải disk chết |
| NVMe nvme0n1 | PASSED · Used **11%** · Media Errors **0** · Spare 100% | Media Errors >0 = HIGH; Used% tăng nhanh = Watch |
| Reallocated / Pending / Uncorrectable | **0** mọi disk (host + DSM sata1-4) | >0 = HIGH |
| NCQ queue_depth | sda/sdb/sdc = **1** (tắt chủ đích, khóa udev+rc.d; `libata.force=noncq` GRUB hiện ABSENT — chấp nhận) | KHÔNG bật lại |
| ZFS ARC max | 4 GiB (`zfs_arc_max=4294967296`) — host **KHÔNG có pool** (LVM-thin), chỉ phòng hờ | KHÔNG cần zpool scrub |
| LVM thin `data%` | ~**58–61%** (v9.3; đo 61% khi còn CT114; sau xóa CT114 tụt lại; +snapshot pre-openwebui 40G; dao động theo VM103) | >60 Watch · >70 fstrim · >80 urgent |
| DSM volume1/2/3 | **4% / 67% / 42%** (v9.3; vol3 tăng dần 32→42) | ≥70 Watch · >80 action |
| DSM Btrfs scrub | **0 errors** mọi volume | >0 = HIGH (bit-rot) → check SMART + cân nhắc replace |
| mdstat DSM | `[4/26] UUUU` | Bình thường DVA1622 |
| Balloon min | VM100/101=**6144**, VM103=**4096** | Thiếu min = Watch |
| Kernel | `6.8.12-33-pve` (v9.3; 30→32→33 qua apt + reboot) | Bump minor = benign |
| journal host | ~**750MB** (v9.3; reset sau reboot) | >1GB → `journalctl --vacuum-size=500M` |
| VM101 KVM swap | **~0** (RECLAIMED v9.1.1 từ 3.44GB; tổng host swap 6.0GB→0B, quy trình bài học "Reclaim swap"). Khi VM103 chạy swap SẼ tăng dần lại — benign nếu PSI=0/0 OOM | Leo lại >2GB = Watch, >3GB → reclaim lại (quy trình đã có) hoặc tăng RAM |
| cloudflared | **4** connections, `127.0.0.1:20241/ready` = 200 | <4 = restart cloudflared. QUIC bị chặn → `--protocol http2` |
| DSM net buffer rmem/wmem | **16777216** (16MB, TRONG DSM — check `dsm_run`, KHÔNG host) | host 212992 mặc định là OK |
| Frigate | **0.17.2** healthy · `record:false` + `snapshots:true` retain 7d (mode motion) · shm **512MB** · `/dev/dri/renderD128` mounted · **CPU decode — KHÔNG bật VAAPI/QSV** (GPU=GeForce 210/nouveau, preset-vaapi làm ffmpeg crash, đã rollback v8.11.2) · storage `/opt/frigate/storage` (bind→host root) ~**392M** bounded <2GB · Serve tailnet-only | storage >2GB = retain không kick; `AllowFunnel` + auth off = HIGH |
| Camera Frigate | 5: `ngoai_troi`(AI detect,5fps), `phong_ngu`, `phong_khach`, `ban_hang`, `ban_hang_2` | RTSP timeout sporadic `ngoai_troi` (.4:554) = watchdog tự recover |
| Mosquitto CT106 | `passwd`/`acl` = `mosquitto:mosquitto 640`, test-config OK | Owner khác = MEDIUM |
| MariaDB CT107 dir | ~**474MB** (bảng `statistics` chi phối — long-term, cố ý) | >500MB dir = kiểm tra purge/exclude |
| open-webui CT111 | `v0.9.6` healthy qua compose | Thấy `:main` → `docker stop/rm open-webui && cd /opt/open-webui && docker compose up -d` |
| Z2M CT105 | **2.12.1** active, SLZB `.45` ping 0% loss | 2 lần fail start khi update = build transient, benign nếu active sau đó |
| Backup jobs | Daily VM100 02:30 snapshot (**3.76GB**, sensor HA `OK`) · weekly sun 02:00 vmid `101,102,104,105,106,107,108,111,112,113` · sun 04:00 VM100→local (chủ đích) | Thiếu CT mới = backup gap. `mode stop` = reboot DSM mỗi đêm → đổi lại snapshot |
| Public exposure matrix | Funnel: chỉ CT102 · CT104 Serve tailnet-only · CT108 tunnel public off khi require-key off | Public + no auth = HIGH |
| 2FA `root@pam` | TẮT (LOW chấp nhận — LAN+tailnet) · API token `ha-backup@pve!hatoken` (PVEAuditor) ✅ | — |
| vmbr0 RX dropped | ~1.15M = **BENIGN** (multicast snooping) | KHÔNG phải lỗi mạng |

### Bảng ngưỡng (chấm điểm tái lập được)
| Chỉ số | OK | Watch | Hành động |
|---|---|---|---|
| Host RAM available | >8 Gi (VM103 stopped) | 6–8 Gi | <6 Gi = HIGH (VM103 chạy ≈5Gi là dự kiến) |
| Host swap | <700 MB | 0.7–2 GB | >2 GB → soi từng process (PSI 0.00 + 0 OOM = chưa áp lực thật) |
| LVM `data%` | <60% | 60–70% | >70 fstrim · >80 urgent |
| DSM volume | <70% | 70–80% | >80% = HIGH |
| Disk temp | <45°C | 45–55°C | >55°C = HIGH |
| Failed systemd units | 0 | — | ≥1 = MEDIUM (điều tra) |
| UDMA_CRC | = baseline | — | tăng = HIGH (cable) |
| cloudflared conns | 4 | — | <4 = MEDIUM (restart) |
| Backup gần nhất | <26h | 26–50h | >50h = MEDIUM (kiểm tra cron) |

---

## 📊 BASELINE HA (kỳ vọng — cập nhật v8.15)

| Domain | Count / giá trị |
|---|---|
| automations (dir) | **23 file `.yaml` / 40 id, 0 dup** (v9.2 +`17_cua_cuon_suy_luan_trang_thai`; grep bắt trigger-id lồng = dương tính giả) |
| `automations.yaml` (UI) | **0 — đã xóa hẳn 2026-06-20.** Xuất hiện lại = flag (UI editor tạo dormant) |
| scripts files | **16** |
| scripts entities | **63** (16 file + 47 từ packages — bình thường, KHÔNG flag) |
| packages | **20** (19 file cũ + `claude_routine`) |
| command_line | **1 FILE** (`Proxmox.yaml` chứa 4 switch — đếm file, không đếm entity) |
| automation domain | **39**, tất cả ON (v9.3; 40→39, đếm chuẩn 23 file = 39 block) |
| sensor domain | **166** · switch **108** (sensor 163→166 v9.2; drift nhỏ sau restart = benign) |
| repairs / orphans | **0 / 0** |
| stale_restored | transient sau restart (561–979 tùy phiên) = **BENIGN, KHÔNG xóa** (mobile_app/frigate/systemmonitor/hassio/sonoff/synology_dsm/mqtt/hacs) |
| recorder | `purge_keep_days:14` · `auto_purge/repack:true` · `commit_interval:60` · exclude 12 domain + `call_service` + entities tường minh (xem §B.8.2) |
| DB | dir **474MB** · `statistics` ~110MB (long-term, KHÔNG purge 14d) · `states` ~23MB |
| df /config | ~43% |
| Zigbee | bridge `on` · 10/10 thiết bị online · SLZB `.45` 0% loss · Z-Stack fw `20260310` · LQI có thể >200 với fw mới |
| Thiết bị LAN | Broadlink `.20` UP · ESPHome `.30` UP · ESPHome `.29 bedroom` disabled_by:user (benign DOWN) |

### Kiến trúc config HA (đã verify)
```yaml
homeassistant:
  customize: !include misc/customize.yaml
  packages:  !include_dir_named packages          # 20 packages
  allowlist_external_dirs: [/config/.tmp]         # v8.10 — cần cho 10_Frigate snapshot
default_config:
frontend:
  themes: !include_dir_merge_named themes/
automation: !include_dir_merge_list automations/  # DIR-ONLY — KHÔNG include automations.yaml
script:     !include_dir_named       scripts/
template:   !include                 template.yaml
recorder:   !include                 misc/recorder.yaml
command_line: !include_dir_merge_list command_line/
```
**Key bắt buộc (không package hóa):** `homeassistant default_config ios sun ffmpeg stream wake_on_lan webhook frontend`.

**⚠️ AUTOMATION = DIR-ONLY:** `automation:` chỉ trỏ `automations/`. UI editor tự tạo lại `automations.yaml` **dormant (không load)** → mọi automation tạo qua UI là rác; **không tạo automation qua UI editor** — luôn thêm file vào `automations/`. File con KHÔNG có key `automation:` (merge_list).

**Script file format BẮT BUỘC:** file trong `scripts/` KHÔNG có top-level wrapper key (HA dùng tên file làm ID). ✅ bắt đầu bằng `alias:`/`mode:`/`sequence:`. ❌ `ten_script:` top-level → `sequence: None` → script disabled. File bắt đầu bằng comment `#` = HỢP LỆ (grep `head -1` cho false-positive).

**Packages (20):** `am_lich broadlink_mini_t1 broadlink_rm_mini4c broadlink_rm_mini_pn broadlink_rm_pro broadlink_tools claude_routine climate_aircon frigate_go2rtc_cameras helpers http_network logging mcp_tools notify proxmox_optimize sonoff timer_thiet_bi zones zigbee_network_map proxmox_backup_report`
- `climate_aircon.yaml`: SmartIR `Aircon` (code `1101`, controller `remote.rm_mini_4c_remote`, sensor `sensor.nhiet_do_bedroom`). Broadlink = 5 file riêng — KHÔNG package hóa thêm. Không package hóa thứ đã package.

---

# 🔬 PHẦN A — PVE AUDIT · PHASE 0 → 7

### PHASE 0 — Load tools
`tool_search "Proxmox pve_run dsm_run system_overview balloon fstrim smart pve_logs dsm_logs ha_logs backup_status journal_errors security_check"`

### PHASE 1 — System overview (RAM / Swap / Memory pressure)
Gọi **`system_overview`** trước (cover phần lớn). Bổ sung `pve_run`:
```bash
uptime; cat /proc/loadavg
# Swap theo process (nếu swap > 1 GiB)
for pid in $(ls /proc | grep -E '^[0-9]+$'); do
  s=$(grep -s VmSwap /proc/$pid/status | awk '{print $2}')
  [ "${s:-0}" -gt 10240 ] && echo "PID $pid ($(cat /proc/$pid/comm 2>/dev/null)): ${s} kB"
done
dmesg -T | grep -iE "oom|killed process|out of memory" | tail -10
cat /proc/pressure/memory 2>/dev/null   # PSI: some/full avg10
# Balloon actual (backup nếu balloon_status lỗi) — VM list động
for vmid in $(qm list | awk 'NR>1{print $1}'); do
  echo -n "VM $vmid: "; echo "info balloon" | timeout 3 qm monitor $vmid 2>/dev/null | grep -i balloon || echo "N/A"
done
journalctl --disk-usage
timedatectl | grep -E "synchronized|NTP"
```
**DSM (`dsm_run`):** `free -h` · `dmesg | grep -iE "NCQ|ICRC|abort|error" | tail` · synobios "unload" ngoài giờ boot = dấu vết reboot do backup `mode stop` (đã fix snapshot — thấy lại thì kiểm tra job).

### PHASE 2 — Storage & SMART & Toàn vẹn dữ liệu
Gọi **`smart_check`** (động, gồm NVMe, tự so baseline). Bổ sung:
```bash
for d in sda sdb sdc; do [ -b /dev/$d ] || continue
  echo "=== $d ==="
  smartctl -a /dev/$d | grep -E "Model|Power_On_Hours|Reallocated|Pending|Uncorrectable|UDMA_CRC|Temperature|SMART overall"
  smartctl -l selftest /dev/$d | head -4
done
# Snapshot tích tụ ăn LVM — VM list động
for v in $(qm list | awk 'NR>1{print $1}'); do qm listsnapshot $v 2>/dev/null; done
lvs -o lv_name,lv_size,data_percent --units g pve
pvesm status; mount | grep nfs; df -h /mnt/pve/Synology
ls -la /var/log/fstrim-vms-$(date +%Y%m).log && tail -20 /var/log/fstrim-vms-$(date +%Y%m).log
```
**DSM:** `df -h` (so baseline vol1/2/3) · `cat /proc/mdstat` · NCQ sata1-4 = 1.

**Btrfs scrub (`dsm_sudo_run`)** — volume DSM là Btrfs có checksum, scrub bắt **bit-rot** mà SMART không thấy (2 cơ chế bổ trợ, chạy cả hai):
```bash
for v in volume1 volume2 volume3; do echo "--- /$v ---"
  btrfs scrub status /$v | grep -iE "scrub started|total bytes|error"
done   # Kỳ vọng 0 errors mọi volume; >0 = HIGH
```
> Host KHÔNG có ZFS pool (`zpool list` empty, storage = LVM-thin) → KHÔNG cần `zpool scrub`. Toàn vẹn host = SMART + UDMA_CRC baseline + LVM data%.

### PHASE 3 — Network & connectivity
```bash
ip -s link show vmbr0        # RX dropped ~1.15M = BENIGN — KHÔNG flag
getent hosts github.com >/dev/null && echo "DNS OK" || echo "DNS FAIL"
tailscale status | head; tailscale status --json | grep -E "ExitNode|PrimaryRoutes"
sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding   # = 1
```
Gọi **`security_check`** (tự quét Funnel/Serve host + mọi CT, `AllowFunnel`, port non-loopback, sshd, failed login). Bổ sung thủ công nếu cần:
```bash
pct exec 104 -- sh -c 'tailscale funnel status; tailscale serve status --json'   # KHÔNG có AllowFunnel
pct exec 108 -- sh -c 'systemctl is-active 9router; ss -ltnp | grep 20128 || true'
pct exec 113 -- curl -s http://127.0.0.1:20241/ready   # 200, readyConnections:4
```

### PHASE 4 — Services / Containers / VMs + App-layer health
```bash
qm list; pct list
systemctl --failed --no-legend    # parse bằng --plain hoặc awk (cột ● gây nhiễu)
for ct in 102 104 105 106 107 108 111 112 113; do
  echo "=== CT$ct ==="; pct exec $ct -- systemctl --failed --no-legend 2>/dev/null
done
pct exec 104 -- ls -la /dev/dri 2>/dev/null     # GPU cho Frigate
qm config 100 | grep -E "sata|scsi|args"        # disk passthrough VM100
```
Gọi **`journal_errors`** (host + mọi CT 1 lệnh). **App-layer:**
- CT102: `systemctl is-active mcp-server tailscaled nginx` → đều active.
- CT104 Frigate: `docker ps --filter name=frigate` → `(healthy)`; `docker logs frigate 2>&1 | grep -iE "ngoai_troi|No new valid|error" | tail`.
- CT105 Z2M: `systemctl is-active zigbee2mqtt`.
- CT106 Mosquitto: is-active + `stat -c '%U:%G %a %n' /etc/mosquitto/passwd /etc/mosquitto/acl` + `mosquitto --test-config`.
- CT107 MariaDB: is-active + `du -sh /var/lib/mysql`.
- CT108 9router: is-active + port 20128.
- CT111 open-webui: `docker ps` → `(healthy)`, image `v0.9.6`.
- VM101 HA: `ha_logs level=error lines=30`.
- `balloon_status` mọi VM đang chạy.

### PHASE 5 — Performance
```bash
for d in sda sdb sdc; do
  [ -f /sys/block/$d/device/queue_depth ] && echo "$d queue_depth: $(cat /sys/block/$d/device/queue_depth)"  # = 1
  [ -f /sys/block/$d/queue/scheduler ] && echo "$d sched: $(cat /sys/block/$d/queue/scheduler)"              # mq-deadline
done
# Net buffer 16MB nằm TRONG DSM: dsm_run "sysctl net.core.rmem_max net.core.wmem_max" → 16777216
# KVM swap theo process: dùng lại vòng lặp VmSwap PHASE 1 (ngưỡng >1GB)
```

### PHASE 6 — Security & Backup verification
Gọi **`backup_status`** (job + backup mới nhất từng guest + guest thiếu backup + lỗi vzdump 7d) và **`security_check`** — 2 tool này thay phần lớn checklist thủ công. Đối chiếu thêm:
- [ ] NIC virtio, discard=on, balloon min đủ (VM100/101=6144, VM103=4096)?
- [ ] Failed units = 0? NFS online? CT112 WireGuard active = CHỦ ĐÍCH (không flag)?
- [ ] Funnel: CHỈ CT102. Frigate tailnet-only. 9router không public khi require-key off.
- [ ] SSH log IP lạ? (`.19` = VM103 bình thường). sshd host root+password = quyết định Truyền, không flag.
- [ ] Job vzdump vmid = `101,102,104,105,106,107,108,111,112,113`? `backup-all.sh` ctids = `(102 104 105 106 107 108 111 113)`?
```bash
pvesm list local | grep vzdump | tail
pvesh get /cluster/backup --output-format json | grep -E "vmid|schedule"
grep -E "CTS=|ctids=" /opt/backup-all.sh
```
**Hardening tùy chọn (không bắt buộc mỗi phiên):** Lynis (**ĐÃ cài + `lynis.timer` daily chạy `--cronjob`** — verified v9.1.1; xem report `/var/log/lynis.log` khi cần Hardening Index) · 2FA `root@pam` TOTP · **Backup RESTORE test** định kỳ quý: restore thử 1 CT nhỏ vào vmid tạm 999 rồi xóa (`pct restore 999 <file> --storage local-lvm --unprivileged 1 && pct start 999 && pct exec 999 -- uptime && pct stop 999 && pct destroy 999`) — **XÁC NHẬN với Truyền trước**, không đụng vmid đang dùng. "Backup OK" ≠ "restore được".

### PHASE 7 — Reporting & Auto-Fix
Xem **FORMAT BÁO CÁO & RUBRIC** (chung 2 lớp) ở cuối file. Sau PHASE 0→6: in summary → error box → fix ngay từng lỗi HIGH→MEDIUM→LOW.

---

# 🏠 PHẦN B — HA AUDIT · BATCH 1 → 4

> ⚠️ Tự chạy **đủ 4 Batch** rồi mới tổng kết. KHÔNG tổng kết sớm, KHÔNG hỏi "có tiếp không?".

### BATCH 1 — System Health
```
ha_run("ha core check")
ha_get_overview(fields=["system_info","repairs"])
ha_get_system_health(include="config_check,dead_entities,repairs")
ha_get_logs(source="system", level="WARNING", limit=50)
ha_get_logs(source="system", level="ERROR",   limit=50)
```
Soi: integration `setup_retry`/`error`; addon stopped; repairs mới. Repair Telegram `migrate_chat_ids...`: xem §B.8.0. **→ tự chạy Batch 2.**

### BATCH 2 — File + Storage Integrity
Chạy **script integrity toàn diện** (§B.6.3) qua `ha_run`: parse HA-tag-aware `scripts/ automations/ packages/ command_line/` + `template.yaml` + `misc/customize.yaml` + `misc/recorder.yaml`; file counts vs BASELINE HA; duplicate `id`; script wrapper/no-seq; **flag `automations.yaml` nếu xuất hiện lại**; file rác `.bak/.tmp` trong thư mục load (phải nằm `.mcp_backups/`); symlink-safe stray grep; secrets reference integrity. Bổ sung `ha_get_system_health(include="dead_entities")` → `config_entry_orphans`. **→ Batch 3.**

### BATCH 3 — Automation/Script Logic
```
ha_run("cat /config/automations/*.yaml")
ha_run("cat /config/scripts/*.yaml")
ha_get_logs(source="system", level="WARNING", limit=100)
```
Checklist: `mode: restart` + `wait_for_trigger` → NGUY HIỂM; helper không clear ở mọi nhánh thoát; guard `unavailable/unknown` sau nhánh `ha_start`; entity/`notify.*`/`script.*` không tồn tại; duplicate trigger id; time-condition overlap → double-notify; climate trigger thiếu `from: "off"` → fire mỗi ~15s; telegram_bot có `target:` (phải `chat_id:`); telegram message nhúng entity_id mà thiếu `parse_mode: plain_text` (§B.7). **→ Batch 4.**

### BATCH 4 — Infra & Storage Deep
```
pve_run(...)                      # uptime/load, storage, VM/LXC states, vzdump tasks
dsm_run(...)                      # NAS volume + SMART (smartctl -d sat /dev/sata1..4)
ha_run("df -h /config")
ct_exec ctid=107 "mysql homeassistant -N -e \"SELECT sm.entity_id,COUNT(*) c FROM states s JOIN states_meta sm ON s.metadata_id=sm.metadata_id GROUP BY sm.entity_id ORDER BY c DESC LIMIT 15\""   # chatty (§B.8.2)
ha_get_state(["sensor.proxmox_backup_status","sensor.proxmox_backup_size"])
```
Soi: recorder `Ended unfinished session` >3 lần / DB phình; chatty entity chưa exclude; ping SLZB `.45`, Broadlink `.20`, ESPHome `.30`; cert/token sắp hết (Nabu Casa · Tailscale · Tuya `sign invalid -9999999`).
**→ Sau Batch 4: in score summary + error box + fix ngay (FORMAT BÁO CÁO chung).**

---

### B.5 · SAFE_WRITE + PATCH

```python
import os, shutil
from datetime import datetime
def safe_write(path, content, backup_dir="/config/.mcp_backups"):
    os.makedirs(backup_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    if os.path.exists(path):
        shutil.copy2(path, f"{backup_dir}/{os.path.basename(path)}.{ts}.bak")
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: f.write(content)
    os.replace(tmp, path)
    return f"OK: {path}"
```
- Patch: `assert txt.count(old) == 1` **trước** `txt.replace(old, new, 1)`; grep xác nhận chuỗi trước khi replace (thụt lề/comment đuôi → 0-match).
- ⚠️ File hay thay đổi song song (Truyền sửa trực tiếp) → luôn `cat` lại ngay trước khi patch, đừng tin nội dung cũ trong context.
- Heredoc xung đột backtick/`${}` → ghi script vào `/config/www/` rồi `ha_run("python3 ...")`, dọn sau khi xong; tên output unique tránh cache `ha_read_file`.
- Backup KHÔNG để trong thư mục load (`automations/ scripts/ packages/`) — phải nằm `.mcp_backups/`.

### B.6.3 · SCRIPT INTEGRITY — SKIP set

> ❗ `yaml.safe_load` trần báo lỗi giả ở file có `!secret`/`!include*` → PHẢI dùng HALoader (`add_multi_constructor('!', _ignore)`).
> ❗ `glob`/`os.walk` đệ quy phải có **symlink guard**.

```python
SKIP = {".git",".mcp_backups","deps","tts","backups",".cloud","__pycache__",
        "esphome","yaml_backups"}
STRAY = [r"192\.168\.31\.105", r"\bn8n\b", r"aircon_sk", r"ten_thiet_bi_"]
```
- Bỏ qua `esphome/` (có `esphome/secrets.yaml` riêng) và `www/yaml_backups/` khi kiểm `!secret` — chỉ đối chiếu `/config/secrets.yaml` ở cây config chính.
- `sensor.tang_1_ten_thiet_bi_*` là ESPHome sống — STRAY `ten_thiet_bi_` chỉ nhắm ghost Tasmota không prefix.
- STRAY false-positive đã biết: label display `"105": "n8n"` trong `14_proxmox_backup_report.yaml` (Jinja map) · comment "KHÔNG qua n8n" trong `15_telegram_lenh_truc_tiep.yaml` + `packages/claude_routine.yaml`.

### B.7 · YAML PATTERNS CHUẨN

- **[Guard unavailable/unknown]** đặt SAU nhánh `ha_start` trong action, KHÔNG ở condition cấp-automation.
- **[mode: single + max_exceeded: silent]** bắt buộc cho automation/script dùng `wait_for_trigger`. `mode: restart` skip restore → helper/fan stale.
- **[Clear helper tại MỌI nhánh thoát]** — nhánh stop, nhánh tắt AC, sau `wait_for_trigger` failsafe, nhánh `ha_start`.
- **[Đọc hvac_mode khi AC off]** → `state_attr('climate.aircon','last_on_operation')`; SmartHub → `input_text.smarthub_last_mode`. `states('climate.aircon')='off'` khi tắt → KHÔNG dùng detect mode.
- **[SmartIR same-value re-emit guard]** — SmartIR silently drop `set_temperature` khi `fan_mode=night` → set `fan_mode=night` trước để reset IR cache.
- **[Mutex 2 cluster IR cùng dàn Daikin]** `09e` (`mode: single`): climate entity KHÔNG có attribute `hvac_mode` — state chính là mode. Dùng **`from: "off"`** trên cả 2 trigger; KHÔNG dùng `attribute: hvac_mode` (fire mỗi ~15s theo `current_temperature`).
- **[Z2M notify]** `08` gửi bridge offline/online (trigger dùng bản live `binary_sensor.zigbee2mqtt_bridge_connection_state_2` — bản không `_2` không có state object); `08b` cảnh báo TỪNG thiết bị (mất/có lại kết nối, LQI<12 30ph), guard bằng bridge `_2` ≠ `off`; `07` chỉ lo cửa cuốn.
- **[continue_on_error: true]** cho action chạm entity có thể tạm unavailable (Z2M/MQTT/LAN/CallMeBot).
- **[Telegram parse_mode — BÀI HỌC v8.6 + v8.15]** telegram_bot mặc định parse **Markdown**: `_` trong entity_id phá parse (`Can't parse entities`), `<>` phá parse HTML qua REST → **MỌI message nhúng entity_id/tên kỹ thuật phải khai `parse_mode: plain_text` tường minh** (Core 2026.7+ hỗ trợ). Báo cáo gửi qua REST: dùng ASCII thuần.
- **[Telegram Bot 2026.9]** `telegram_bot.send_message` dùng `chat_id:` hoặc notify entity; **KHÔNG dùng `target:`**. Repair `migrate_chat_ids...` với `action_origin: call_service` có thể đến từ runtime call, không nhất thiết do YAML (§B.8.0).
- **[shell_command]** âm thầm bỏ mọi thứ sau `&&`/`;` → tách 2 entry riêng + delay.

### B.8 · ENTITY / ORPHAN / RECORDER

- **Orphan**: `config_entry_orphans` từ system_health → gỡ. `config_entry_id: null` từ platform YAML thuần (SmartIR/template/command_line/am_lich) KHÔNG phải orphan.
- **stale_restored**: bình thường sau restart — tự populate, KHÔNG xóa trừ khi platform đã gỡ hẳn.
- **Full restart bắt buộc cho**: `command_line` switch · patch `.storage/core.config_entries` · sửa entity registry tay · package có entry mới · **đổi `recorder.yaml`** (recorder KHÔNG reload được) · **key cấp `homeassistant:`** (vd `allowlist_external_dirs`) — không có reload API.
- **REST sensor từ package**: `ha_reload_core(core)` + `rest.reload` (+ `homeassistant.update_entity`) — không cần full restart.

#### B.8.0 · Repair Telegram Bot migrate target (RESOLVED v8.1 — quy trình tái lập)
1. Grep toàn bộ `/config` + `.storage` + `blueprints` → xác nhận không nơi nào dùng `target:` (tất cả `chat_id: !secret telegram_chat_id`). `notify.telegram_call` = CallMeBot REST, không liên quan.
2. Repair chỉ kích hoạt bởi `target:` (PR HA #154868) → nếu YAML sạch, repair là tàn dư runtime call.
3. Fix flow REST lỗi ở 2026.6.x → dùng WS `repairs/ignore_issue {domain, issue_id, ignore:true}` (token ha-mcp trên CT102, KHÔNG in token, KHÔNG sửa tay `.storage`). Backup `repairs.issue_registry` vào `.mcp_backups/` trước.

#### B.8.1 · Orphan-statistics (2 hàng `statistics_meta` cùng thiết bị)
Log `Cannot rename statistic_id A → B because the new statistic_id is already in use` → 1 hàng là orphan. Xác định bên có entity live (`ha_get_state`/MQTT payload) = giữ; bên kia xóa qua MariaDB CT107 — **mysqldump backup trước**, rồi `DELETE FROM statistics / statistics_short_term WHERE metadata_id IN (...)` + `DELETE FROM statistics_meta WHERE id IN (...)`.

#### B.8.2 · Recorder DB audit — chatty entities
> Best-practice: **chặn nguồn ghi (exclude) hiệu quả hơn purge**. Bảng `statistics` (long-term, theo `state_class`) KHÔNG bị purge 14d — chiếm đa số DB; `states` purge hiệu quả.

**Đã exclude (tường minh trong `exclude.entities` của `misc/recorder.yaml`):** `sensor.zigbee2mqtt_network_map` (attr >16KB) · `sensor.cua_cuon_zigbee_moving` · `..._calibration_time` · `..._last_seen_2` · `..._lqi_raw` (v8.12) · **`sensor.proxmox_cpu_used`** (v8.15.1 — đồng thời XÓA khỏi `include.entities`) · **`sensor.o_cam_zigbee_20a_linkquality`** (v9.2.1 — chỉ cần XÓA khỏi `include.entities`, đã có glob `sensor.*_linkquality` trong exclude tự bắt; 12300 rows dư purge 14d).

**Quy trình exclude an toàn (bài học v8.15.1 — BẮT BUỘC):**
1. **Verify entity_id còn SỐNG** trước khi exclude (`ha_eval_template` search states) — `states_meta` giữ cả id lịch sử sau rename; id từ DB chatty query có thể là **id CŨ đã đổi tên** (vd `sensor.192_168_31_84_cpu_used` chết vs `sensor.proxmox_cpu_used` sống).
2. **Grep cả khối `include:`** trong `recorder.yaml` — entity có thể nằm trong `include.entities` (override khiến exclude vô hiệu/mơ hồ). Fix đúng = XÓA khỏi include + THÊM vào exclude.
3. Glob `sensor.*_last_seen`/`*_lqi` KHÔNG bắt hậu tố (`_last_seen_2`, `_lqi_raw`) → exclude tường minh.
4. Backup `recorder.yaml` → `ha core check` → **full restart** (recorder không reload) → verify entity vẫn sống + DB ngừng ghi (row cuối < mốc restart).
5. ⚠️ Exclude = quyết định bỏ history — **HỎI Truyền trước**, không tự ý.

### B.9 · KEY INTEGRATIONS & FILES

**Cụm nhiệt độ phòng ngủ** `09/09b/09c/09d/09e/09f` — `climate.aircon` (SmartIR) + `climate.ir_smart_hub_dieu_hoa_daikin` (ESPHome) = cùng 1 dàn Daikin, mutex `09e` (`from:"off"`).

**Proxmox Backup report (REST native, dir-based):**
- Token read-only `ha-backup@pve!hatoken`, role PVEAuditor(/) + `HAStorageList[Datastore.Allocate, Datastore.Audit](/storage)`. Secrets key `proxmox_api_token`.
- `sensor.proxmox_backup_status` — `tasks?typefilter=vzdump&limit=20&source=all`, scan 3600s; `sensor.proxmox_backup_size` — GB từ `storage/local/content?content=backup`, newest theo `ctime`.
- ⚠️ Template phải **LATEST-PER-GUEST DEDUP** (API newest-first; mỗi guest chỉ tính task mới nhất; bỏ task `id=""` job-level; nếu không → false-positive FAIL từ lỗi lịch sử):
```jinja2
value_template: >-
  {% set tasks = value_json.data | default([]) %}
  {% set ns = namespace(seen=[], bad=[]) %}
  {% for t in tasks %}
  {% set gid = t.id | default('') | string %}
  {% set s = t.status | default('') %}
  {% if gid and gid != 'None' and 'running' not in s and gid not in ns.seen %}
  {% set ns.seen = ns.seen + [gid] %}
  {% if s and s != 'OK' %}{% set ns.bad = ns.bad + [gid] %}{% endif %}
  {% endif %}
  {% endfor %}
  {{ 'OK' if ns.bad | length == 0 else 'FAIL: ' ~ (ns.bad | unique | join(',')) }}
```
- `automations/14_proxmox_backup_report.yaml`: 03:30 → update_entity + delay 20s + telegram (`continue_on_error`). HA 2026.6+: `as_timestamp` KHÔNG parse chuỗi unix → `(endts|int(0))|timestamp_custom('%H:%M %d/%m/%Y', true)`.

**vzdump exclude-path CT102 (unprivileged):** tar không đọc được file perms 0700 theo uid map → "job errors" giả. Fix = exclude-path ở **CẢ 2 nơi**: `/etc/vzdump.conf` (global — job-level không áp dụng cho manual CLI) + `/etc/pve/jobs.cfg` (job-level).

**Zigbee Mesh Map:** `packages/zigbee_network_map.yaml` + `scripts/zigbee_map_refresh.yaml`; sensor đã exclude recorder.

**Zigbee Map (HACS integration `dan-danache/ha-zigbee-map`, domain `zigbee_map`, panel sidebar "Zigbee Map", entry "Zigbee Panels"):** panel kết nối thẳng websocket Z2M (`ws://192.168.31.43:8099`) và inject extension JS qua `bridge/request/extension/save`.
- **Bài học 1 (2026-07-03):** Z2M 2.x mặc định `advanced.enable_external_js: false` → panel FAIL "Injecting extension into Zigbee2MQTT". Fix: đặt `true` trong `configuration.yaml` CT105 (backup `.bak-external-js`), restart z2m, verify roundtrip extension save/remove qua MQTT = ok. Bảo mật: cờ này cho phép nạp JS ngoài vào Z2M — chấp nhận vì Z2M chỉ trong LAN.
- **Bài học 2 (2026-07-03):** HA Core 2026.7.0 làm vỡ layout panel (khoảng đen trống lớn, thanh tab Map/Devices tụt xuống đáy màn hình). Fix = update integration 2.17.0 → **2.17.1** ("Fixed page rendering compatibility with Home Assistant 2026.7.0") qua HACS + restart HA Core. Nếu layout còn lỗi sau update → force-close app Companion / xoá cache frontend.

**Tham chiếu nhanh:** Frigate · SmartIR (`1101.json`) · Broadlink RM Pro (`.20`) · ESPHome (`kitchen`/`living` `.30`) · Z2M · EcoFlow RIVER 3 · Tuya (acc `mrtruyen@gmail.com`). **Notify:** `notify.facebook_truyen_text` · `telegram_bot.send_message` (`chat_id: !secret telegram_chat_id`).

### B.10 · BỎ QUA — ĐÃ XÁC NHẬN BÌNH THƯỜNG (chống false-positive)

**Network/camera:** WebRTC "Session is closed"/ICE-DTLS disconnect · `digital-ptz.js`/`video-rtc.js` uncaught (frontend browser) · Frigate HTTP→HTTPS/500 khi restart (tự hồi) · SmartThings "Connection error while subscribing" · Frigate RTSP `ngoai_troi` timeout sporadic (watchdog recover; flag nếu tần suất tăng).
**Integration transient:** Sonoff cloud partial (LAN OK) · ESPHome `.30` kitchen `Can't connect 6053` (firmware cũ) · EcoFlow MQTT single-disconnect · NUT `ERR DATA-STALE` · Broadlink timeout đơn lẻ (flag nếu lặp) · mobile_app `ID already exists - ignoring` (companion re-register, tự hết) · `Referenced entities switch.* are missing` count=1 + entity hồi = transient.
**HA normal:** scripts `..._1_lan` "Already running" (`mode:single`) · Loader WARNING boot · Z2M+MCP `auto_update=true` · recorder `Ended unfinished session` 1 lần sau restart (action nếu >3) · stale_restored tự populate · version Core/addon tự cập nhật — chênh version KHÔNG phải lỗi.
**Python 3.14:** `SyntaxWarning: 'return' in a 'finally' block` · `upnp` deprecation.
**Zigbee:** `sensor.cua_cuon_zigbee_calibration_time` template spam (TS130F không gửi field — BENIGN, do Z2M auto-create) · `Ổ cắm Xiaomi` update template fail (payload thiếu key `update`) · `UNSUP_GENERAL_COMMAND` Cầu thang 4 mỗi restart (firmware không hỗ trợ configReport) · OTA `No image currently available` · LQI: fw `20260310` có thể >200; LQI>20 = functional — KHÔNG flag LQI thấp trên SLZB-06U/CC2652P · lỗi `Failed to execute routing table` khi mesh bận sau restart = transient.
**Broadlink/thiết bị:** `infrared.rm_pro_ir_emitter`/`radio_frequency...` = `unknown` bình thường · `sensor.rm_pro_temperature = 0.0°C` (hardware artifact) · `weather.forecast_home` không tồn tại (automation dùng `weather.openweathermap`) · SmartHub AC + weather `failed_conditions` = ĐÚNG thiết kế (mutex/mùa mưa).
**PVE:** vmbr0 drops (multicast snooping) · `systemd-networkd-wait-online` timeout ~2-4/ngày ở CT (err-level noise, service active) · `wtmpdb-rotate.timer` failed sau apt upgrade Debian 13 → `reset-failed` · Mosquitto repo `NO_PUBKEY` (key GPG hết hạn, gói Debian vẫn update) · nouveau `msvld: init failed` (tàn dư test VAAPI, không tái diễn) · DSM UI "Celeron J4125" (hardcode firmware, cosmetic) · volume3 tụt ~2% sau cài lại disk · Windows VM103 RUNNING khi user bật switch HA (không tự stop — có user context).
**Đã giải quyết (không tái flag):** n8n decommission · `automations.yaml` xóa · CT110/CT114 xóa · orphan-stats `0x70b3d52b600763e8` · ghost `ten_thiet_bi_` · `www/yaml_backups` + 7 file nhạy cảm `www/` (nếu tái xuất hiện → LOW) · Telegram repair (v8.1) · Broadlink timeout (v8.3) · Ổ cắm 20A + Cầu thang 4 LQI (v8.6 sau fw SLZB) · fix cửa cuốn `05` `for:1s`+time trong DIR (v8.8) · `allowlist_external_dirs` (v8.10, đã restart) · `03_mat_dien` continue_on_error · `06_Sonoff` `value_json.action|default('')` · `08b` parse_mode plain_text (v8.15).
**Cần re-auth thủ công (không phải bug):** Tuya `sign invalid -9999999` → re-auth · EcoFlow `quanghuy_shutdown` lỗi khi pin <40% (NAS đã tắt = expected) · Tasker token hết hạn → tạo token mới trên Tasker.

---

## 📋 FORMAT BÁO CÁO & RUBRIC (chung 2 lớp)

**Rubric — bắt đầu 100 điểm, chấm riêng PVE và HA:**
- 🔴 HIGH (rủi ro data / service down / lỗ hổng bảo mật): **−5** mỗi finding
- 🔶 MEDIUM (perf suy giảm / sát ngưỡng / config drift / failed unit): **−2**
- 🟡 LOW (cosmetic / minor): **−1**
- 👁 Watch (đã biết, theo dõi, chưa hành động): **−0**
- Thang: **≥97 healthy** · 90–96 minor issues · <90 cần hành động.

**A — Score Summary (in 1 lần, gộp 2 lớp):**
```
════════════════════════════════════════════════
  📊 AUDIT  ·  PVE: XX/100 · HA: XX/100  ·  YYYY-MM-DD
════════════════════════════════════════════════
  🔴 HIGH   × N  =  −X đ      🔶 MEDIUM × N  =  −X đ
  🟡 LOW    × N  =  −X đ      👁 Watch  × N  =   0 đ
  ✅ Baseline: khớp / [danh sách lệch]
════════════════════════════════════════════════
```

**B — Error Box (lặp mỗi lỗi, theo severity):**
```
━━━ 🔴 [1/N] HIGH · [PVE|DSM|HA|CT-NNN] <tiêu đề ngắn> ━━━━━━━
  📍 Vị trí     : <host / VM / CT / file / entity / service>
  🔎 Nguyên nhân: <1 câu — WHAT went wrong + tại sao>
  ⚠️  Tác động  : <hậu quả thực tế nếu không sửa>
  🔧 Fix        : <lệnh shell / thay đổi YAML cụ thể>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
Ngay sau box → **thực thi fix** → in output verify → `→ Tiếp: [2/N]…`.
- Fix an toàn (vacuum journal, xóa file rác, sửa quyền, patch YAML + reload, xóa file www/): tự chạy.
- Fix nguy hiểm (restart service chính/HA full, fstrim chủ động, reboot, xóa data/config, sửa `.storage`): thêm `⚡ CẦN XÁC NHẬN` cuối box và dừng chờ Truyền.

**C — Kết thúc:**
```
👁  WATCH: • [item] — giá trị / xu hướng / ngưỡng
✅  BASELINE KHỚP: [mục OK quan trọng]
📋  PHIÊN SAU: [việc cần làm]
```

---

## 🎓 BÀI HỌC — GOM THEO NHÓM (áp dụng khi audit)

### Truy cập & SSH
- **#21** SSH từ `192.168.31.19` = VM103 → bình thường, KHÔNG brute force.
- **#22** SSH thẳng CT102 `.26` = refused → `ct_exec`.
- **#23** `qm agent exec` không ổn định → SSH vào VM.
- **#24** Guest agent timeout ≠ VM chết.
- DSM chỉ `admin@`:22; HA `root@`:**2501**.

### Storage / SMART / NCQ
- SMART baseline FROZEN (18/65/0); tăng = cable/interface.
- NCQ tắt chủ đích — KHÔNG bật lại.
- KHÔNG kết luận disk chết từ `dmesg` trong VM — verify từ host.
- KHÔNG kết luận LVM thin đầy khi chưa fstrim; swap cao ≠ ZFS ARC khi chưa soi process.
- **Host swap cao khi VM103 chạy (v9.1):** VM103 Windows (5.6GB) siết RAM host → host tráo page NHÀN RỖI của guest (VM101 KVM lên 3.44GB, VM100 1.03GB). Kiểm `VmSwap` từng process + PSI: **PSI memory=0.00 + 0 OOM = swap "nguội", chưa thrash → chưa áp lực thật**.
- **Quy trình RECLAIM SWAP đã verify (v9.1.1, 6.0GB→0B, 0 OOM):** (1) `systemctl stop pvestatd` — auto-balloon ghi đè target thủ công mỗi ~10s, không stop thì lệnh `balloon` vô hiệu; (2) hạ balloon VM đáp ứng nhanh (`echo "balloon N" | qm monitor <id>` — VM101/103 nhả trong ~45s; **VM100 DSM balloon driver KHÔNG nhả theo lệnh + không báo stats — đừng chờ**); (3) verify `available > swap + ~2GB`; (4) `nohup bash -c 'swapoff -a; swapon -a' > log &` (dùng `;` không `&&`; nohup vì MCP timeout 60s); (5) trả balloon về **mức pvestatd đã chọn trước đó, KHÔNG phải max** — trả max làm VM nở hết cỡ → swap lập tức quay lại (đã dính lượt 1: 0B→2.3GB, phải làm lượt 2); (6) `systemctl start pvestatd`; (7) verify: free, PSI, 0 OOM, HA/DSM HTTP 200, 12 guest running. Sau reclaim `buff/cache` bị xả (available thấp transient vài giờ — không phải lỗi).

### LXC / Containers
- **#26** `pct fstrim` trả 0B trên LVM thin → fstrim host-side `fstrim -v /var/lib/lxc/$ct/rootfs/`.
- **#31** KHÔNG thêm `discard=1` vào `/etc/pve/lxc/*.conf` → schema error, CT không start.
- **#32** systemd unit/script phải dùng `/usr/sbin/pct` (KHÔNG `/usr/bin/pct`).
- CT cần `--features nesting=1` (106/113…) — thiếu = 21+ unit fail. LXC unprivileged KHÔNG ghi được `sysctl net.core.*`.
- `zigbee2mqtt-reattach.service` fail lúc boot = race pmxcfs → unit đã thêm `After/Wants=pve-cluster.service` (v7.7).
- Sau khi xóa CT: scan **host unit/cron/timer rác** theo tên CT/app (tiền lệ `openclaw-agent.service` v8.0).
- Container start bằng `docker run` tay không gỡ được bằng compose down → `docker stop && docker rm` rồi `compose up -d`; luôn pin image version (KHÔNG `:main`).
- CT bị **thay thế** (không chỉ thêm): audit CẢ vzdump job (`pvesh`) VÀ `backup-all.sh` — 1 nơi tự cập nhật, nơi kia không (v8.7).

### Tailscale / cloudflared
- Exit node + subnet router trên HOST, KHÔNG CT102. Sau reboot Funnel re-propagate vài phút — MCP reconnect chậm là bình thường.
- Mọi Funnel mới phải có owner, lý do, auth, dòng verify trong báo cáo.
- cloudflared: QUIC bị chặn → `--protocol http2`; token trong argv (đã redact) — cân nhắc credentials-file khi harden.

### DSM / Backup
- Job vzdump VM100 `mode stop` = reboot DSM mỗi đêm → luôn `mode snapshot`.
- Docker binary DSM: `/volume2/@appstore/ContainerManager/usr/bin/docker` (cần sudo).
- Phát hiện CT mới → thêm ngay vào backup job (`pvesh set /cluster/backup/<id> --vmid`).
- Backup ≠ Restore: test-restore định kỳ (PHASE 6).
- **Backup tồn dư khi đổi storage job (v9.1):** đổi storage của job vzdump KHÔNG di chuyển/prune file cũ ở storage cũ. Job daily VM100 đổi Synology→`local` để lại 20 bản (~78GB) mồ côi ở `/Synology/dump`, không job nào prune nữa. Verify đích thật bằng **dòng `INFO: creating vzdump archive '<path>'` trong file `.log`** cạnh backup (không tin mtime thư mục). Dọn = đặt retention thủ công (CẦN XÁC NHẬN vì xóa backup). Backup CT đã xóa (110/114) cũng mồ côi tương tự.

### HA quy trình
- UI editor ghi vào `automations.yaml` **dormant** → fix "tưởng đã áp dụng" nhưng không active; luôn verify bản trong `automations/` (v8.8 — sự cố cửa cuốn).
- Recorder/`homeassistant:` key → full restart mới active; verify sau restart bằng row cuối DB < mốc restart (v8.15.1).
- Trước khi exclude recorder: verify entity sống + grep khối include (§B.8.2).
- Telegram: `parse_mode: plain_text` cho message có entity_id/`<>`; `chat_id:` không `target:`.
- Khi "lưu trữ"/"tắt hết" mơ hồ → HỎI rõ trước khi tắt feature (tiền lệ snapshots Frigate v7.7).

---

## 🚫 KHÔNG BAO GIỜ

- Kết luận disk chết từ `dmesg` trong VM · LVM đầy khi chưa fstrim · VM chết vì agent timeout · SSH `.19` là brute force · vmbr0 drops là lỗi mạng.
- Reset RAID / format / xóa data user · restart service quan trọng chưa confirm · `destroy`/`dd` không backup+confirm.
- `root@` cho DSM · port 22 cho HA · `ssh_run` vào CT102 · `qm agent exec`.
- `discard=1` vào LXC config · `pct fstrim` trong CT · `/usr/bin/pct` trong unit.
- Bật lại NCQ · deploy image `:main` · tạo automation qua UI editor · sửa tay `.storage` không backup.
- Exclude recorder entity chưa verify sống + chưa grep include + chưa hỏi Truyền.
- Flag lại các mục trong bảng **QUYẾT ĐỊNH CỦA TRUYỀN**.

---

## 📁 SCRIPTS HIỆN TẠI TRÊN HỆ THỐNG (snapshot — verify khi audit)

### `/etc/cron.weekly/fstrim-vms`
```bash
#!/bin/bash
LOG="/var/log/fstrim-vms-$(date +%Y%m).log"
echo "=== $(date) ===" >> $LOG
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes admin@192.168.31.116 \
    "nohup sudo fstrim -av > /tmp/fstrim.log 2>&1 & echo PID:\$!" >> $LOG 2>&1
for ct in 105 106 107 113; do
    fstrim -v "/var/lib/lxc/$ct/rootfs" >> $LOG 2>&1
done
lvs -o lv_name,lv_size,data_percent --units g pve >> $LOG
```
> ✅ **Verified 2026-07-03:** ctids đã đúng `105 106 107 113` (CT110 đã gỡ khỏi vòng lặp — mục stale cũ RESOLVED). Log tháng gần nhất: `fstrim-vms-202606.log` (chạy 28/06).

### `/opt/pve-backup/pve-backup-nas-side.sh` — PHASE 3 (thêm v9.1.1)
Prune chuỗi VM100 do DSM task id=8 rsync-pull về NAS (giữ 7 bản mới nhất, xóa cả `.log`/`.notes`), chạy trong cron 01:00 daily; guard `mountpoint -q`. Backup gốc: `.bak-20260703`.

### `/opt/open-webui/docker-compose.yml`
```yaml
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:v0.9.6
    container_name: open-webui
    restart: always
    ports: ["3000:8080"]
    volumes: ["open-webui:/app/backend/data"]
    env_file: [.env]
    environment:
      USE_OLLAMA_DOCKER: "false"
      SCARF_NO_ANALYTICS: "true"
      DO_NOT_TRACK: "true"
      ANONYMIZED_TELEMETRY: "false"
volumes:
  open-webui:
    external: true
```
> `.env` chứa `ANTHROPIC_API_KEY`, `WEBUI_SECRET_KEY` — KHÔNG commit.

### Config host khác
- `/etc/udev/rules.d/60-ata-ncq.rules`: `queue_depth=1` cho sda/sdb/sdc.
- `/etc/modprobe.d/zfs.conf`: `zfs_arc_max=4294967296`.
- `/etc/sysctl.d/99-proxmox-tune.conf`: `vm.swappiness=10` · `vm.vfs_cache_pressure=50`.
- `/etc/vzdump.conf`: `exclude-path: /var/log/nginx /var/lib/nginx /var/spool/postfix /var/lib/postfix /var/cache/apt /var/lib/apt/lists/partial` + `tmpdir: /var/tmp/vzdump-tmp`.

---

## 📌 QUY TRÌNH LƯU FILE (BẮT BUỘC — tự thực hiện cuối phiên)

1. Sửa nội dung file này: cập nhật header TRẠNG THÁI, baseline, bài học mới, changelog (nén 1 dòng/phiên).
2. Đổi tên: `SYSTEM_AUDIT_vN.X.md → SYSTEM_AUDIT_vN.(X+1).md`.
3. `git add` file mới + `git rm` file cũ.
4. `git commit -m "chore: update system audit prompt vN.X → vN.(X+1)"`.
5. **Push theo môi trường:**
   - Session có quyền push `main` trực tiếp: `git push origin HEAD:main`.
   - **Session Claude Code web/remote (main bị khóa):** push lên branch của session (`git push -u origin <branch>`) và **báo Truyền merge vào main** — đây là hành vi đúng của môi trường, KHÔNG phải lỗi, KHÔNG cố override.
   - Push bị từ chối vì behind: `git fetch origin && git rebase origin/main` rồi push lại.

---

## 📋 APPENDIX — CHANGELOG (nén)

| Version | Tóm tắt |
|---|---|
| **v9.4 (2026-07-09)** | **Re-audit đầy đủ 2 lớp, 0 finding mới — PVE 100/100 · HA 100/100.** Chạy lại toàn bộ PHASE 0→6 (PVE) + BATCH 1→2 trọng tâm (HA) đối chiếu baseline v9.3: SMART/UDMA khớp, Btrfs scrub 0 err ×3, 0 failed unit, backup 3 job đúng lịch/vmid + 0 lỗi vzdump 7d, security_check sạch (Funnel chỉ CT102, 0 failed SSH), 9 LXC đúng danh sách, app-layer 102/104/105/106/107/108/111/113 healthy (Z2M fail-start 15:44–15:56 07-08 = transient đã ghi nhận, tự hồi). HA: `ha core check` valid, config_check valid + 0 repairs/orphan, 23 file/39 automation entity (tất cả ON)/16 script/20 pkg/1 cmdline khớp baseline, 0 file rác, recorder exclude xác nhận vẫn ngừng ghi đúng 3 sensor chatty (proxmox_cpu_used 07-02, 192_168_31_84_cpu_used 06-28, o_cam_zigbee_20a_linkquality 07-07), `target:` trong `09_telegram_menu` xác nhận lại là false-positive (switch/climate/cover, không phải telegram_bot), `10_Frigate_Alert_Night` "mode: restart" xác nhận chỉ nằm trong comment (thực tế `single`), mutex `09e` vẫn `from:"off"`. Watch (không trừ điểm, không mới): LVM 59.29%, DSM vol2 67%, snapshot rollback `pre-openwebui` 40G, 12300 rows `o_cam_zigbee_20a` chờ purge. Drift cosmetic: `/etc/modprobe.d/zfs.conf` không còn tồn tại trên host (không có ZFS pool nên không ảnh hưởng — theo dõi, không phải hành động). Báo cáo gửi Telegram qua `telegram_bot.send_message` thành công (verify log, 0 lỗi). |
| **v9.3 (2026-07-08)** | **Audit đầy đủ 2 lớp: PVE 98/100 → 100 sau fix · HA 100/100.** MEDIUM (fixed): **CT114 `nextjs-dashboard` MỚI** (Next.js HA dashboard, `.115:3000`, onboot, unprivileged, LAN-only) không có backup → thêm vmid 114 vào weekly vzdump job. **Sau đó Truyền XÓA hẳn CT114** (`pct destroy`) → verify sạch: 114.conf/LV vm-114 mất, 0 backup sót, Proxmox tự gỡ vmid 114 khỏi job (nay lại `...,113`), 0 host unit/cron sót → trạng thái cuối **9 LXC**. Bài học: destroy CT thì Proxmox tự gỡ vmid khỏi backup job, vẫn kiểm LV+backup+unit sót. Host reboot ×2 hôm nay (kernel 6.8.12-30→32→33 + reboot kích hoạt — benign; z2m CT105 fail start transient trong cửa sổ reboot rồi ổn định). open-webui update v0.9.6→**v0.10.2** healthy (còn snapshot rollback `pre-openwebui` 40G — Watch, dọn sau). Xác nhận recorder v9.2.1 GIỮ (o_cam_zigbee_20a ngừng ghi 07-07, đang purge 12300 rows; proxmox_cpu_used/192_168_31_84_cpu_used purge đúng; 4 linkquality mesh-monitor trong include vẫn ghi = chủ đích). Sạch: SMART khớp baseline (UDMA 18/65/0, NVMe 12%/0 err), Btrfs scrub 0 err ×3, 0 failed unit, Funnel chỉ CT102, cloudflared 4 conns, Mosquitto 640, MariaDB 477M, HA valid + 0 repairs/orphans, 23 auto(39 block)/16 script/20 pkg/1 cmdline khớp, ping 0% loss, Zigbee bridge on, Core 2026.7.1. Drift: LVM 53→61% (Watch), DSM vol 4/67/42, journal 750MB, kernel 33, automation baseline 40→39. Dương tính giả loại: `10_Frigate` "mode:restart" (chỉ trong comment, thực là single); `target:` (đều là light/switch/script/button, không phải telegram_bot). |
| **v9.2.1 (2026-07-07)** | **FIX cả 2 (Truyền duyệt "1 2 ok") → PVE 100/100 · HA 100/100.** (1) Reclaim swap **7.1GB→0B**: quy trình rút gọn — available 12Gi>swap+2GB nên bỏ bước hạ/trả balloon (an toàn hơn cho guest); stop pvestatd → swapoff/swapon nohup (68s) → start pvestatd; PSI=0, 0 OOM, HA/DSM 200, available transient 5.9Gi. (2) Exclude `sensor.o_cam_zigbee_20a_linkquality`: phát hiện bị **force re-include** trong `include.entities` dù đã có glob `*_linkquality` → XÓA khỏi include (glob tự bắt), backup + full restart, verify entity sống (state=81) + DB ngừng ghi (row cuối < restart). Bài học: kiểm CẢ khối include, glob exclude vô hiệu khi entity ở include.entities. |
| **v9.2 (2026-07-07)** | **Audit đầy đủ 2 lớp: PVE 98/100 · HA 100/100** (findings, trước fix). MEDIUM: host swap leo lại **7.1GB** từ 0B DÙ VM103 stopped — PSI=0 + 0 OOM = nguội. **Xác nhận PHASE 3 retention ĐÃ chạy** (07/07 01:00). Drift: DSM vol3 32→41%, sensor 163→166, automations 22→23 (+`17_cua_cuon_suy_luan_trang_thai`), `o_cam_zigbee_20a_linkquality` 6.4k→12279 rows, addon 5→6, NVMe 11→12%. Update DSM 3→4. Sạch: SMART khớp baseline, Btrfs scrub 0 errors ×3, LVM 53.14%, 0 failed unit, backup đúng, Funnel chỉ CT102, cloudflared 4 conns, MariaDB 476MB, HA valid + 0 repairs/orphans, ping 0% loss, Core 2026.7.1. |
| **v9.1.1 (2026-07-03)** | **FIX cả 2 finding v9.1 → PVE 100/100.** (1) Reclaim swap 6.0GB→0B (quy trình 7 bước mới trong Bài học: stop pvestatd → hạ balloon 101/103 → swapoff/swapon nohup → trả balloon mức cũ KHÔNG max → start pvestatd; 0 OOM; bài học phụ: VM100 DSM balloon không nhả theo lệnh; trả max = swap quay lại ngay). (2) Backup: tìm ra DSM Task id=8 rsync-pull daily 06:30 (chủ đích, không prune) → dọn NAS dump 186G→119G + xóa gốc local (root 61%→50%) + thêm PHASE 3 retention keep-7 vào pve-backup-nas-side.sh. Chờ Truyền: xóa thêm qemu-104/108/103-cũ (~40G)? Ghi nhận: Lynis đã cài + timer daily; cập nhật snapshot fstrim-vms (đã đúng); tài liệu backup 5 lớp + bảng kết nối. |
| **v9.1 (2026-07-03)** | **Audit đầy đủ 2 lớp: PVE 97/100 · HA 100/100.** MEDIUM mới: host swap 6.0GB (VM101 KVM 3.44GB hồi quy từ 24MB) do VM103 Windows chạy siết RAM host → tráo page guest; PSI=0 + 0 OOM = chưa áp lực thật (fix reclaim/tăng RAM = CẦN XÁC NHẬN). LOW mới: 20 bản vzdump VM100 (~78GB) tồn dư `/Synology/dump` không retention (job daily nay ghi `local` — log xác nhận, không hook copy) + backup CT110/CT114 mồ côi (~0.9GB). Ghi nhận host chạy smbd/Samba 445/139 (chủ đích, `cron.daily/samba`, chỉ LAN). Resolved: `fstrim-vms` ctids ĐÃ đúng `105 106 107 113`; **CT111 IP thật `.38`** (không phải `.111`); **MariaDB CT107 `10.11.14`** (chốt). Xác nhận sạch: SMART 4 ổ khớp baseline, Btrfs scrub 0 errors, weekly/backup-all.sh ctids khớp, HA config valid + 0 repairs/orphans, 22 auto/16 script/20 pkg/1 cmdline khớp, telegram parse_mode đủ (40/46 message an toàn Markdown), 0 file rác, mọi thiết bị ping 0% loss, Core 2026.7.0/HAOS 18.1 mới nhất. Baseline drift: LVM 53.59%, DSM vol 4/66/32, sensor 163/switch 108/auto 40. |
| v9.0.1 (2026-07-03) | FIX app Zigbee Map FAIL "Injecting extension into Zigbee2MQTT": Z2M 2.x mặc định `enable_external_js: false` chặn extension ngoài → bật `true` trong CT105 `configuration.yaml` (backup `.bak-external-js`), restart z2m OK, verify extension save/remove qua MQTT = ok. Ghi chú vào §B.9 + sơ đồ CT105. Cùng phiên: sweep `transmit_power` tìm điểm cân bằng (Truyền muốn sóng phòng ngủ khỏe hơn): 15 → Cầu thang 4 lật route nối thẳng coordinator, LQI 113–127 sập còn 26–40 sau ~6ph; 9 → hồi 113–117; 12 → ổn (113); **14 → ổn 113–140 sau 15ph, CHỐT 14**. Bài học: (1) `linkquality` đo chiều thiết bị→coordinator nên tăng TX power coordinator KHÔNG đổi số LQI của thiết bị xa (Phòng ngủ `0xa4c138159e4ff542` giữ 53–76 ở mọi mức) — lợi ích chỉ ở chiều lệnh đi xuống; (2) ngưỡng lật route của Cầu thang 4 nằm giữa 14 và 15; (3) khi test nhiều restart z2m → tắt tạm 2 automation 08 (bridge alert Telegram, `for: 15s`) rồi bật lại. FIX layout panel Zigbee Map vỡ trên HA 2026.7.0 (tab bar tụt xuống đáy) → update HACS `dan-danache/ha-zigbee-map` 2.17.0→2.17.1 + restart HA Core, entry `zigbee_map` loaded. |
| **v9.0 (2026-07-02)** | **Hợp nhất PVE_v8.12 + HA_v8.15 → 1 file.** Sửa chuẩn: gộp bảng kết nối/tools/format báo cáo trùng lặp; xóa mục stale (VM105/CT110/CT114 khỏi lệnh audit, section "trạng thái v8.4" cũ, 2 marker "mới nhất" sai trong lịch sử HA, heading trùng §6.3); cập nhật baseline mới nhất (LVM 53%, DSM 4/65/31, sensor 163/switch 108, packages 20, Frigate 0.17.2, Z2M 2.12.1); đưa bài học v8.15.1 (verify entity sống + grep include trước exclude recorder) vào §B.8.2, parse_mode plain_text vào §B.7; thêm bảng QUYẾT ĐỊNH CỦA TRUYỀN; sửa quy trình push theo môi trường thực tế; nén changelog. Việc mở: fstrim-vms ctids stale, IP CT111, version MariaDB. |
| HA v8.15/.1 (2026-07-02 tối) | 98/100. FIX 08b parse_mode plain_text (×12 lỗi Telegram Markdown do `_` trong entity_id). FIX recorder exclude `sensor.proxmox_cpu_used` (2 bài học: id chết trong states_meta; entity nằm trong include.entities). Quyết định Truyền: fallback Tuya giữ nguyên (Watch), backup CT112 chủ đích, SSH giữ nguyên. |
| PVE v8.12/.1 (2026-07-02 tối) | 100/100. Z2M update 2.12.1 (2 fail start transient). Backup CT112 thủ công chủ đích. nouveau spam benign. Watch: VM103 RUNNING, LVM 53.33%, vol2 65%. |
| v8.13–v8.14.2 (2026-07-02) | HA 100→98/100 (MEDIUM fallback Tuya). Frigate 0.17.1→0.17.2, shm 512MB, VAAPI test crash → rollback (GeForce 210/nouveau — không bật lại). Baseline sensor 163/switch 108/automation 40 mới. |
| PVE v8.10–v8.11.2 (2026-07-02) | 100/100 ×2. VM105 n8n xác nhận XÓA HẲN. MCP server v1.2.0: smart_check động +NVMe, balloon/overview động, +3 tool `backup_status`/`journal_errors`/`security_check` (17 tools), secrets vào `.env`. Job vzdump thứ 3 xác nhận chủ đích. |
| v8.8–v8.9 + HA v8.12 (2026-06-29→07-02) | HA HIGH: fix cửa cuốn nằm trong `automations.yaml` dormant → port vào DIR + xóa dormant. Recorder exclude 2 sensor cover chatty (glob không bắt hậu tố). Dọn 9 file `.bak/.tmp` trong thư mục load. VM101 KVM swap 2.6GB→24MB RESOLVED. |
| HA v8.4.1–v8.7 (2026-06-28→29) | INCIDENT cửa cuốn tự mở (ghost pulse TS0001) → `for:1s` + time 05:00–22:00. INCIDENT 16 thiết bị Zigbee offline sau SMLIGHT dev7 → fix software z-stack manager. SLZB Z-Stack fw 20260310 → mesh hồi phục 10/10, LQI >200 OK. Tile card Win10. |
| v8.0–v8.7 PVE (2026-06-25→30) | HIGH Frigate Funnel public + auth off → tắt, giữ Serve tailnet-only. Stale unit openclaw. Mosquitto 640. Telegram repair ignore qua WS. backup-all.sh CT110→CT105. Lynis/2FA/restore-test bổ sung phương pháp (v7.8). |
| v7.x (2026-06-22→24) | HIGH Frigate NFS rớt → record:false + snapshots retain 7d (Truyền duyệt). CT111 pin v0.9.6. CT108 = 9Router documented. vzdump exclude-path CT102. Btrfs scrub vào PHASE 2. Rubric chấm điểm. |
| HA v45–v57 (2026-06) | n8n cleanup · automations.yaml xóa hẳn · 09e mutex `from:"off"` · backup REST dedup · orphan-stats method · LXC≠addon · §8.2 recorder audit · SKIP +esphome/yaml_backups. |

> File này cần update sau mỗi phiên audit thành công.
