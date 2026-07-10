# SYSTEM AUDIT PROMPT — Proxmox/NAS + Home Assistant — v9.4
> **Smarthome TruyenND** · Synology DVA1622 trên Proxmox 8.x + HA OS trên VM101
> **v9.0 (2026-07-02): HỢP NHẤT** `PVE_v8.12.md` + `HA_v8.15.md` thành 1 file duy nhất. Toàn bộ bài học/baseline/quy trình giữ nguyên giá trị; changelog cũ nén ở APPENDIX.
>
> **TRẠNG THÁI MỚI NHẤT (phiên 2026-07-09, v9.4 — SAU FIX):**
> - **PVE 97/100 → 99/100 sau fix · HA 99/100 → 100/100 sau fix.**
> - **Snapshot rollback open-webui `pre-openwebui-v0102-20260708-111220` (40G) ĐÃ XÓA:** v0.10.2 xác nhận healthy ổn định 27h → đủ điều kiện dọn theo kế hoạch phiên trước. Verify: `pct delsnapshot 111 ...` OK, `pct listsnapshot 111` chỉ còn "current", LVM data% 59.91%→**59.61%**. open-webui vẫn healthy sau xóa.
> - **Addon HA mới lạ "Advanced SSH & Web Terminal" v24.0.1 (state=stopped) — Truyền tự gỡ trong phiên.** Verify: không còn trong danh sách addon Supervisor. **Addon HA quay lại đúng 5 addon baseline** (Terminal & SSH · ESPHome Device Builder · MCP Server Dev · Nabu Casa Webhook Proxy · Studio Code Server).
> - **MCP tool tổng hợp (`system_overview`/`smart_check`/`balloon_status`/`backup_status`/`journal_errors`/`security_check`) KHÔNG load được qua `tool_search` trong phiên này** — server hiện tại chỉ expose tool nguyên thủy (`pve_run`/`dsm_run`/`dsm_sudo_run`/`ha_run`/`ct_exec`/`ssh_run`/`pve_logs`/`dsm_logs`/`ha__ha_get_*`...). Toàn bộ PHASE 0-6 + BATCH 1-4 đã chạy bằng lệnh shell thủ công tương đương. **Cần xác nhận với Truyền: các tool aggregator có bị gỡ khỏi mcp-server CT102 không, hay chỉ là vấn đề load/tool_search phiên này** — nếu bị gỡ hẳn, cần cập nhật §MCP TOOLS cho đúng thực tế (KHÔNG giả định vẫn tồn tại ở phiên sau).
> - **SSH host: cụm 4 lỗi `kex_exchange_identification: read: Connection reset by peer` lúc 13:39:11 07-09 (LOW/Watch):** khối lượng nhỏ, không kèm `Failed password`, không khớp brute-force pattern đã biết. Theo dõi tiếp; không hành động.
> - **VM101 (HA) KVM swap tăng lại 745MB dù VM103 đang STOPPED (Watch):** lệch khỏi trạng thái "reclaimed ~0" (baseline v9.1.1). PSI memory=0.00/0.00 + 0 OOM → chưa áp lực thật, CHƯA cần reclaim lại. Theo dõi; nếu leo >2GB → áp dụng lại quy trình reclaim 7 bước đã có (§Bài học).
> - **Baseline drift (lành tính):** LVM data% 59.91%→**59.61%** (sau xóa snapshot) · DSM vol 4/67/**44%** (vol3 42→44, vẫn <70) · host swap 2.5GB lúc đầu phiên (PSI=0, giải thích: CT111 python3 uvicorn 467MB + VM101 kvm 745MB + nhiều tiến trình Frigate nhỏ cộng dồn — KHÔNG phải 1 nguồn lớn duy nhất) · kernel giữ 6.8.12-33 (uptime 1 ngày 3h, không reboot thêm) · journal ~758MB (<1GB) · sensor/switch/automation domain **166/108/39** khớp baseline tuyệt đối.
> - **Xác nhận tốt:** SMART 3 ổ khớp baseline (UDMA 18/65/0, Reallocated/Pending/Uncorrectable=0), NVMe Used 12%/Media Errors 0/Spare 100%, Btrfs scrub **0 errors** ×3 volume, 0 failed unit (host + 9 CT), 0 SSH failed password, Funnel chỉ CT102, Frigate tailnet-only healthy 27h, cloudflared 4 conns, Mosquitto 640, MariaDB 480MB/10.11.14, backup daily VM100 OK (3.77GB), weekly + job thứ 3 + backup-all.sh ctids khớp, HA config valid + 0 repairs + 0 WARNING/ERROR mới, 0 config_entry_orphans (10 stale_restored Frigate = benign transient), Zigbee bridge on, ping SLZB/.20/.30/.23 = 0% loss, recorder exclude/include đúng (proxmox_cpu_used + o_cam_zigbee_20a_linkquality vẫn exclude đúng, chưa bị force re-include), Core **2026.7.1**.
> - **Việc phiên sau:** (1) xác nhận lại tool aggregator MCP (system_overview/smart_check/...) còn tồn tại trên CT102 hay không, cập nhật §MCP TOOLS cho khớp thực tế; (2) theo dõi VM101 KVM swap (>2GB → reclaim); (3) theo dõi cụm lỗi SSH kex (tăng tần suất → cân nhắc fail2ban); (4) Tuya `mrtruyen@gmail.com` re-auth khi Truyền rảnh; (5) theo dõi LVM (~59.6%, sẽ tiếp tục fstrim tự nhiên).

---

## 🤖 CÁCH DÙNG FILE NÀY

Upload file `.md` này + nhắn **"audit"** → AI **tự chạy ngay, không hỏi xác nhận**:

1. Đọc context (kiến trúc, baseline, bài học, quyết định của Truyền)
2. `tool_search` load tool MCP (connector `Proxmox`) — xem PHASE 0. **Nếu tool aggregator (system_overview/smart_check/backup_status/journal_errors/security_check) không load được, dùng lệnh shell thủ công tương đương qua `pve_run`/`dsm_run`/`ha_run`/`ct_exec` theo đúng nội dung từng PHASE — KHÔNG bỏ qua bước audit.**
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
| **open-webui CT111** | `192.168.31.38` | `Proxmox:ct_exec ctid=111` | — | — | Docker `open-webui:v0.10.2` (update 08/07, snapshot rollback đã xóa 09/07) · port 3000→8080 · compose `/opt/open-webui/` · IP thật `.38` |
| **WireGuard CT112** | — | `Proxmox:ct_exec ctid=112` | — | — | VPN cá nhân Truyền — CHỦ ĐÍCH |
| **cloudflared CT113** | — | `Proxmox:ct_exec ctid=113` | — | — | ready: `curl 127.0.0.1:20241/ready` → 200, conns=4 |
| **Windows VM103** | `192.168.31.19` | (thường stopped) | — | — | IP `.19` trong SSH log = **bình thường**, KHÔNG brute force |

> Đã xóa hẳn (KHÔNG còn tồn tại, không flag): **VM105 n8n** · **CT110 z2m cũ** · **CT114 openclaw** · **CT114 nextjs-dashboard** (tạo+xóa cùng ngày 2026-07-08).

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
- **Python3 KHÔNG có trên HAOS host shell** — dùng `grep -hoE`/`awk`/heredoc thay cho parse YAML/JSON phức tạp trong `ha_run`. Đếm automation id: pattern đúng là `id:` **thụt lề, KHÔNG có dấu `-` phía trước** (format `- alias: ...\n  id: ...`); pattern `^- id:` sẽ ra 0 hoặc sai; pattern `^\s*id:` (bất kỳ thụt lề) sẽ đếm luôn id lồng trong condition/action/choose → dương tính giả cao (v9.4: 94 match thay vì 39) — dùng domain_stats từ `ha_get_overview` làm nguồn đếm automation chuẩn thay vì grep.

---

## 🗺️ KIẾN TRÚC HỆ THỐNG (cập nhật 2026-07-02)

```
Physical (31 GiB RAM · Xeon E5-2680 v4 · 28 vCPU)
└── Proxmox Host — PVE 8.x / kernel 6.8.12-33-pve · 192.168.31.84   ← LỚP 1
    ├── VM 100 — Synology DSM/DVA1622  192.168.31.116  10G RAM, balloon min 6144   ← LỚP 2
    ├── VM 101 — Home Assistant OS     192.168.31.111  10G RAM, balloon min 6144, discard=on
    ├── VM 103 — Windows 10            192.168.31.19   8G RAM, balloon min 4096, thường STOPPED (bật qua switch HA)
    ├── CT 102 — mcp-server            192.168.31.26   512M · mcp-server/node/nginx/tailscaled (Funnel ingress duy nhất)
    ├── CT 104 — Frigate NVR 0.17.2    192.168.31.104  4096M, swap 2048M, GPU DRI passthrough, shm 512MB · 5 camera · LIVE+AI (record:false + snapshots retain 7d)
    ├── CT 105 — zigbee2mqtt-new       192.168.31.43   Z2M 2.12.1 · SLZB-06U tcp://192.168.31.45:6638 (zstack, fw 20260310) · rootfs 8G · transmit_power: 14 (chốt)
    ├── CT 106 — mqtt-broker (Mosquitto) 512M, nesting=1
    ├── CT 107 — MariaDB (recorder HA) 512M, unprivileged, swap 256M · version **10.11.14-MariaDB-0+deb12u2**
    ├── CT 108 — 9router AI Gateway v0.5.8  192.168.31.108  LLM proxy /v1 :20128
    ├── CT 111 — open-webui v0.10.2    Docker · 3000→8080 · 2GB RAM · ANTHROPIC_API_KEY trong .env
    ├── CT 112 — WireGuard VPN cá nhân (onboot=1) · server 10.6.0.1/24 UDP 51820 · 2 peer · CHỦ ĐÍCH
    └── CT 113 — cloudflared (Debian 13) 512M, nesting=1 · native binary + systemd
```

**CT đang chạy (dùng cho mọi vòng lặp audit):** `102 104 105 106 107 108 111 112 113` (9 CT). **VM:** 100/101 running, 103 thường stopped.

**Disk vật lý passthrough → VM100:** sata3=ST3000VX010 3TB→`sdc` · sata4=Hitachi 4TB→`sdb` · sata5=HGST 4TB→`sda`. Host còn `nvme0n1`.

**Tailscale topology:** HOST `proxmox-pve` (100.97.18.51) = exit node + subnet router (`192.168.31.0/24`, ip_forward v4/v6=1) · CT102 = Funnel ingress thôi · CT104 = Serve tailnet-only, **KHÔNG AllowFunnel**.

**HA stack:** Core `2026.7.1` · HAOS `18.1` · Supervisor `2026.06.2` · Python `3.14.6` · DB MariaDB trên **CT107** (LXC, KHÔNG phải addon).
**Addon HA (5, trong Supervisor):** `Terminal & SSH` · `ESPHome Device Builder` · `MCP Server Dev` · `Nabu Casa Webhook Proxy` · `Studio Code Server`. Mosquitto/MariaDB/Z2M **KHÔNG** phải addon — là LXC riêng. `cloud logged_in=false` = bình thường (đi qua Tailscale + Webhook Proxy). *(v9.4: addon lạ "Advanced SSH & Web Terminal" xuất hiện rồi bị Truyền tự gỡ trong cùng phiên — nếu tái xuất hiện, xác nhận chủ đích trước khi flag.)*

**Backup Proxmox (đủ 5 lớp):** VM100 daily 02:30 `mode snapshot` → **`local`** keep-last=2 · weekly sun 02:00 vmid **`101,102,104,105,106,107,108,111,112,113`** → Synology keep-last=3 · job thứ 3 sun 04:00 VM100→local keep-last=1 (chủ đích) · `backup-all.sh` 02:00 ctids **`(102 104 105 106 107 108 111 113)`** → `/Synology/backups` · DSM Task id=8 rsync-pull daily 06:30 (không prune) + PHASE 3 trong `pve-backup-nas-side.sh` 01:00 prune keep-7. Lưu ý: rsync pull re-copy mọi file còn ở local → muốn xóa hẳn 1 backup phải xóa Ở CẢ local lẫn NAS.

---

## 🔧 MCP TOOLS

> **PHASE 0 bắt buộc:** `tool_search` query `"Proxmox pve_run dsm_run system_overview balloon fstrim smart pve_logs dsm_logs ha_logs backup_status journal_errors security_check"`.
> ⚠️ **v9.4:** Trong phiên 2026-07-09, `tool_search` (nhiều lần, nhiều query khác nhau) chỉ trả về tool nguyên thủy: `pve_run`, `dsm_run`, `dsm_sudo_run`, `ha_run`, `ct_exec`, `ssh_run`, `pve_logs`, `dsm_logs`, và toàn bộ `ha__ha_*`. **KHÔNG** thấy `system_overview`, `smart_check`, `balloon_status`, `fstrim_all/status`, `backup_status`, `journal_errors`, `security_check` (17 tools infra như v8.11 mô tả). Chưa rõ là do mcp-server CT102 đã downgrade/đổi version, hay do tool_search phiên này chưa index hết. **Phiên sau cần xác nhận trực tiếp với Truyền hoặc check version server** (`ct_exec ctid=102 "cat /opt/mcp-server/package.json | grep version"` hoặc tương tự) trước khi quyết định xóa hẳn phần dưới đây khỏi tài liệu.
> Connector `Proxmox` → `https://mcp-server.tail1105f.ts.net/merged`. Mã nguồn snapshot: `mcp-server/server.js` trong repo.

### Tool infra đã xác nhận còn hoạt động (v9.4)
| Tool | Target | Mô tả |
|------|--------|--------|
| `pve_run` | Host | Shell tùy ý trên host |
| `dsm_run` / `dsm_sudo_run` | DSM | Shell `admin` / root qua sudo |
| `ha_run` | HA VM | Shell HA (port 2501) |
| `ssh_run` | Host bất kỳ | Params `host`,`user`,`port` |
| `ct_exec` | LXC | Params `command`,`ctid` |
| `pve_logs` / `dsm_logs` | Host/DSM | Log theo `service`/`grep`/`lines` |

### Tool infra CHƯA XÁC NHẬN còn tồn tại (v8.11 era — cần verify phiên sau)
`smart_check` · `balloon_status` · `fstrim_all` / `fstrim_status` · `system_overview` · `backup_status` · `journal_errors` · `security_check` — nếu không load được, **dùng lệnh shell thủ công tương đương** (xem PHASE 1-6 bên dưới, đã viết đủ để không phụ thuộc các tool này).

### Tool HA (`ha__*` qua connector `Proxmox`, hoặc connector `ha` riêng)
| Việc | Tool |
|---|---|
| Overview / repairs / system_info | `ha_get_overview` |
| config_check / dead_entities | `ha_get_system_health(include="config_check,dead_entities,repairs")` |
| Log structured | `ha_get_logs(source="system"\|"error_log", level=, search=)` |
| Entity state · service · template | `ha_get_state` · `ha_call_service` · `ha_eval_template` |
| Reload / restart | `ha_reload_core(target=)` · `ha_restart(confirm=True)` |
| Automation CRUD | `ha_config_*` |
| Domain counts (sensor/switch/automation...) | `ha_get_overview(fields=["domain_stats"])` — **nguồn đếm chuẩn**, ưu tiên hơn grep YAML thô |

> `ha_config_get_automation`/`get_script` trả `RESOURCE_NOT_FOUND` cho item YAML-defined → đọc bằng `ha_run` (Python file ops — LƯU Ý: KHÔNG có python3 trên HAOS host, dùng grep/awk/jq hoặc ghi script Python rồi copy qua `www/` chạy qua `shell_command`).
> `ha_write_file` chỉ nhận path trong `www/ themes/ custom_templates/ dashboards/` — path khác dùng `ha_config_set_yaml` (đã có 2-step confirm) hoặc Python script qua `ha_run`.
> **Fallback — connector `synology`** (khi `Proxmox` timeout): có `pve_run`, `ha_run`, `pve_disk_health`, `pve_disk_smart`, `system_info`; KHÔNG có `dsm_run` → vào DSM bằng SSH `admin@192.168.31.116:22` trong `pve_run`.

---

## 📊 BASELINE PVE & NGƯỠNG — NGUỒN DUY NHẤT

### Giá trị baseline (FROZEN — lệch là tín hiệu)
| Mục | Baseline | Ý nghĩa khi lệch |
|---|---|---|
| UDMA_CRC | sda=**18**, sdb=**65**, sdc=**0** | Tăng = lỗi cable/SATA, KHÔNG phải disk chết |
| NVMe nvme0n1 | PASSED · Used **12%** · Media Errors **0** · Spare 100% | Media Errors >0 = HIGH; Used% tăng nhanh = Watch |
| Reallocated / Pending / Uncorrectable | **0** mọi disk (host + DSM sata1-4) | >0 = HIGH |
| NCQ queue_depth | sda/sdb/sdc = **1** (tắt chủ đích) | KHÔNG bật lại |
| ZFS ARC max | 4 GiB — host **KHÔNG có pool** (LVM-thin), chỉ phòng hờ | KHÔNG cần zpool scrub |
| LVM thin `data%` | **~59.6%** (v9.4, sau xóa snapshot pre-openwebui) | >60 Watch · >70 fstrim · >80 urgent |
| DSM volume1/2/3 | **4% / 67% / 44%** (v9.4; vol3 tăng dần 32→44) | ≥70 Watch · >80 action |
| DSM Btrfs scrub | **0 errors** mọi volume | >0 = HIGH (bit-rot) |
| mdstat DSM | RAID1 arrays `[U]` mọi md, `md0/md1` dạng `[4/26]` partial expected cho DVA1622 | Bình thường |
| Balloon min | VM100/101=**6144**, VM103=**4096** | Thiếu min = Watch |
| Kernel | `6.8.12-33-pve` | Bump minor = benign |
| journal host | ~**758MB** | >1GB → `journalctl --vacuum-size=500M` |
| VM101 KVM swap | **745MB** (v9.4 — TĂNG LẠI dù VM103 stopped, PSI=0/0 OOM = chưa áp lực thật; baseline trước "reclaimed ~0" KHÔNG còn đúng — theo dõi, reclaim lại nếu >2GB) | Leo lại >2GB = Watch, >3GB → reclaim (quy trình đã có) |
| cloudflared | **4** connections, `127.0.0.1:20241/ready` = 200 | <4 = restart cloudflared |
| Frigate | **0.17.2** healthy · `record:false` + `snapshots:true` retain 7d · shm 512MB · CPU decode (KHÔNG VAAPI/QSV) | storage >2GB = retain không kick |
| Camera Frigate | 5: `ngoai_troi`(AI detect,5fps), `phong_ngu`, `phong_khach`, `ban_hang`, `ban_hang_2` | RTSP timeout sporadic = watchdog tự recover |
| Mosquitto CT106 | `passwd`/`acl` = `mosquitto:mosquitto 640` | Owner khác = MEDIUM |
| MariaDB CT107 dir | ~**480MB** | >500MB dir = kiểm tra purge/exclude |
| open-webui CT111 | `v0.10.2` healthy qua compose (update 08/07, snapshot rollback đã xóa 09/07) | Thấy `:main` → sửa compose |
| Z2M CT105 | **2.12.1** active, SLZB `.45` ping 0% loss | fail start khi update = transient, benign |
| SSH host | 0 failed password 24h; cụm 4 lỗi `kex_exchange_identification` 09/07 13:39 = LOW/Watch, chưa rõ nguồn | Tăng tần suất → fail2ban |
| Backup jobs | Daily VM100 02:30 snapshot (3.77GB, sensor OK) · weekly sun 02:00 vmid `101,102,104,105,106,107,108,111,112,113` · sun 04:00 VM100→local | Thiếu CT mới = backup gap |
| Public exposure matrix | Funnel: chỉ CT102 · CT104 Serve tailnet-only · CT108 tunnel public off khi require-key off | Public + no auth = HIGH |
| 2FA `root@pam` | TẮT (LOW chấp nhận) · API token `ha-backup@pve!hatoken` (PVEAuditor) ✅ | — |
| vmbr0 RX dropped | ~220K–1.15M tùy chu kỳ đếm = **BENIGN** (multicast snooping) | KHÔNG phải lỗi mạng |

### Bảng ngưỡng (chấm điểm tái lập được)
| Chỉ số | OK | Watch | Hành động |
|---|---|---|---|
| Host RAM available | >8 Gi (VM103 stopped) | 6–8 Gi | <6 Gi = HIGH |
| Host swap | <700 MB | 0.7–2 GB | >2 GB → soi từng process (PSI 0.00 + 0 OOM = chưa áp lực thật) |
| LVM `data%` | <60% | 60–70% | >70 fstrim · >80 urgent |
| DSM volume | <70% | 70–80% | >80% = HIGH |
| Disk temp | <45°C | 45–55°C | >55°C = HIGH |
| Failed systemd units | 0 | — | ≥1 = MEDIUM |
| UDMA_CRC | = baseline | — | tăng = HIGH (cable) |
| cloudflared conns | 4 | — | <4 = MEDIUM (restart) |
| Backup gần nhất | <26h | 26–50h | >50h = MEDIUM |

---

## 📊 BASELINE HA (kỳ vọng — cập nhật v9.4)

| Domain | Count / giá trị |
|---|---|
| automations (dir) | **23 file `.yaml` / 39 automation entity (ON)** — đếm chuẩn qua `ha_get_overview(domain_stats)`, KHÔNG dùng grep `id:` thô (dương tính giả cao do id lồng trong condition/action) |
| `automations.yaml` (UI) | **0 — đã xóa hẳn.** Xuất hiện lại = flag |
| scripts files | **16** |
| scripts entities | **63** |
| packages | **20** |
| command_line | **1 FILE** (`Proxmox.yaml` chứa 4 switch) |
| automation domain | **39**, tất cả ON |
| sensor domain | **166** · switch **108** |
| repairs / orphans | **0 / 0** (1 dismissed — bình thường) |
| stale_restored | 10 item (v9.4, toàn bộ Frigate `image.*`/`binary_sensor.*_occupancy`) = **BENIGN, transient sau restart, KHÔNG xóa** |
| recorder | `purge_keep_days:14` · `auto_purge/repack:true` · `commit_interval:60` · exclude 12+ domain + `call_service` + entities tường minh (§B.8.2) |
| DB | dir **480MB** · engine mysql 10.11.14 · estimated size ~289MB (system_health) |
| df /config | ~43% (bám theo `/addon_configs` 43%) |
| Zigbee | bridge `on` · SLZB `.45` 0% loss · Z-Stack fw `20260310` |
| Thiết bị LAN | Broadlink `.20` UP · ESPHome `.30` UP · ESPHome `.23` (ir-smart-hub) UP · ESPHome `.29 bedroom` disabled_by:user (benign DOWN) |
| Addon Supervisor | **5** (baseline, xem §KIẾN TRÚC) — v9.4: addon lạ "Advanced SSH & Web Terminal" xuất hiện+gỡ cùng phiên |

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

**⚠️ AUTOMATION = DIR-ONLY:** `automation:` chỉ trỏ `automations/`. UI editor tự tạo lại `automations.yaml` **dormant (không load)** → mọi automation tạo qua UI là rác; **không tạo automation qua UI editor**. File con KHÔNG có key `automation:` (merge_list).

**Format thực tế 1 automation block (xác nhận v9.4):**
```yaml
- alias: Tên automation
  id: unique_id_khong_dau
  mode: single
  max_exceeded: silent
  trigger: [...]
  condition: [...]
  action: [...]
```
`id:` nằm thụt lề 2 cấp, KHÔNG có dấu `-` phía trước — grep phải dùng `^\s+id:` (không phải `^- id:`), và kết quả vẫn lẫn id lồng trong action/choose nên KHÔNG dùng để đếm tổng — dùng `ha_get_overview(domain_stats)` thay thế.

**Script file format BẮT BUỘC:** file trong `scripts/` KHÔNG có top-level wrapper key. ✅ bắt đầu bằng `alias:`/`mode:`/`sequence:`/`#`. ❌ `ten_script:` top-level → `sequence: None` → script disabled.

**Packages (20):** `am_lich broadlink_mini_t1 broadlink_rm_mini4c broadlink_rm_mini_pn broadlink_rm_pro broadlink_tools claude_routine climate_aircon frigate_go2rtc_cameras helpers http_network logging mcp_tools notify proxmox_optimize sonoff timer_thiet_bi zones zigbee_network_map proxmox_backup_report`

---

# 🔬 PHẦN A — PVE AUDIT · PHASE 0 → 7

### PHASE 0 — Load tools
`tool_search "Proxmox pve_run dsm_run system_overview balloon fstrim smart pve_logs dsm_logs ha_logs backup_status journal_errors security_check"`
**Nếu tool aggregator không load** (như v9.4): chuyển sang lệnh shell thủ công trong từng PHASE bên dưới — KHÔNG bỏ qua, KHÔNG báo "thiếu tool" rồi dừng.

### PHASE 1 — System overview (RAM / Swap / Memory pressure)
```bash
uptime; cat /proc/loadavg; uname -r; free -h
dmesg -T | grep -iE "oom|killed process|out of memory" | tail -10
cat /proc/pressure/memory 2>/dev/null
timedatectl | grep -E "synchronized|NTP"
qm list; pct list
journalctl --disk-usage
# Swap theo process (nếu swap > 1 GiB)
for pid in $(ls /proc | grep -E '^[0-9]+$'); do
  s=$(grep -s VmSwap /proc/$pid/status | awk '{print $2}')
  [ "${s:-0}" -gt 10240 ] && echo "PID $pid ($(cat /proc/$pid/comm 2>/dev/null)): ${s} kB"
done
# Xác định process thuộc CT nào (nếu swap cao bất thường)
cat /proc/<PID>/cgroup | head -1   # /lxc/<ctid>/... nếu trong container
# Balloon actual — VM list động
for vmid in $(qm list | awk 'NR>1{print $1}'); do
  echo -n "VM $vmid: "; echo "info balloon" | timeout 3 qm monitor $vmid 2>/dev/null | grep -i balloon || echo "N/A"
done
```
**DSM (`dsm_run`):** `free -h` · `dmesg | grep -iE "NCQ|ICRC|abort|error" | tail`.

### PHASE 2 — Storage & SMART & Toàn vẹn dữ liệu
```bash
for d in sda sdb sdc; do [ -b /dev/$d ] || continue
  echo "=== $d ==="
  smartctl -a /dev/$d | grep -E "Model|Power_On_Hours|Reallocated|Pending|Uncorrectable|UDMA_CRC|Temperature_Celsius|SMART overall"
done
smartctl -a /dev/nvme0n1 | grep -E "Model|Percentage Used|Media and Data|Available Spare|Temperature:|Critical Warning"
for v in $(qm list | awk 'NR>1{print $1}'); do qm listsnapshot $v 2>/dev/null; done
lvs -o lv_name,lv_size,data_percent --units g pve
pvesm status; mount | grep nfs; df -h /mnt/pve/Synology
ls -la /var/log/fstrim-vms-$(date +%Y%m).log && tail -20 /var/log/fstrim-vms-$(date +%Y%m).log
```
**DSM:** `df -h | grep volume` · `cat /proc/mdstat` · NCQ sata1-4 = 1 (`dsm_sudo_run: for i in 1 2 3 4; do cat /sys/block/sata$i/device/queue_depth; done`).

**Btrfs scrub (`dsm_sudo_run`):**
```bash
for v in volume1 volume2 volume3; do echo "--- /$v ---"
  btrfs scrub status /$v | grep -iE "scrub started|total bytes|error"
done
```

### PHASE 3 — Network & connectivity
```bash
ip -s link show vmbr0        # RX dropped = BENIGN — KHÔNG flag
tailscale status --json | grep -E "ExitNode|PrimaryRoutes"
sysctl net.ipv4.ip_forward net.ipv6.conf.all.forwarding   # = 1
systemctl --failed --no-legend
journalctl -u ssh --since "24 hours ago" | grep -iE "failed|kex_exchange" | tail -10
ss -tn state established '( dport = :22 or sport = :22 )'
```
```bash
# Trên từng CT (qua ct_exec):
tailscale funnel status; tailscale serve status --json   # CT102 = Funnel on; CT104 = tailnet-only, KHÔNG AllowFunnel
```

### PHASE 4 — Services / Containers / VMs + App-layer health
```bash
qm list; pct list
systemctl --failed --no-legend
for ct in 102 104 105 106 107 108 111 112 113; do
  echo "=== CT$ct ==="; pct exec $ct -- systemctl --failed --no-legend 2>/dev/null
done
journalctl -p err --since "24 hours ago" --no-pager | tail -30
```
**App-layer (qua `ct_exec`):**
- CT102: `systemctl is-active mcp-server tailscaled nginx`
- CT104: `docker ps --filter name=frigate` → healthy; `docker logs frigate --since 24h | grep -iE "ngoai_troi|error"`
- CT105: `systemctl is-active zigbee2mqtt`; `ping -c3 192.168.31.45`
- CT106: is-active + `stat -c '%U:%G %a %n' /etc/mosquitto/passwd /etc/mosquitto/acl`
- CT107: is-active + `du -sh /var/lib/mysql`
- CT108: is-active + `ss -ltnp | grep 20128`
- CT111: `docker ps --filter name=open-webui` → healthy, version
- CT113: `curl -s http://127.0.0.1:20241/ready`
- VM101 HA: `ha_get_logs(level="ERROR"/"WARNING", source="system")`

### PHASE 5 — Performance
```bash
for d in sda sdb sdc; do
  [ -f /sys/block/$d/device/queue_depth ] && echo "$d queue_depth: $(cat /sys/block/$d/device/queue_depth)"
  [ -f /sys/block/$d/queue/scheduler ] && echo "$d sched: $(cat /sys/block/$d/queue/scheduler)"
done
```

### PHASE 6 — Security & Backup verification
```bash
pvesm list local | grep vzdump | tail
pvesh get /cluster/backup --output-format json
grep -E "CTS=|ctids=" /opt/backup-all.sh
tail -10 $(ls -t /var/log/vzdump/*.log | head -1)
```
Đối chiếu: NIC virtio, discard=on, balloon min đủ; Failed units = 0; Funnel chỉ CT102; job vzdump vmid + backup-all.sh ctids khớp baseline.
**Hardening tùy chọn (không bắt buộc mỗi phiên):** Lynis daily timer · 2FA TOTP · Backup RESTORE test định kỳ quý (xác nhận Truyền trước).

### PHASE 7 — Reporting & Auto-Fix
Xem **FORMAT BÁO CÁO & RUBRIC** ở cuối file.

---

# 🏠 PHẦN B — HA AUDIT · BATCH 1 → 4

> ⚠️ Tự chạy **đủ 4 Batch** rồi mới tổng kết. KHÔNG tổng kết sớm, KHÔNG hỏi "có tiếp không?".

### BATCH 1 — System Health
```
ha_run("ha core check")   # hoặc ha_get_system_health(include="config_check")
ha_get_overview(fields=["system_info","repairs","notifications"])
ha_get_system_health(include="config_check,dead_entities,repairs")
ha_get_logs(source="system", level="WARNING", limit=50)
ha_get_logs(source="system", level="ERROR",   limit=50)
```
Soi: integration `setup_retry`/`error`; addon stopped/mới lạ (đối chiếu 5 addon baseline); repairs mới. **→ tự chạy Batch 2.**

### BATCH 2 — File + Storage Integrity
```
ha_run("ls automations/*.yaml scripts/*.yaml packages/*.yaml command_line/*.yaml | wc -l")  # đối chiếu 23/16/20/1
ha_get_overview(fields=["domain_stats"])   # đối chiếu sensor 166/switch 108/automation 39 — NGUỒN ĐẾM CHUẨN
ha_run("ls -la /config/automations.yaml 2>/dev/null || echo OK - not present")   # flag nếu tồn tại
ha_run("find /config/automations /config/scripts /config/packages /config/command_line -name '*.bak' -o -name '*.tmp'")
```
File rác/duplicate id/symlink lạ → xem §B.6.3. **→ Batch 3.**

### BATCH 3 — Automation/Script Logic
```
ha_run("cat /config/automations/*.yaml")
ha_run("cat /config/scripts/*.yaml")
ha_get_logs(source="system", level="WARNING", limit=100)
```
Checklist: `mode: restart` + `wait_for_trigger` → NGUY HIỂM; helper không clear ở mọi nhánh thoát; guard `unavailable/unknown` sau nhánh `ha_start`; entity/`notify.*`/`script.*` không tồn tại; duplicate trigger id; climate trigger thiếu `from: "off"`; telegram_bot có `target:` (phải `chat_id:`); telegram message nhúng entity_id mà thiếu `parse_mode: plain_text` (§B.7). **→ Batch 4.**

### BATCH 4 — Infra & Storage Deep
```
pve_run(...) / dsm_run(...) / ha_run("df -h")
ct_exec ctid=107 "mysql homeassistant -N -e \"SELECT sm.entity_id,COUNT(*) c FROM states s JOIN states_meta sm ON s.metadata_id=sm.metadata_id GROUP BY sm.entity_id ORDER BY c DESC LIMIT 15\""
ha_get_state(["sensor.proxmox_backup_status","sensor.proxmox_backup_size","binary_sensor.zigbee2mqtt_bridge_connection_state_2"])
ha_run("ping -c2 -W1 <ip>")  # SLZB .45, Broadlink .20, ESPHome .30/.23
```
Soi: recorder `Ended unfinished session` >3 lần; chatty entity chưa exclude; cert/token sắp hết (Nabu Casa · Tailscale · Tuya `sign invalid -9999999`).
**→ Sau Batch 4: in score summary + error box + fix ngay.**

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
- Patch: `assert txt.count(old) == 1` **trước** `txt.replace(old, new, 1)`.
- ⚠️ File hay thay đổi song song → luôn `cat` lại ngay trước khi patch.
- Backup KHÔNG để trong thư mục load (`automations/ scripts/ packages/`) — phải nằm `.mcp_backups/`.
- **Ưu tiên dùng `ha_config_set_yaml`/`ha_config_set_automation`/`ha_config_set_script` (2-step confirm có sẵn) thay vì tự viết Python script qua `ha_run` khi có thể** — an toàn hơn, có diff preview tự động.

### B.6.3 · SCRIPT INTEGRITY — SKIP set

```python
SKIP = {".git",".mcp_backups","deps","tts","backups",".cloud","__pycache__",
        "esphome","yaml_backups"}
STRAY = [r"192\.168\.31\.105", r"\bn8n\b", r"aircon_sk", r"ten_thiet_bi_"]
```
- Bỏ qua `esphome/` và `www/yaml_backups/` khi kiểm `!secret`.
- STRAY false-positive đã biết: label `"105": "n8n"` trong `14_proxmox_backup_report.yaml` (Jinja map) · comment "KHÔNG qua n8n" trong `15_telegram_lenh_truc_tiep.yaml` + `packages/claude_routine.yaml`.

### B.7 · YAML PATTERNS CHUẨN

- **[Guard unavailable/unknown]** đặt SAU nhánh `ha_start` trong action.
- **[mode: single + max_exceeded: silent]** bắt buộc cho automation/script dùng `wait_for_trigger`.
- **[Clear helper tại MỌI nhánh thoát]**.
- **[Đọc hvac_mode khi AC off]** → `state_attr('climate.aircon','last_on_operation')`; SmartHub → `input_text.smarthub_last_mode`.
- **[SmartIR same-value re-emit guard]** — set `fan_mode=night` trước để reset IR cache.
- **[Mutex 2 cluster IR cùng dàn Daikin]** `09e` dùng `from: "off"` trên cả 2 trigger.
- **[Z2M notify]** `08` bridge offline/online, `08b` từng thiết bị, `07` chỉ lo cửa cuốn.
- **[continue_on_error: true]** cho action chạm entity có thể tạm unavailable.
- **[Telegram parse_mode]** MỌI message nhúng entity_id/tên kỹ thuật → `parse_mode: plain_text` tường minh.
- **[Telegram Bot]** dùng `chat_id:`, KHÔNG `target:`.
- **[shell_command]** tách 2 entry riêng thay vì `&&`/`;`.

### B.8 · ENTITY / ORPHAN / RECORDER

- **Orphan**: `config_entry_orphans` từ system_health → gỡ. `config_entry_id: null` từ platform YAML thuần KHÔNG phải orphan.
- **stale_restored**: bình thường sau restart, KHÔNG xóa trừ khi platform đã gỡ hẳn.
- **Full restart bắt buộc cho**: `command_line` switch · patch `.storage/core.config_entries` · sửa entity registry tay · package có entry mới · đổi `recorder.yaml` · key cấp `homeassistant:`.

#### B.8.2 · Recorder DB audit — chatty entities
**Đã exclude:** `sensor.zigbee2mqtt_network_map` · `sensor.cua_cuon_zigbee_moving` · `..._calibration_time` · `..._last_seen_2` · `..._lqi_raw` · `sensor.proxmox_cpu_used` · glob `sensor.*_linkquality` (bắt cả `o_cam_zigbee_20a_linkquality`, `cau_thang_3/4`, `0xa4c138...` — verify v9.4: KHÔNG bị force re-include lại trong `include.entities`).

**Quy trình exclude an toàn (BẮT BUỘC):**
1. Verify entity_id còn SỐNG trước khi exclude.
2. Grep cả khối `include:` trong `recorder.yaml` — entity có thể nằm trong `include.entities` (override).
3. Glob KHÔNG bắt hậu tố lạ → exclude tường minh nếu cần.
4. Backup → `ha core check` → **full restart** → verify entity sống + DB ngừng ghi.
5. ⚠️ Exclude = quyết định bỏ history — **HỎI Truyền trước**.

### B.9 · KEY INTEGRATIONS & FILES

**Cụm nhiệt độ phòng ngủ** `09/09b/09c/09d/09e/09f` — `climate.aircon` (SmartIR) + `climate.ir_smart_hub_dieu_hoa_daikin` (ESPHome), mutex `09e` (`from:"off"`).

**Proxmox Backup report:** token `ha-backup@pve!hatoken` (PVEAuditor). Template LATEST-PER-GUEST DEDUP (xem v9.0 changelog cho code mẫu jinja).

**vzdump exclude-path CT102:** exclude ở CẢ `/etc/vzdump.conf` + `/etc/pve/jobs.cfg`.

**Zigbee Map (HACS `dan-danache/ha-zigbee-map`):** `enable_external_js: true` bắt buộc trên Z2M CT105; integration ≥2.17.1 cho tương thích HA 2026.7+.

**Notify:** `notify.facebook_truyen_text` · `telegram_bot.send_message` (`chat_id: !secret telegram_chat_id`).

### B.10 · BỎ QUA — ĐÃ XÁC NHẬN BÌNH THƯỜNG (chống false-positive)

**Network/camera:** WebRTC "Session is closed" · Frigate HTTP→HTTPS/500 khi restart · Frigate RTSP `ngoai_troi` timeout sporadic (watchdog recover).
**Integration transient:** Sonoff cloud partial (LAN OK) · ESPHome `.30` `Can't connect 6053` (fw cũ) · mobile_app `ID already exists`.
**HA normal:** scripts `mode:single` "Already running" · Loader WARNING boot · recorder `Ended unfinished session` 1 lần sau restart · stale_restored tự populate.
**Zigbee:** `sensor.cua_cuon_zigbee_calibration_time` template spam (BENIGN) · `UNSUP_GENERAL_COMMAND` Cầu thang 4 mỗi restart · LQI>20 = functional.
**Broadlink/thiết bị:** `infrared.*`/`radio_frequency...` = `unknown` bình thường · `sensor.rm_pro_temperature = 0.0°C` (hardware artifact).
**PVE:** vmbr0 drops (multicast snooping) · `systemd-networkd-wait-online` timeout ~2-4/ngày ở CT · Mosquitto repo `NO_PUBKEY` · nouveau `msvld: init failed` (tàn dư, không tái diễn) · Windows VM103 RUNNING khi user bật switch HA (có user context).
**SSH:** cụm nhỏ (≤5 sự kiện/24h) `kex_exchange_identification`/`Connection reset by peer` không kèm `Failed password` = LOW/Watch, không phải brute-force (xem v9.4).
**Đã giải quyết (không tái flag):** n8n decommission · `automations.yaml` xóa · CT110/CT114 xóa · Telegram repair (v8.1) · Broadlink timeout (v8.3) · fix cửa cuốn `05` (v8.8) · `allowlist_external_dirs` (v8.10) · `08b` parse_mode plain_text (v8.15) · snapshot pre-openwebui đã xóa (v9.4) · addon "Advanced SSH & Web Terminal" đã gỡ (v9.4).
**Cần re-auth thủ công (không phải bug):** Tuya `sign invalid -9999999` → re-auth · EcoFlow `quanghuy_shutdown` lỗi khi pin <40% (expected) · Tasker token hết hạn.

---

## 📋 FORMAT BÁO CÁO & RUBRIC (chung 2 lớp)

**Rubric — bắt đầu 100 điểm, chấm riêng PVE và HA:**
- 🔴 HIGH: **−5** mỗi finding
- 🔶 MEDIUM: **−2**
- 🟡 LOW: **−1**
- 👁 Watch: **−0**
- Thang: **≥97 healthy** · 90–96 minor issues · <90 cần hành động.

**A — Score Summary:**
```
════════════════════════════════════════════════
  📊 AUDIT  ·  PVE: XX/100 · HA: XX/100  ·  YYYY-MM-DD
════════════════════════════════════════════════
  🔴 HIGH   × N  =  −X đ      🔶 MEDIUM × N  =  −X đ
  🟡 LOW    × N  =  −X đ      👁 Watch  × N  =   0 đ
  ✅ Baseline: khớp / [danh sách lệch]
════════════════════════════════════════════════
```

**B — Error Box:**
```
━━━ 🔴 [1/N] HIGH · [PVE|DSM|HA|CT-NNN] <tiêu đề ngắn> ━━━━━━━
  📍 Vị trí     : <host / VM / CT / file / entity / service>
  🔎 Nguyên nhân: <1 câu>
  ⚠️  Tác động  : <hậu quả thực tế>
  🔧 Fix        : <lệnh cụ thể>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
Fix an toàn: tự chạy. Fix nguy hiểm (restart chính/HA full, fstrim chủ động, reboot, xóa data/config, sửa `.storage`, **xóa LVM snapshot**): thêm `⚡ CẦN XÁC NHẬN`.

**C — Kết thúc:**
```
👁  WATCH: • [item] — giá trị / xu hướng / ngưỡng
✅  BASELINE KHỚP: [mục OK quan trọng]
📋  PHIÊN SAU: [việc cần làm]
```

---

## 🎓 BÀI HỌC — GOM THEO NHÓM

### Truy cập & SSH
- **#21** SSH từ `192.168.31.19` = VM103 → bình thường.
- **#22** SSH thẳng CT102 `.26` = refused → `ct_exec`.
- **#23** `qm agent exec` không ổn định → SSH vào VM.
- DSM chỉ `admin@`:22; HA `root@`:**2501**.
- **#25 (v9.4)** cụm nhỏ `kex_exchange_identification` không kèm `Failed password` = khả năng cao transient/health-check, KHÔNG tự động coi là tấn công — nhưng vẫn ghi log theo dõi tần suất.

### Storage / SMART / NCQ
- SMART baseline FROZEN (18/65/0); tăng = cable/interface.
- NCQ tắt chủ đích — KHÔNG bật lại.
- Host swap cao khi VM103 chạy: PSI=0 + 0 OOM = "nguội".
- **v9.4:** swap cũng có thể tăng dù VM103 STOPPED — do cộng dồn nhiều container nhỏ (vd CT111 python uvicorn 467MB) + VM101 KVM riêng lẻ; **không giả định nguyên nhân duy nhất là VM103** — luôn soi per-process VmSwap + cgroup trước khi kết luận.
- **Quy trình RECLAIM SWAP đã verify (v9.1.1):** (1) `systemctl stop pvestatd`; (2) hạ balloon VM đáp ứng nhanh; (3) verify `available > swap + ~2GB`; (4) `nohup bash -c 'swapoff -a; swapon -a' > log &`; (5) trả balloon về mức pvestatd đã chọn trước, KHÔNG trả max; (6) `systemctl start pvestatd`; (7) verify free/PSI/OOM/HTTP/guest running.

### LXC / Containers
- **#26** `pct fstrim` trả 0B trên LVM thin → fstrim host-side.
- **#31** KHÔNG thêm `discard=1` vào `/etc/pve/lxc/*.conf`.
- **#32** systemd unit/script dùng `/usr/sbin/pct`.
- CT cần `--features nesting=1` khi cần.
- Sau khi xóa CT: scan host unit/cron/timer rác theo tên CT/app.
- **v9.4:** xóa LVM snapshot rollback (`pct delsnapshot`) an toàn khi app đã verify healthy đủ lâu (≥24h khuyến nghị) — nhưng vẫn cần `⚡ CẦN XÁC NHẬN` vì không thể hoàn tác.

### DSM / Backup
- Job vzdump VM100 `mode stop` = reboot DSM mỗi đêm → luôn `mode snapshot`.
- Phát hiện CT mới → thêm ngay vào backup job.
- Backup ≠ Restore: test-restore định kỳ.

### HA quy trình
- UI editor ghi vào `automations.yaml` dormant → luôn verify bản trong `automations/`.
- Recorder/`homeassistant:` key → full restart mới active.
- Trước khi exclude recorder: verify entity sống + grep khối include.
- Telegram: `parse_mode: plain_text`; `chat_id:` không `target:`.
- **v9.4:** đếm automation/sensor/switch domain PHẢI dùng `ha_get_overview(domain_stats)`, KHÔNG dùng grep YAML thô — id lồng trong action/choose gây dương tính giả nặng (94 vs 39 thực).
- **v9.4:** addon Supervisor mới lạ (ngoài 5 addon baseline) → flag LOW, hỏi Truyền chủ đích hay không trước khi tự gỡ.

### MCP tooling
- **v9.4:** tool aggregator cấp cao (`system_overview`, `smart_check`, `balloon_status`, `backup_status`, `journal_errors`, `security_check`) có thể KHÔNG load được qua `tool_search` dù tài liệu cũ mô tả "17 tools". Khi gặp tình huống này: **KHÔNG dừng audit** — chuyển toàn bộ sang lệnh shell thủ công tương đương (đã viết sẵn trong PHASE 1-6/BATCH 1-4 phiên bản này để tự-đủ, không phụ thuộc tool aggregator). Xác nhận lại với Truyền ở đầu phiên sau xem có phải do thay đổi phía server.

---

## 🚫 KHÔNG BAO GIỜ

- Kết luận disk chết từ `dmesg` trong VM · LVM đầy khi chưa fstrim · VM chết vì agent timeout · SSH `.19` là brute force · vmbr0 drops là lỗi mạng.
- Reset RAID / format / xóa data user · restart service quan trọng chưa confirm · `destroy`/`dd` không backup+confirm.
- `root@` cho DSM · port 22 cho HA · `ssh_run` vào CT102 · `qm agent exec`.
- `discard=1` vào LXC config · `pct fstrim` trong CT · `/usr/bin/pct` trong unit.
- Bật lại NCQ · deploy image `:main` · tạo automation qua UI editor · sửa tay `.storage` không backup.
- Exclude recorder entity chưa verify sống + chưa grep include + chưa hỏi Truyền.
- Xóa LVM snapshot / gỡ addon mà chưa hỏi Truyền.
- Flag lại các mục trong bảng **QUYẾT ĐỊNH CỦA TRUYỀN**.
- Dùng `python3` trực tiếp trên HAOS host shell qua `ha_run` (không tồn tại) — dùng grep/awk/jq hoặc script trong `www/` qua `shell_command`.

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

### `/opt/pve-backup/pve-backup-nas-side.sh` — PHASE 3
Prune chuỗi VM100 rsync-pull về NAS (giữ 7 bản mới nhất), cron 01:00 daily; guard `mountpoint -q`.

### `/opt/open-webui/docker-compose.yml`
```yaml
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:v0.10.2
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

### Config host khác
- `/etc/udev/rules.d/60-ata-ncq.rules`: `queue_depth=1` cho sda/sdb/sdc.
- `/etc/modprobe.d/zfs.conf`: `zfs_arc_max=4294967296`.
- `/etc/sysctl.d/99-proxmox-tune.conf`: `vm.swappiness=10` · `vm.vfs_cache_pressure=50`.
- `/etc/vzdump.conf`: exclude-path + `tmpdir: /var/tmp/vzdump-tmp`.

---

## 📌 QUY TRÌNH LƯU FILE (BẮT BUỘC — tự thực hiện cuối phiên)

1. Sửa nội dung file này: cập nhật header TRẠNG THÁI, baseline, bài học mới, changelog (nén 1 dòng/phiên).
2. Đổi tên: `SYSTEM_AUDIT_vN.X.md → SYSTEM_AUDIT_vN.(X+1).md`.
3. `git add` file mới + `git rm` file cũ.
4. `git commit -m "chore: update system audit prompt vN.X → vN.(X+1)"`.
5. **Push theo môi trường:**
   - Session có quyền push `main` trực tiếp: `git push origin HEAD:main`.
   - **Session Claude Code web/remote (main bị khóa):** push lên branch của session, báo Truyền merge.
   - Push bị từ chối vì behind: `git fetch origin && git rebase origin/main` rồi push lại.
   - **v9.4: session claude.ai (web chat) này KHÔNG tìm thấy git repo cục bộ nào trên Proxmox host hay HA VM chứa file này** — file được lưu trong ô Instructions của claude.ai (theo bài học trước), không phải trong 1 repo git truy cập được qua MCP. Nếu Truyền có repo riêng ở máy khác, cần cung cấp đường dẫn/quyền truy cập để session sau có thể tự động push.

---

## 📋 APPENDIX — CHANGELOG (nén)

| Version | Tóm tắt |
|---|---|
| **v9.4 (2026-07-09)** | **Audit đầy đủ 2 lớp: PVE 97→99/100 sau fix · HA 99→100/100 sau fix.** MEDIUM (fixed): snapshot rollback `pre-openwebui-v0102-20260708-111220` (40G) đã xóa sau khi confirm open-webui v0.10.2 healthy 27h (`pct delsnapshot`, LVM data% 59.91%→59.61%). LOW (fixed): addon lạ "Advanced SSH & Web Terminal" v24.0.1 (state=stopped) — Truyền tự gỡ, verify sạch khỏi danh sách Supervisor addon (quay lại đúng 5 addon baseline). LOW (Watch, chưa fix): cụm 4 lỗi SSH `kex_exchange_identification`/`Connection reset by peer` 13:39:11 hôm nay, không kèm Failed password, khối lượng nhỏ — theo dõi tần suất. Watch: VM101 KVM swap tăng lại 745MB dù VM103 stopped (PSI=0, 0 OOM — chưa cần reclaim); giải thích swap tổng 2.5GB đầu phiên = cộng dồn nhiều nguồn nhỏ (CT111 uvicorn 467MB + VM101 745MB + nhiều frigate process nhỏ), KHÔNG phải 1 nguồn lớn. Phát hiện quan trọng về công cụ: tool aggregator MCP cấp cao (system_overview/smart_check/balloon_status/backup_status/journal_errors/security_check) KHÔNG load được qua tool_search phiên này dù tài liệu cũ mô tả "17 tools" — toàn bộ audit chạy bằng lệnh shell thủ công qua pve_run/dsm_run/ha_run/ct_exec, đã viết lại PHASE 1-6 + BATCH 1-4 để tự-đủ không phụ thuộc tool này; cần xác nhận lại phiên sau xem có phải do thay đổi phía mcp-server CT102. Phát hiện thao tác: đếm automation qua grep YAML thô bị dương tính giả nặng (94 vs 39 thực) do id lồng trong action/choose và định dạng `id:` không có dấu `-` — chuyển sang dùng `ha_get_overview(domain_stats)` làm nguồn đếm chuẩn. Sạch: SMART khớp baseline (UDMA 18/65/0, NVMe 12%/0 err), Btrfs scrub 0 err ×3, 0 failed unit, Funnel chỉ CT102, cloudflared 4 conns, Mosquitto 640, MariaDB 480M, HA valid + 0 repairs/orphans (10 stale_restored Frigate benign), sensor 166/switch 108/automation 39 khớp tuyệt đối, ping 0% loss, Zigbee bridge on, Core 2026.7.1, backup daily 3.77GB OK, recorder exclude/include vẫn đúng (proxmox_cpu_used + linkquality chưa bị force re-include). Không tìm thấy git repo cục bộ để tự động push file audit — lưu trong Instructions claude.ai như trước. |
| v9.3 (2026-07-08) | PVE 98/100 → 100 sau fix · HA 100/100. CT114 `nextjs-dashboard` mới tạo rồi bị Truyền xóa hẳn cùng phiên (Proxmox tự gỡ vmid khỏi backup job). Host reboot ×2 (kernel 30→32→33, benign). open-webui update v0.9.6→v0.10.2 healthy (snapshot rollback tạo ra, xóa ở v9.4). Xác nhận recorder v9.2.1 giữ vững. |
| v9.2.1 (2026-07-07) | PVE 100/100 · HA 100/100. Reclaim swap 7.1GB→0B. Exclude `sensor.o_cam_zigbee_20a_linkquality` (force re-include bug). |
| v9.2 (2026-07-07) | PVE 98/100 · HA 100/100 (trước fix). Host swap leo lại 7.1GB dù VM103 stopped — PSI=0. |
| v9.1.1 (2026-07-03) | PVE 100/100. Reclaim swap 6.0GB→0B (quy trình 7 bước). Backup NAS dọn 186G→119G + PHASE 3 retention keep-7. |
| v9.1 (2026-07-03) | PVE 97/100 · HA 100/100. Host swap 6.0GB do VM103 chạy. CT111 IP thật `.38`. MariaDB `10.11.14` chốt. |
| v9.0.1 (2026-07-03) | Fix Zigbee Map extension injection (`enable_external_js: true`). Sweep transmit_power → chốt 14. Fix layout Zigbee Map panel (HACS 2.17.0→2.17.1). |
| **v9.0 (2026-07-02)** | Hợp nhất PVE_v8.12 + HA_v8.15 → 1 file. |
| HA v8.15/.1 · PVE v8.12/.1 (2026-07-02) | 98/100 · 100/100. Fix Telegram parse_mode, recorder exclude proxmox_cpu_used. |
| v8.8–v8.14.2 (2026-06-29→07-02) | Fix cửa cuốn dormant automations.yaml. Frigate 0.17.2. VAAPI rollback. VM105 n8n xóa hẳn. MCP server v1.2.0 (17 tools — **lưu ý v9.4: hiện KHÔNG xác nhận còn đủ**). |
| HA v8.4.1–v8.7 (2026-06-28→29) | INCIDENT cửa cuốn tự mở, 16 thiết bị Zigbee offline sau SMLIGHT dev7 → fix fw + mesh hồi phục. |
| v8.0–v8.7 PVE (2026-06-25→30) | HIGH Frigate Funnel public → tắt. Mosquitto 640. Telegram repair ignore qua WS. |
| v7.x (2026-06-22→24) | HIGH Frigate NFS rớt → record:false + snapshots. CT111 pin version. Rubric chấm điểm. |
| HA v45–v57 (2026-06) | n8n cleanup · automations.yaml xóa hẳn · 09e mutex · backup REST dedup · orphan-stats method. |

> File này cần update sau mỗi phiên audit thành công.
