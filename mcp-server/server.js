#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import http from "http";
import { URL } from "url";
import crypto from "crypto";
import fs from "fs";

const execAsync = promisify(exec);
const PORT = 3456;
const BASE_URL = "https://mcp-server.tail1105f.ts.net";

// Dynamic base URL: trả IP/host theo request để OAuth hoạt động qua nhiều interface
function getBaseUrl(req) {
  if (!req || !req.headers || !req.headers.host) return BASE_URL;
  const host = req.headers.host;
  if (host.includes("tail") || host.includes("ts.net")) return BASE_URL;
  const proto = (req.socket && req.socket.encrypted) ? "https" : "http";
  return `${proto}://${host}`;
}

// ── MCP Aggregator /merged ──
// Gộp Ha 1 (self, 89 tools) + ha-mcp-dev (83 tools, prefix ha__)
const HA_MCP_URL   = process.env.HA_MCP_URL   || "";
const HA_MCP_TOKEN = process.env.HA_MCP_TOKEN || "";
if (!HA_MCP_URL || !HA_MCP_TOKEN) console.warn("WARNING: HA_MCP_URL/HA_MCP_TOKEN not set in .env - /merged HA aggregator disabled");
let haMcpToolsCache = null, haMcpToolsCacheTime = 0;
const HA_MCP_CACHE_TTL = 5 * 60 * 1000;

async function getHaMcpTools() {
  if (!HA_MCP_URL || !HA_MCP_TOKEN) return [];
  if (haMcpToolsCache && Date.now() - haMcpToolsCacheTime < HA_MCP_CACHE_TTL) return haMcpToolsCache;
  try {
    const r = await fetch(HA_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": `Bearer ${HA_MCP_TOKEN}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: AbortSignal.timeout(30000),
    });
    const text = await r.text();
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t.startsWith("data:")) {
        try {
          const d = JSON.parse(t.slice(5).trim());
          if (d && d.result && d.result.tools) {
            const prefixed = d.result.tools.map(tool => ({ ...tool, name: "ha__" + tool.name, _originalName: tool.name }));
            haMcpToolsCache = prefixed; haMcpToolsCacheTime = Date.now();
            console.log(`[merged] ha-mcp-dev tools loaded: ${prefixed.length}`);
            return prefixed;
          }
        } catch {}
      }
    }
    console.error("[merged] getHaMcpTools: no tools, status=" + r.status);
  } catch (e) { console.error("[merged] getHaMcpTools error:", e.message); }
  return [];
}

async function parseSseTools(fetchPromise) {
  try {
    const r = await fetchPromise;
    const text = await r.text();
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t.startsWith("data:")) {
        try { const d = JSON.parse(t.slice(5).trim()); if (d.result && d.result.tools) return d.result.tools; } catch {}
      }
    }
    try { const d = JSON.parse(text); if (d.result && d.result.tools) return d.result.tools; } catch {}
  } catch {}
  return [];
}
const PVE = "192.168.31.84";
const DSM = "192.168.31.116";
const HA = "192.168.31.111";
const HA_PORT = 2501;
const SSH_KEY = "/root/.ssh/id_ed25519";
const AUTH_PASSWORD = process.env.MCP_AUTH_TOKEN || "";

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days (was 24h)
const TOKENS_FILE = "/opt/mcp-server/.tokens.json";
function loadTokens() {
  try {
    const data = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf-8"));
    const now = Date.now(); const valid = {};
    for (const [t, meta] of Object.entries(data)) {
      if (meta && typeof meta.issued === "number" && now - meta.issued <= TOKEN_TTL_MS) valid[t] = meta;
    }
    return valid;
  } catch (e) { return {}; }
}
function saveTokens() {
  try {
    const tmp = TOKENS_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(tokens), { mode: 0o600 });
    fs.renameSync(tmp, TOKENS_FILE);
  } catch (e) { console.warn("WARNING: failed to persist tokens:", e.message); }
}
const CODE_TTL_MS = 5 * 60 * 1000;        // 5 min
const tokens = loadTokens();       // access_token -> { issued }
const pendingCodes = {}; // auth code     -> { code_challenge, code_challenge_method, expires, used }

// ---------------------------------------------------------------------
// Remote command execution
//
// Every command is base64-encoded by us and decoded+executed via bash
// on the remote side: echo <b64> | base64 -d | bash. This sidesteps ALL
// nested-quoting / heredoc escaping problems (single quotes, double quotes,
// dollar-vars, backticks, heredocs, pipes, multi-line scripts -- anything),
// because the outer SSH argument only ever contains base64-safe
// characters [A-Za-z0-9+/=]. Verified working on Proxmox (Debian bash),
// Synology DSM (busybox/bash) and HAOS (bash) on 2026-06-15.
//
// Non-zero exit codes no longer swallow output: execAsync throws on
// non-zero exit, but stdout/stderr are still attached to the error object,
// so we recover and return them. Previously a bare grep with no match,
// or any command ending non-zero, made the whole tool call fail with no
// output at all.
// ---------------------------------------------------------------------
async function runSSH(user, host, cmd, port = 22) {
  const b64 = Buffer.from(cmd, "utf-8").toString("base64");
  const portOpt = port !== 22 ? `-p ${port} ` : "";
  const inner = `echo ${b64} | base64 -d | bash`;
  const ssh = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -i ${SSH_KEY} ${portOpt}${user}@${host} "${inner}"`;
  try {
    const { stdout, stderr } = await execAsync(ssh, { timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    const out = (stdout + stderr).trim();
    return out.length ? out : "(no output, exit 0)";
  } catch (err) {
    const out = ((err.stdout || "") + (err.stderr || "")).trim();
    return out.length ? out : `ERROR: ${err.message}`;
  }
}

// Build a shell snippet that pipes a base64-encoded payload into execTail.
// Used for one-level-deeper nesting (sudo, pct exec) without any escaping.
function pipeB64(cmd, execTail) {
  const b64 = Buffer.from(cmd, "utf-8").toString("base64");
  return `echo ${b64} | base64 -d | ${execTail}`;
}

// Run a command inside an LXC containers own namespace, from the Proxmox
// host. Same base64-pipe trick, nested one level deeper (verified working
// against CT104 on 2026-06-15).
async function runInContainer(ctid, cmd) {
  return runSSH("root", PVE, pipeB64(cmd, `pct exec ${ctid} -- bash`));
}

// ---------------------------------------------------------------------
// MCP tools
// ---------------------------------------------------------------------
function buildMcpServer() {
  const server = new McpServer({ name: "homelab-mcp", version: "1.2.0" });

  server.tool("pve_run",
    { command: z.string().describe("Shell command to run on the Proxmox host 192.168.31.84 as root. Any quoting, heredocs, pipes, and multi-line scripts are fine, no escaping needed.") },
    async ({ command }) => ({ content: [{ type: "text", text: await runSSH("root", PVE, command) }] }));

  server.tool("dsm_run",
    { command: z.string().describe("Shell command to run on Synology DSM 192.168.31.116 as user admin. Any quoting, heredocs, pipes, and multi-line scripts are fine, no escaping needed. For root-level commands use dsm_sudo_run instead.") },
    async ({ command }) => ({ content: [{ type: "text", text: await runSSH("admin", DSM, command) }] }));

  server.tool("dsm_sudo_run",
    { command: z.string().describe("Shell command to run AS ROOT via sudo on Synology DSM 192.168.31.116. admin has passwordless sudo, NOPASSWD ALL. Use for fstrim, docker, syslog-ng reload, writes under /etc and /usr/local. Any quoting/heredoc/pipe/multi-line is fine.") },
    async ({ command }) => ({ content: [{ type: "text", text: await runSSH("admin", DSM, pipeB64(command, "sudo bash")) }] }));

  server.tool("ha_run",
    { command: z.string().describe("Shell command to run on the Home Assistant OS VM 192.168.31.111 as root, SSH port 2501. Any quoting, heredocs, pipes, and multi-line scripts are fine, no escaping needed.") },
    async ({ command }) => ({ content: [{ type: "text", text: await runSSH("root", HA, command, HA_PORT) }] }));

  server.tool("ssh_run",
    {
      host: z.string().describe("Target host IP address. Common: 192.168.31.26 is mcp-server CT102 itself, e.g. to check its own systemd units."),
      user: z.string().describe("SSH user on the target, e.g. root or admin."),
      command: z.string().describe("Shell command to run. Any quoting, heredocs, pipes, and multi-line scripts are fine, no escaping needed."),
      port: z.number().int().optional().describe("SSH port. Defaults to 22. Home Assistant 192.168.31.111 requires port 2501."),
    },
    async ({ host, user, command, port }) => ({ content: [{ type: "text", text: await runSSH(user, host, command, port ?? 22) }] }));

  server.tool("ct_exec",
    {
      ctid: z.string().describe("LXC container ID on the Proxmox host, e.g. 104 for Frigate NVR with GPU passthrough, or 105 zigbee2mqtt-new, 111 open-webui, 112 Wireguard. Use pve_run with pct list to see all CTs."),
      command: z.string().describe("Shell command to run as root inside the containers own namespace via pct exec. Any quoting, heredocs, pipes, and multi-line scripts are fine, no escaping needed."),
    },
    async ({ ctid, command }) => ({ content: [{ type: "text", text: await runInContainer(ctid, command) }] }));

  server.tool("smart_check", {},
    async () => {
      const cmd = `
for d in $(lsblk -dno NAME,TYPE | awk '$2=="disk"{print $1}'); do
  echo "=== $d ==="
  smartctl -a /dev/$d | grep -E "Model|Power_On_Hours|Reallocated|Pending|Uncorrectable|UDMA_CRC|Temperature|SMART overall|Percentage Used|Available Spare:|Media and Data|Power On Hours:|Data Units Written"
done`;
      const out = await runSSH("root", PVE, cmd);
      const note = "\n[Baseline 2026-06-14: sda UDMA_CRC=18, sdb=65, sdc=0, frozen and stable. " +
        "An increase vs this baseline suggests a SATA cable issue, not a bad sector, as long as " +
        "Reallocated_Sector_Ct and Current_Pending_Sector both stay at 0. NVMe nvme0n1 baseline 2026-07-02: PASSED, Percentage Used 11%, Media and Data Integrity Errors 0.]";
      return { content: [{ type: "text", text: out + note }] };
    });

  server.tool("balloon_status", {},
    async () => {
      const cmd = `
for vmid in $(qm list 2>/dev/null | awk 'NR>1{print $1}'); do
  st=$(qm status $vmid 2>/dev/null | awk '{print $2}')
  if [ "$st" = "running" ]; then
    pid=$(cat /var/run/qemu-server/$vmid.pid 2>/dev/null)
    rss="?"
    if [ -n "$pid" ] && [ -d /proc/$pid ]; then
      rss=$(awk '/VmRSS/{printf "%.2f GB", $2/1048576}' /proc/$pid/status)
    fi
    bal=$(echo "info balloon" | timeout 3 qm monitor $vmid 2>/dev/null | grep -i actual)
    echo "VM $vmid: running  RSS=$rss  $bal"
  else
    echo "VM $vmid: $st"
  fi
done`;
      return { content: [{ type: "text", text: await runSSH("root", PVE, cmd) }] };
    });

  server.tool("fstrim_all",
    {},
    async () => {
      const [dsmStart, pveFstrim, lvmBefore] = await Promise.allSettled([
        runSSH("admin", DSM, pipeB64(
          `rm -f /tmp/mcp_fstrim.log; nohup fstrim -av > /tmp/mcp_fstrim.log 2>&1 & echo started-pid-$!`,
          "sudo bash")),
        runSSH("root", PVE, "fstrim -av 2>&1"),
        runSSH("root", PVE, "lvs -o lv_name,lv_size,data_percent --units g pve 2>/dev/null | grep data"),
      ]);
      const fmt = r => (r.status === "fulfilled" ? r.value : `ERROR: ${r.reason}`);
      return { content: [{ type: "text", text: [
        "=== Proxmox host fstrim, local fs, fast ===", fmt(pveFstrim),
        "=== LVM thin pool, before DSM trim finishes ===", fmt(lvmBefore),
        "=== DSM fstrim, started in background, Btrfs trim can take minutes ===", fmt(dsmStart),
        "-> Poll progress with the fstrim_status tool.",
      ].join("\n") }] };
    });

  server.tool("fstrim_status",
    {},
    async () => {
      const [dsmLog, dsmRunning, lvmAfter] = await Promise.allSettled([
        runSSH("admin", DSM, "cat /tmp/mcp_fstrim.log 2>/dev/null || echo no-log-yet-run-fstrim_all-first"),
        runSSH("admin", DSM, "ps aux | grep fstrim | grep -v grep | wc -l"),
        runSSH("root", PVE, "lvs -o lv_name,lv_size,data_percent --units g pve 2>/dev/null | grep data"),
      ]);
      const fmt = r => (r.status === "fulfilled" ? r.value : `ERROR: ${r.reason}`);
      return { content: [{ type: "text", text: [
        "=== DSM fstrim still running? count, 0 means done ===", fmt(dsmRunning),
        "=== DSM fstrim log ===", fmt(dsmLog),
        "=== LVM thin pool now ===", fmt(lvmAfter),
      ].join("\n") }] };
    });

  server.tool("system_overview", {},
    async () => {
      const [ram, vmRss, lvm, vms, ncq, arc, swap, failed, storage, dsmDf, dsmMdstat] = await Promise.allSettled([
        runSSH("root", PVE, "free -h && echo --- && uptime"),
        runSSH("root", PVE, `
for vmid in $(qm list 2>/dev/null | awk 'NR>1{print $1}'); do
  st=$(qm status $vmid 2>/dev/null | awk '{print $2}')
  if [ "$st" = "running" ]; then
    pid=$(cat /var/run/qemu-server/$vmid.pid 2>/dev/null)
    rss="?"
    if [ -n "$pid" ] && [ -d /proc/$pid ]; then
      rss=$(awk '/VmRSS/{printf "%.2f GB", $2/1048576}' /proc/$pid/status)
    fi
    bal=$(echo "info balloon" | timeout 3 qm monitor $vmid 2>/dev/null | grep -i actual)
    echo "VM $vmid: RSS=$rss  $bal"
  else
    echo "VM $vmid: $st"
  fi
done`),
        runSSH("root", PVE, "lvs -o lv_name,lv_size,data_percent --units g pve 2>/dev/null | grep data"),
        runSSH("root", PVE, "qm list && echo --- && pct list"),
        runSSH("root", PVE, `for d in $(lsblk -dno NAME,TYPE | awk '$2=="disk" && $1 ~ /^sd/{print $1}'); do [ -b /dev/$d ] && echo "$d queue_depth=$(cat /sys/block/$d/device/queue_depth)"; done`),
        runSSH("root", PVE, `
ZFSMAX=$(cat /sys/module/zfs/parameters/zfs_arc_max 2>/dev/null)
[ -z "$ZFSMAX" ] && ZFSMAX=N/A
echo zfs_arc_max=$ZFSMAX
awk '/^size/{print "ARC used: " ($3/1073741824) " GiB"}' /proc/spl/kstat/zfs/arcstats 2>/dev/null || echo "ARC: no zfs pool active"`),
        runSSH("root", PVE, "echo swappiness=$(cat /proc/sys/vm/swappiness) vfs_cache_pressure=$(cat /proc/sys/vm/vfs_cache_pressure)"),
        runSSH("root", PVE, "systemctl list-units --state=failed --no-legend"),
        runSSH("root", PVE, "pvesm status"),
        runSSH("admin", DSM, "df -h | grep -E 'volume|Filesystem'"),
        runSSH("admin", DSM, "grep -E '^md|blocks' /proc/mdstat"),
      ]);
      const fmt = r => (r.status === "fulfilled" ? r.value : `ERROR: ${r.reason}`);
      return { content: [{ type: "text", text: [
        "=== RAM and Uptime, Proxmox ===", fmt(ram),
        "=== Per-VM RSS / balloon actual ===", fmt(vmRss),
        "=== LVM thin pool percent ===", fmt(lvm),
        "=== VMs / CTs, qm list and pct list ===", fmt(vms),
        "=== NCQ queue_depth, should be 1 ===", fmt(ncq),
        "=== ZFS ARC ===", fmt(arc),
        "=== swappiness / vfs_cache_pressure ===", fmt(swap),
        "=== Failed systemd units ===", fmt(failed),
        "=== Storage, pvesm status ===", fmt(storage),
        "=== DSM df, volumes ===", fmt(dsmDf),
        "=== DSM mdstat ===", fmt(dsmMdstat),
      ].join("\n") }] };
    });


  server.tool("backup_status", {},
    async () => {
      const cmd = `
echo "=== Backup jobs (pvesh /cluster/backup) ==="
pvesh get /cluster/backup --output-format json 2>/dev/null | python3 -m json.tool 2>/dev/null || pvesh get /cluster/backup 2>&1 | head -40
echo
echo "=== Newest backup per guest (per storage) ==="
for d in /mnt/pve/Synology/dump /var/lib/vz/dump; do
  echo "-- $d --"
  ls -lt --time-style=long-iso $d/vzdump-*.zst 2>/dev/null | awk '{n=split($8,p,"/"); split(p[n],a,"-"); if(!seen[a[3]]++) printf "%-6s %8.2f GB  %s %s  %s\\n", a[3], $5/1073741824, $6, $7, p[n]}'
done
echo
echo "=== Guests without any backup file ==="
{ qm list 2>/dev/null | awk 'NR>1{print $1}'; pct list 2>/dev/null | awk 'NR>1{print $1}'; } | sort > /tmp/_all_guests
ls /mnt/pve/Synology/dump/vzdump-*.zst /var/lib/vz/dump/vzdump-*.zst 2>/dev/null | awk -F/ '{split($NF,a,"-"); print a[3]}' | sort -u > /tmp/_backed
missing=$(comm -23 /tmp/_all_guests /tmp/_backed)
if [ -n "$missing" ]; then echo "$missing" | sed 's/^/NO-BACKUP: vmid /'; else echo "OK: all guests have at least one backup file"; fi
echo
echo "=== vzdump errors in journal (7d) ==="
errs=$(journalctl --since "-7d" --no-pager 2>/dev/null | grep -iE "vzdump.*(error|failed)" | tail -10)
if [ -n "$errs" ]; then echo "$errs"; else echo "(none)"; fi`;
      return { content: [{ type: "text", text: await runSSH("root", PVE, cmd) }] };
    });

  server.tool("journal_errors",
    { hours: z.number().int().optional().describe("Look-back window in hours (default 24, max 168). Aggregates journalctl -p err from the Proxmox host AND every running LXC container in one call.") },
    async ({ hours }) => {
      const h = Math.min(hours || 24, 168);
      const cmd = `
echo "=== HOST proxmox: journalctl -p err (last ${h}h) ==="
journalctl -p err --since "-${h}h" --no-pager 2>&1 | tail -40
for ct in $(pct list 2>/dev/null | awk 'NR>1 && $2=="running"{print $1}'); do
  echo
  echo "=== CT $ct: journalctl -p err (last ${h}h) ==="
  pct exec $ct -- journalctl -p err --since "-${h}h" --no-pager 2>&1 | tail -15
done`;
      return { content: [{ type: "text", text: await runSSH("root", PVE, cmd) }] };
    });

  server.tool("security_check", {},
    async () => {
      const cmd = `
echo "=== Tailscale HOST: funnel/serve + status ==="
tailscale funnel status 2>/dev/null | head -15
tailscale status 2>/dev/null | head -6
echo
echo "=== Tailscale/Funnel in running CTs ==="
for ct in $(pct list 2>/dev/null | awk 'NR>1 && $2=="running"{print $1}'); do
  out=$(pct exec $ct -- sh -c 'command -v tailscale >/dev/null 2>&1 && { echo "version: $(tailscale version 2>/dev/null | head -1)"; tailscale funnel status 2>/dev/null | head -8; }' 2>/dev/null)
  [ -n "$out" ] && { echo "-- CT $ct --"; echo "$out"; }
done
echo
echo "=== AllowFunnel files in CTs (expected: only CT102) ==="
for ct in $(pct list 2>/dev/null | awk 'NR>1 && $2=="running"{print $1}'); do
  n=$(pct exec $ct -- sh -c 'grep -rl AllowFunnel /var/lib/tailscale 2>/dev/null | wc -l' 2>/dev/null)
  [ -n "$n" ] && [ "$n" != "0" ] && echo "CT $ct: $n file(s) mention AllowFunnel"
done
echo "(end of AllowFunnel scan)"
echo
echo "=== HOST listening ports (non-loopback) ==="
ss -tlnp | awk 'NR==1 || $4 !~ /^127\\.|^\\[::1\\]/'
echo
echo "=== sshd policy (host) ==="
sshd -T 2>/dev/null | grep -E "^(permitrootlogin|passwordauthentication|port )"
echo
echo "=== Failed SSH password attempts last 24h (host) ==="
journalctl -u ssh --since "-24h" --no-pager 2>/dev/null | grep -c "Failed password" || true`;
      return { content: [{ type: "text", text: await runSSH("root", PVE, cmd) }] };
    });

  server.tool("pve_logs",
    {
      service: z.string().optional().describe("systemd unit name to filter, e.g. pve-manager, pvedaemon, pveproxy, qemu-server, pct, cron, fstrim-vms. Omit for all system logs."),
      lines:   z.number().int().optional().describe("Number of recent log lines to return (default 100, max 2000)."),
      grep:    z.string().optional().describe("Optional grep filter applied to output, case-insensitive."),
    },
    async ({ service, lines, grep }) => {
      const n   = Math.min(lines || 100, 2000);
      const svc = service ? `-u ${service} ` : "";
      let cmd   = `journalctl ${svc}-n ${n} --no-pager 2>&1`;
      if (grep) cmd += ` | grep -i ${JSON.stringify(grep)} || echo "(no matches)"`;
      return { content: [{ type: "text", text: await runSSH("root", PVE, cmd) }] };
    });

  server.tool("dsm_logs",
    {
      source: z.enum(["messages", "synolog", "docker", "kern", "fstrim"]).optional()
        .describe("Log source: messages=/var/log/messages (default), synolog=system log via synologg, docker=ContainerManager logs, kern=kernel ring buffer (dmesg), fstrim=weekly fstrim job log."),
      lines:  z.number().int().optional().describe("Number of recent lines to return (default 100, max 2000)."),
      grep:   z.string().optional().describe("Optional grep filter applied to output, case-insensitive."),
    },
    async ({ source, lines, grep }) => {
      const n = Math.min(lines || 100, 2000);
      let cmd;
      if (!source || source === "messages") {
        cmd = `sudo tail -n ${n} /var/log/messages 2>&1`;
      } else if (source === "synolog") {
        cmd = `sudo synologg --category=system 2>/dev/null | tail -n ${n} || sudo tail -n ${n} /var/log/synolog 2>&1`;
      } else if (source === "docker") {
        const DOCKER = "/volume2/@appstore/ContainerManager/usr/bin/docker";
        cmd = `sudo ${DOCKER} ps -q 2>/dev/null | head -5 | while read id; do name=$(sudo ${DOCKER} inspect --format "{{.Name}}" $id 2>/dev/null | tr -d /); echo "=== $name ==="; sudo ${DOCKER} logs --tail ${n} $id 2>&1 | tail -20; done`;
      } else if (source === "kern") {
        cmd = `sudo dmesg -T 2>&1 | tail -n ${n}`;
      } else if (source === "fstrim") {
        cmd = `ls -t /var/log/fstrim-vms-*.log 2>/dev/null | head -1 | xargs tail -n ${n} 2>/dev/null || echo "no fstrim log found"`;
      }
      if (grep) cmd = `{ ${cmd}; } | grep -i ${JSON.stringify(grep)} || echo "(no matches)"`;
      return { content: [{ type: "text", text: await runSSH("admin", DSM, cmd) }] };
    });

  server.tool("ha_logs",
    {
      lines:  z.number().int().optional().describe("Number of recent log lines to return (default 100, max 2000)."),
      level:  z.enum(["all", "error", "warning", "info"]).optional().describe("Filter by log level (default all)."),
      grep:   z.string().optional().describe("Optional grep filter applied to output, case-insensitive."),
    },
    async ({ lines, level, grep }) => {
      const n = Math.min(lines || 100, 2000);
      let cmd = `ha core logs 2>&1 | tail -n ${n} | sed "s/\x1b\[[0-9;]*m//g"`;
      if (level && level !== "all") cmd = `{ ${cmd}; } | grep -i "${level}" || echo "(no matches)"`;
      if (grep) cmd = `{ ${cmd}; } | grep -i ${JSON.stringify(grep)} || echo "(no matches)"`;
      return { content: [{ type: "text", text: await runSSH("root", HA, cmd, 2501) }] };
    });


  // ========== HA NATIVE TOOLS (added 2026-06-16) ==========

  server.tool("ha_addon_list",
    {},
    async () => {
      const cmd = `ha addons --raw-json 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
addons = d.get('data',{}).get('addons',[])
print('%-10s %-15s %-40s %s' % ('STATE','VERSION','SLUG','NAME'))
print('-'*100)
for a in addons:
    print('%-10s %-15s %-40s %s' % (a.get('state','?'), a.get('version','?'), a.get('slug','?'), a.get('name','?')))
"`;
      return { content: [{ type: "text", text: await runSSH("root", HA, cmd, HA_PORT) }] };
    });

  server.tool("ha_addon_logs",
    {
      slug: z.string().describe("Add-on slug, e.g. core_mosquitto, 5c53de3b_esphome, core_mariadb. Use ha_addon_list to discover slugs."),
      lines: z.number().int().optional().describe("Number of recent log lines to return (default 50)."),
    },
    async ({ slug, lines }) => {
      const n = lines ?? 50;
      const cmd = `ha addons logs ${slug} 2>&1 | tail -${n}`;
      return { content: [{ type: "text", text: await runSSH("root", HA, cmd, HA_PORT) }] };
    });

  server.tool("ha_config_check",
    {},
    async () => {
      // Script Python encode base64 để tránh quote hell
      const script = `
import subprocess, json, sys

def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return (r.stdout + r.stderr).strip()

# Config check
chk = run("ha core check --raw-json 2>/dev/null")
print("=== CONFIG CHECK ===")
try:
    print("valid" if json.loads(chk).get("data") == {} else chk)
except: print(chk)

# Version + stats
info = run("ha core info --raw-json 2>/dev/null")
try:
    d = json.loads(info).get("data", {})
    print(f"\\n=== VERSION ===\\nCore: {d.get('version','?')} | Latest: {d.get('version_latest','?')}")
except: print(info)

stats = run("ha core stats --raw-json 2>/dev/null")
try:
    s = json.loads(stats).get("data", {})
    mb_used = s.get("memory_usage", 0) // 1048576
    mb_limit = s.get("memory_limit", 0) // 1048576
    print(f"\\n=== HA STATS ===\\nCPU: {s.get('cpu_percent',0):.1f}%  RAM: {mb_used}/{mb_limit} MB ({s.get('memory_percent',0):.1f}%)")
except: print(stats)

# Updates
upd = run("ha available-updates --raw-json 2>/dev/null")
print("\\n=== UPDATES ===")
try:
    u = json.loads(upd).get("data", {}).get("available_updates", [])
    print("None" if not u else "\\n".join(str(x) for x in u))
except: print(upd)

# Disk
disk = run("ha host info --raw-json 2>/dev/null")
print("\\n=== HOST DISK ===")
try:
    h = json.loads(disk).get("data", {})
    print(f"Used: {h.get('disk_used','?')}/{h.get('disk_total','?')} GB  Free: {h.get('disk_free','?')} GB")
except: print(disk)

# Addons
ad = run("ha addons --raw-json 2>/dev/null")
print("\\n=== ADDONS ===")
try:
    addons = json.loads(ad).get("data", {}).get("addons", [])
    for a in addons:
        print(f"  {a.get('state','?'):10} {a.get('version','?'):15} {a.get('name','?')}")
except: print(ad)
`;
      return { content: [{ type: "text", text: await runSSH("root", HA, await pipeB64(script), HA_PORT) }] };
    });




  // ================================================================
  // HA NATIVE TOOLS — v2.0.0 — 2026-06-16
  // Dùng HA REST API + WebSocket, auth via LLAT (HA_TOKEN env var)
  // ================================================================

  const HA_BASE = "http://192.168.31.111:8123";

  function haToken() { return process.env.HA_TOKEN || ""; }

  async function haREST(method, path2, body) {
    const opts = {
      method,
      headers: { "Authorization": `Bearer ${haToken()}`, "Content-Type": "application/json" },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${HA_BASE}${path2}`, opts);
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  async function haWS(msgObj, timeoutMs = 10000) {
    const { default: WebSocket } = await import("ws");
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://192.168.31.111:8123/api/websocket`);
      const timer = setTimeout(() => { ws.terminate(); reject(new Error("WS timeout")); }, timeoutMs);
      ws.on("message", raw => {
        const msg = JSON.parse(raw);
        if (msg.type === "auth_required") {
          ws.send(JSON.stringify({ type: "auth", access_token: haToken() }));
        } else if (msg.type === "auth_ok") {
          ws.send(JSON.stringify({ id: 1, ...msgObj }));
        } else if (msg.type === "auth_invalid") {
          clearTimeout(timer); ws.terminate(); reject(new Error("HA auth invalid — check HA_TOKEN"));
        } else if (msg.id === 1) {
          clearTimeout(timer); ws.terminate();
          if (msg.success === false) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      });
      ws.on("error", e => { clearTimeout(timer); reject(e); });
    });
  }

  function fmtJ(obj) { return typeof obj === "string" ? obj : JSON.stringify(obj, null, 2); }

  // ── ENTITY STATE & SEARCH ──────────────────────────────────

  server.tool("ha_get_state", {
    entity_id: z.union([z.string(), z.array(z.string())]).optional()
      .describe("entity_id hoặc array. Bỏ trống = list tất cả (cảnh báo: lớn). Ví dụ: sensor.nhiet_do_bedroom"),
  }, async ({ entity_id }) => {
    let result;
    if (!entity_id) {
      result = await haREST("GET", "/api/states");
    } else if (Array.isArray(entity_id)) {
      result = await Promise.all(entity_id.map(id => haREST("GET", `/api/states/${id}`)));
    } else {
      result = await haREST("GET", `/api/states/${entity_id}`);
    }
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_call_service", {
    domain: z.string().describe("Service domain: light, climate, switch, automation, shell_command, input_boolean..."),
    service: z.string().describe("Service name: turn_on, turn_off, toggle, set_hvac_mode, run_script..."),
    entity_id: z.union([z.string(), z.array(z.string())]).optional(),
    data: z.record(z.any()).optional().describe("Extra data: {temperature:25, hvac_mode:'cool'}"),
  }, async ({ domain, service, entity_id, data }) => {
    const body = { ...(data || {}) };
    if (entity_id) body.entity_id = entity_id;
    const result = await haREST("POST", `/api/services/${domain}/${service}`, body);
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_search", {
    query: z.string().optional().describe("Tên entity, entity_id fragment, hoặc friendly_name"),
    domain_filter: z.string().optional().describe("Lọc domain: light, sensor, climate, automation, script, input_boolean..."),
    state_filter: z.string().optional().describe("Lọc state: on, off, unavailable, unknown"),
    area_filter: z.string().optional().describe("Lọc theo area_id"),
  }, async ({ query, domain_filter, state_filter, area_filter }) => {
    const allStates = await haREST("GET", "/api/states");
    let results = allStates || [];
    if (domain_filter) results = results.filter(s => s.entity_id.startsWith(domain_filter + "."));
    if (state_filter) results = results.filter(s => s.state.toLowerCase() === state_filter.toLowerCase());
    if (area_filter) results = results.filter(s => (s.attributes?.area_id || "") === area_filter);
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(s =>
        s.entity_id.toLowerCase().includes(q) ||
        (s.attributes?.friendly_name || "").toLowerCase().includes(q)
      );
    }
    const out = results.map(s => ({
      entity_id: s.entity_id, state: s.state,
      name: s.attributes?.friendly_name || "",
    }));
    return { content: [{ type: "text", text: `${out.length} kết quả:\n` + fmtJ(out) }] };
  });

  server.tool("ha_eval_template", {
    template: z.string().describe("Jinja2 template, ví dụ: {{ states('sensor.nhiet_do_bedroom') }}°C"),
  }, async ({ template }) => {
    const result = await haREST("POST", "/api/template", { template });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_bulk_control", {
    domain: z.string().describe("Domain: light, switch, climate, fan..."),
    service: z.string().describe("Service: turn_on, turn_off, toggle"),
    entity_ids: z.array(z.string()).optional().describe("Danh sách entity cụ thể"),
    area_id: z.string().optional().describe("Target tất cả entity trong area"),
    label_id: z.string().optional().describe("Target tất cả entity có label"),
    data: z.record(z.any()).optional(),
  }, async ({ domain, service, entity_ids, area_id, label_id, data }) => {
    const body = { ...(data || {}) };
    if (entity_ids) body.entity_id = entity_ids;
    if (area_id) body.area_id = area_id;
    if (label_id) body.label_id = label_id;
    const result = await haREST("POST", `/api/services/${domain}/${service}`, body);
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  // ── HISTORY ────────────────────────────────────────────────

  server.tool("ha_get_history", {
    entity_ids: z.union([z.string(), z.array(z.string())])
      .describe("entity_id hoặc array. Ví dụ: sensor.nhiet_do_bedroom"),
    start_time: z.string().optional().describe("ISO hoặc relative: '24h', '7d', '30d'. Default: 24h"),
    end_time: z.string().optional().describe("ISO datetime. Default: now"),
    minimal: z.boolean().optional().describe("Chỉ state+timestamp, không attributes (default true)"),
  }, async ({ entity_ids, start_time, end_time, minimal = true }) => {
    const ids = Array.isArray(entity_ids) ? entity_ids.join(",") : entity_ids;
    let startISO = start_time;
    if (!start_time || start_time === "24h") startISO = new Date(Date.now() - 86400000).toISOString();
    else if (/^\d+h$/.test(start_time)) startISO = new Date(Date.now() - parseInt(start_time) * 3600000).toISOString();
    else if (/^\d+d$/.test(start_time)) startISO = new Date(Date.now() - parseInt(start_time) * 86400000).toISOString();
    let path2 = `/api/history/period/${startISO}?filter_entity_id=${ids}`;
    if (end_time) path2 += `&end_time=${end_time}`;
    if (minimal) path2 += "&minimal_response=true&significant_changes_only=true";
    const result = await haREST("GET", path2);
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  // ── ENTITY & DEVICE REGISTRY ───────────────────────────────

  server.tool("ha_get_entity", {
    entity_id: z.union([z.string(), z.array(z.string())])
      .describe("entity_id hoặc array để lấy thông tin registry"),
  }, async ({ entity_id }) => {
    const ids = Array.isArray(entity_id) ? entity_id : [entity_id];
    const results = await Promise.all(ids.map(id =>
      haWS({ type: "config/entity_registry/get", entity_id: id })
    ));
    return { content: [{ type: "text", text: fmtJ(ids.length === 1 ? results[0] : results) }] };
  });

  server.tool("ha_set_entity", {
    entity_id: z.union([z.string(), z.array(z.string())]).describe("entity_id hoặc array (bulk chỉ hỗ trợ labels)"),
    name: z.string().optional().describe("Custom display name. '' để reset."),
    icon: z.string().optional().describe("MDI icon. '' để reset."),
    area_id: z.string().optional().describe("Area ID. '' để bỏ gán."),
    new_entity_id: z.string().optional().describe("Đổi entity_id. Domain phải giống."),
    disabled_by: z.string().nullable().optional().describe("null=enable, 'user'=disable"),
    hidden_by: z.string().nullable().optional().describe("null=show, 'user'=hide"),
    labels: z.array(z.string()).optional().describe("Label IDs"),
    label_operation: z.enum(["set","add","remove"]).optional().describe("Default: set"),
  }, async ({ entity_id, labels, label_operation = "set", ...changes }) => {
    const ids = Array.isArray(entity_id) ? entity_id : [entity_id];
    if (ids.length > 1) {
      // Bulk: chỉ labels
      const results = await Promise.all(ids.map(id =>
        haWS({ type: "config/entity_registry/update", entity_id: id, labels })
      ));
      return { content: [{ type: "text", text: fmtJ(results) }] };
    }
    const payload = { type: "config/entity_registry/update", entity_id: ids[0], ...changes };
    if (labels) payload.labels = labels;
    const result = await haWS(payload);
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_remove_entity", {
    entity_id: z.string().describe("entity_id orphan/stale cần gỡ khỏi entity registry"),
  }, async ({ entity_id }) => {
    const result = await haWS({ type: "config/entity_registry/remove", entity_id });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_get_device", {
    device_id: z.string().optional().describe("Device ID cho single detail. Bỏ = list tất cả."),
    entity_id: z.string().optional().describe("Tìm device qua entity_id"),
    integration: z.string().optional().describe("Lọc: zha, zigbee2mqtt, zwave_js, mqtt, esphome..."),
  }, async ({ device_id, entity_id, integration }) => {
    if (entity_id) {
      const ent = await haWS({ type: "config/entity_registry/get", entity_id });
      if (ent?.device_id) {
        const allDevs = await haWS({ type: "config/device_registry/list" });
        const dev = (allDevs || []).find(d => d.id === ent.device_id);
        return { content: [{ type: "text", text: fmtJ(dev || "Device not found") }] };
      }
      return { content: [{ type: "text", text: "Entity has no device" }] };
    }
    const allDevices = await haWS({ type: "config/device_registry/list" });
    let filtered = allDevices || [];
    if (device_id) {
      return { content: [{ type: "text", text: fmtJ(filtered.find(d => d.id === device_id) || "Not found") }] };
    }
    if (integration) filtered = filtered.filter(d => (d.identifiers || []).some(i => i[0] === integration));
    return { content: [{ type: "text", text: fmtJ(filtered.map(d => ({ id: d.id, name: d.name_by_user || d.name, manufacturer: d.manufacturer, model: d.model, area_id: d.area_id }))) }] };
  });

  server.tool("ha_set_device", {
    device_id: z.string().describe("Device ID"),
    name: z.string().optional().describe("Custom display name"),
    area_id: z.string().optional().describe("Area ID"),
    disabled_by: z.string().nullable().optional().describe("null=enable, 'user'=disable"),
    labels: z.array(z.string()).optional(),
  }, async ({ device_id, ...changes }) => {
    const result = await haWS({ type: "config/device_registry/update", device_id, ...changes });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_remove_device", {
    device_id: z.string().describe("Device ID cần gỡ"),
    config_entry_id: z.string().describe("Config entry ID liên kết"),
  }, async ({ device_id, config_entry_id }) => {
    const result = await haWS({ type: "config/device_registry/remove_config_entry_from_device", device_id, config_entry_id });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  // ── AREA & FLOOR ───────────────────────────────────────────

  server.tool("ha_list_floors_areas", {}, async () => {
    const [floors, areas] = await Promise.all([
      haWS({ type: "config/floor_registry/list" }),
      haWS({ type: "config/area_registry/list" }),
    ]);
    return { content: [{ type: "text", text: fmtJ({ floors, areas }) }] };
  });

  server.tool("ha_set_area_or_floor", {
    type: z.enum(["area","floor"]).describe("Loại: area hoặc floor"),
    id: z.string().optional().describe("ID để update. Bỏ = create mới."),
    name: z.string().optional().describe("Display name (bắt buộc khi create)"),
    icon: z.string().optional().describe("MDI icon"),
    floor_id: z.string().optional().describe("(area) Gán vào floor"),
    aliases: z.array(z.string()).optional().describe("Voice aliases"),
    level: z.number().int().optional().describe("(floor) Level number"),
  }, async ({ type: t, id, name, icon, floor_id, aliases, level }) => {
    const action = id ? "update" : "create";
    const msgType = `config/${t}_registry/${action}`;
    const payload = { type: msgType };
    if (id) payload[`${t}_id`] = id;
    if (name) payload.name = name;
    if (icon) payload.icon = icon;
    if (floor_id && t === "area") payload.floor_id = floor_id;
    if (aliases) payload.aliases = aliases;
    if (level !== undefined && t === "floor") payload.level = level;
    const result = await haWS(payload);
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_remove_area_or_floor", {
    type: z.enum(["area","floor"]),
    id: z.string().describe("area_id hoặc floor_id cần xóa"),
  }, async ({ type: t, id }) => {
    const result = await haWS({ type: `config/${t}_registry/delete`, [`${t}_id`]: id });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  // ── AUTOMATION ─────────────────────────────────────────────

  server.tool("ha_config_get_automation", {
    automation_id: z.string().optional().describe("entity_id hoặc unique_id. Bỏ = list tất cả."),
  }, async ({ automation_id }) => {
    if (!automation_id) {
      const result = await haWS({ type: "config/automation/list" });
      return { content: [{ type: "text", text: fmtJ((result || []).map(a => ({ id: a.id, alias: a.alias, mode: a.mode }))) }] };
    }
    const uid = automation_id.replace(/^automation\./, "");
    const result = await haWS({ type: "config/automation/config", config_id: uid });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_set_automation", {
    automation_id: z.string().optional().describe("unique_id hoặc entity_id để update. Bỏ = create mới."),
    config: z.record(z.any()).describe("Full automation config: {alias, triggers:[...], actions:[...], mode:'single'}"),
  }, async ({ automation_id, config }) => {
    if (automation_id) {
      const uid = automation_id.replace(/^automation\./, "");
      const result = await haWS({ type: "config/automation/update", config_id: uid, config });
      return { content: [{ type: "text", text: fmtJ(result) }] };
    }
    const result = await haWS({ type: "config/automation/create", config });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_remove_automation", {
    automation_id: z.string().describe("entity_id hoặc unique_id để xóa"),
  }, async ({ automation_id }) => {
    const uid = automation_id.replace(/^automation\./, "");
    const result = await haWS({ type: "config/automation/delete", config_id: uid });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_get_automation_traces", {
    automation_id: z.string().describe("entity_id, ví dụ automation.dieu_hoa_auto"),
    run_id: z.string().optional().describe("Specific run_id để xem chi tiết. Bỏ = list recent."),
    limit: z.number().int().optional().describe("Max traces (default 10)"),
  }, async ({ automation_id, run_id, limit = 10 }) => {
    const item_id = automation_id.replace(/^automation\./, "");
    if (run_id) {
      const result = await haWS({ type: "trace/get", domain: "automation", item_id, run_id });
      return { content: [{ type: "text", text: fmtJ(result) }] };
    }
    const result = await haWS({ type: "trace/list", domain: "automation", item_id });
    return { content: [{ type: "text", text: fmtJ((result || []).slice(0, limit)) }] };
  });

  // ── SCRIPT ─────────────────────────────────────────────────

  server.tool("ha_config_get_script", {
    script_id: z.string().optional().describe("script entity_id hoặc bare ID. Bỏ = list tất cả."),
  }, async ({ script_id }) => {
    if (!script_id) {
      const result = await haWS({ type: "config/script/list" });
      return { content: [{ type: "text", text: fmtJ((result || []).map(s => ({ id: s.id, alias: s.alias, mode: s.mode }))) }] };
    }
    const sid = script_id.replace(/^script\./, "");
    const result = await haWS({ type: "config/script/config", config_id: sid });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_set_script", {
    script_id: z.string().describe("Bare ID hoặc entity_id (script.xxx)"),
    config: z.record(z.any()).describe("{alias, sequence:[...], mode:'single', max_exceeded:'silent'}"),
  }, async ({ script_id, config }) => {
    const sid = script_id.replace(/^script\./, "");
    try {
      const result = await haWS({ type: "config/script/update", config_id: sid, config });
      return { content: [{ type: "text", text: fmtJ(result) }] };
    } catch {
      const result = await haWS({ type: "config/script/create", config_id: sid, config });
      return { content: [{ type: "text", text: fmtJ(result) }] };
    }
  });

  server.tool("ha_config_remove_script", {
    script_id: z.string().describe("Script entity_id hoặc bare ID"),
  }, async ({ script_id }) => {
    const sid = script_id.replace(/^script\./, "");
    const result = await haWS({ type: "config/script/delete", config_id: sid });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  // ── SCENE ──────────────────────────────────────────────────

  server.tool("ha_config_get_scene", {
    scene_id: z.string().optional().describe("scene entity_id. Bỏ = list tất cả."),
  }, async ({ scene_id }) => {
    if (!scene_id) {
      const result = await haWS({ type: "config/scene/list" });
      return { content: [{ type: "text", text: fmtJ(result) }] };
    }
    const sid = scene_id.replace(/^scene\./, "");
    const result = await haWS({ type: "config/scene/config", config_id: sid });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_set_scene", {
    scene_id: z.string().optional().describe("unique_id để update. Bỏ = create mới."),
    config: z.record(z.any()).describe("{name, entities: {entity_id: {state: 'on', ...}}}"),
  }, async ({ scene_id, config }) => {
    const result = scene_id
      ? await haWS({ type: "config/scene/update", config_id: scene_id, config })
      : await haWS({ type: "config/scene/create", config });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_remove_scene", {
    scene_id: z.string().describe("Scene unique_id hoặc entity_id"),
  }, async ({ scene_id }) => {
    const sid = scene_id.replace(/^scene\./, "");
    const result = await haWS({ type: "config/scene/delete", config_id: sid });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  // ── HELPERS ────────────────────────────────────────────────

  server.tool("ha_config_list_helpers", {
    helper_type: z.string().optional().describe("Lọc: input_boolean, input_number, input_text, input_select, input_datetime, counter, timer, schedule, group, utility_meter, derivative, min_max, threshold, statistics, trend, filter, tod, template. Bỏ = tất cả."),
  }, async ({ helper_type }) => {
    const allStates = await haREST("GET", "/api/states");
    const helperDomains = ["input_boolean","input_number","input_text","input_select","input_datetime","counter","timer","schedule","group","utility_meter","derivative","min_max","threshold","statistics","trend","filter","tod"];
    const domains = helper_type ? [helper_type] : helperDomains;
    const helpers = (allStates || [])
      .filter(s => domains.some(d => s.entity_id.startsWith(d + ".")))
      .map(s => ({ entity_id: s.entity_id, state: s.state, name: s.attributes?.friendly_name || "" }));
    return { content: [{ type: "text", text: `${helpers.length} helpers:\n` + fmtJ(helpers) }] };
  });

  server.tool("ha_config_set_helper", {
    helper_type: z.enum(["input_boolean","input_number","input_text","input_select","input_datetime","counter","timer","schedule"]).describe("Loại helper (simple types hỗ trợ qua WS)"),
    helper_id: z.string().optional().describe("entity_id để update. Bỏ = create mới."),
    config: z.record(z.any()).describe("Config tùy helper_type. input_boolean:{name}. input_number:{name,min,max,step}. input_text:{name,max}. input_select:{name,options:[...]}. counter:{name,initial,step,min,max}. timer:{name,duration}. schedule:{name}."),
  }, async ({ helper_type, helper_id, config }) => {
    if (helper_id) {
      const sid = helper_id.replace(new RegExp(`^${helper_type}\\.`), "");
      const result = await haWS({ type: `${helper_type}/update`, [`${helper_type}_id`]: sid, ...config });
      return { content: [{ type: "text", text: fmtJ(result) }] };
    }
    const result = await haWS({ type: `${helper_type}/create`, ...config });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_remove_helpers_integrations", {
    entry_id: z.string().describe("config_entry_id từ ha_get_integration. Dùng cho template/group/utility_meter và tất cả integration."),
    confirm: z.boolean().describe("Phải là true để xác nhận"),
  }, async ({ entry_id, confirm }) => {
    if (!confirm) return { content: [{ type: "text", text: "Truyền confirm:true để xác nhận xóa" }] };
    const result = await haWS({ type: "config_entries/remove", entry_id });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_list_groups", {}, async () => {
    const states = await haREST("GET", "/api/states");
    const groups = (states || []).filter(s => s.entity_id.startsWith("group."));
    return { content: [{ type: "text", text: fmtJ(groups.map(g => ({ entity_id: g.entity_id, state: g.state, members: g.attributes?.entity_id }))) }] };
  });

  // ── DASHBOARD / LOVELACE ───────────────────────────────────

  server.tool("ha_config_get_dashboard", {
    url_path: z.string().optional().describe("Dashboard url_path, ví dụ: lovelace, lovelace-mobile. Bỏ = list tất cả."),
    list_only: z.boolean().optional().describe("Chỉ list dashboards, không lấy config"),
    entity_id: z.string().optional().describe("Tìm cards dùng entity_id này"),
    card_type: z.string().optional().describe("Tìm cards theo type: tile, entities, glance, gauge..."),
  }, async ({ url_path, list_only, entity_id, card_type }) => {
    if (list_only || (!url_path && !entity_id && !card_type)) {
      const result = await haWS({ type: "lovelace/dashboards/list" });
      return { content: [{ type: "text", text: fmtJ(result) }] };
    }
    const config = await haWS({ type: "lovelace/config/get", url_path: url_path || null });
    if (entity_id || card_type) {
      function searchCards(cards, res = []) {
        for (const c of (cards || [])) {
          if (entity_id && (c.entity === entity_id || (c.entities || []).some(e => (typeof e === "string" ? e : e.entity) === entity_id))) res.push({ type: c.type, entity: c.entity });
          if (card_type && c.type === card_type) res.push(c);
          if (c.cards) searchCards(c.cards, res);
          if (c.card) searchCards([c.card], res);
        }
        return res;
      }
      const matches = [];
      for (const v of (config?.views || [])) searchCards(v.cards, matches);
      return { content: [{ type: "text", text: `${matches.length} cards:\n` + fmtJ(matches) }] };
    }
    return { content: [{ type: "text", text: fmtJ(config) }] };
  });

  server.tool("ha_config_set_dashboard", {
    url_path: z.string().optional().describe("Dashboard url_path. Bỏ = default lovelace."),
    config: z.record(z.any()).optional().describe("Full dashboard config {title, views:[...]}"),
    python_transform: z.string().optional().describe("JS expression mutate existing config. Ví dụ: config.views[0].title='New'"),
  }, async ({ url_path, config: newConfig, python_transform }) => {
    if (python_transform) {
      const config = await haWS({ type: "lovelace/config/get", url_path: url_path || null });
      // eslint-disable-next-line no-eval
      eval(python_transform);
      const result = await haWS({ type: "lovelace/config/save", url_path: url_path || null, config });
      return { content: [{ type: "text", text: fmtJ(result) }] };
    }
    const result = await haWS({ type: "lovelace/config/save", url_path: url_path || null, config: newConfig });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_delete_dashboard", {
    url_path: z.string().describe("Dashboard url_path cần xóa"),
    confirm: z.boolean().describe("Phải true để xác nhận"),
  }, async ({ url_path, confirm }) => {
    if (!confirm) return { content: [{ type: "text", text: "confirm:true để xác nhận" }] };
    const result = await haWS({ type: "lovelace/dashboards/delete", url_path });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_list_dashboard_resources", {}, async () => {
    const result = await haWS({ type: "lovelace/resources/list" });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_set_dashboard_resource", {
    resource_id: z.string().optional().describe("Resource ID để update. Bỏ = create."),
    url: z.string().describe("Resource URL, ví dụ: /hacsfiles/lovelace-card-mod/card-mod.js"),
    res_type: z.enum(["module","js","css","html"]).optional().describe("Default: module"),
  }, async ({ resource_id, url, res_type = "module" }) => {
    const result = resource_id
      ? await haWS({ type: "lovelace/resources/update", id: resource_id, res_type, url })
      : await haWS({ type: "lovelace/resources/create", res_type, url });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_delete_dashboard_resource", {
    resource_id: z.string().describe("Resource ID cần xóa"),
  }, async ({ resource_id }) => {
    const result = await haWS({ type: "lovelace/resources/delete", id: resource_id });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  // ── LABELS & CATEGORIES ────────────────────────────────────

  server.tool("ha_config_get_label", {
    label_id: z.string().optional().describe("Label ID. Bỏ = list tất cả."),
  }, async ({ label_id }) => {
    const result = await haWS({ type: "config/label_registry/list" });
    if (label_id) return { content: [{ type: "text", text: fmtJ((result || []).find(l => l.label_id === label_id) || "Not found") }] };
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_set_label", {
    label_id: z.string().optional().describe("Label ID để update. Bỏ = create."),
    name: z.string().describe("Display name"),
    color: z.string().optional().describe("Màu: red, blue, green, yellow, purple, orange, pink, indigo, teal, cyan"),
    icon: z.string().optional().describe("MDI icon"),
    description: z.string().optional(),
  }, async ({ label_id, name, color, icon, description }) => {
    const payload = { name };
    if (color) payload.color = color;
    if (icon) payload.icon = icon;
    if (description) payload.description = description;
    const result = label_id
      ? await haWS({ type: "config/label_registry/update", label_id, ...payload })
      : await haWS({ type: "config/label_registry/create", ...payload });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_remove_label", {
    label_id: z.string().describe("Label ID cần xóa"),
  }, async ({ label_id }) => {
    const result = await haWS({ type: "config/label_registry/delete", label_id });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_get_category", {
    scope: z.string().describe("Scope: automation, script, scene, helpers"),
    category_id: z.string().optional().describe("Category ID. Bỏ = list tất cả."),
  }, async ({ scope, category_id }) => {
    const result = await haWS({ type: "config/category_registry/list", scope });
    if (category_id) return { content: [{ type: "text", text: fmtJ((result || []).find(c => c.category_id === category_id) || "Not found") }] };
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_set_category", {
    scope: z.string().describe("Scope: automation, script, scene, helpers"),
    category_id: z.string().optional().describe("Category ID để update. Bỏ = create."),
    name: z.string().describe("Display name"),
    icon: z.string().optional(),
  }, async ({ scope, category_id, name, icon }) => {
    const result = category_id
      ? await haWS({ type: "config/category_registry/update", scope, category_id, name, icon })
      : await haWS({ type: "config/category_registry/create", scope, name, icon });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_config_remove_category", {
    scope: z.string(), category_id: z.string(),
  }, async ({ scope, category_id }) => {
    const result = await haWS({ type: "config/category_registry/delete", scope, category_id });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  // ── ADDON MANAGEMENT ───────────────────────────────────────

  server.tool("ha_get_addon", {
    slug: z.string().optional().describe("Addon slug để lấy chi tiết. Dùng ha_addon_list để tìm slug. Bỏ = list installed."),
    source: z.enum(["installed","available"]).optional().describe("installed (default) hoặc available (store)"),
    include_stats: z.boolean().optional().describe("Kèm CPU/RAM stats"),
    query: z.string().optional().describe("Search query cho available addons"),
  }, async ({ slug, source = "installed", include_stats, query }) => {
    if (slug) {
      const r = await haREST("GET", `/api/hassio/addons/${slug}/info`);
      if (include_stats) {
        const stats = await haREST("GET", `/api/hassio/addons/${slug}/stats`);
        return { content: [{ type: "text", text: fmtJ({ ...r?.data, stats: stats?.data }) }] };
      }
      return { content: [{ type: "text", text: fmtJ(r?.data || r) }] };
    }
    const endpoint = source === "available" ? "/api/hassio/store" : "/api/hassio/addons";
    const r = await haREST("GET", endpoint);
    let addons = r?.data?.addons || [];
    if (query) addons = addons.filter(a => a.name.toLowerCase().includes(query.toLowerCase()));
    return { content: [{ type: "text", text: fmtJ(addons.map(a => ({ slug: a.slug, name: a.name, state: a.state, version: a.version, update_available: a.update_available }))) }] };
  });

  server.tool("ha_manage_addon", {
    slug: z.string().describe("Addon slug, ví dụ: core_mosquitto, 5c53de3b_esphome, core_mariadb"),
    action: z.enum(["install","uninstall","start","stop","restart","update","rebuild"]).optional().describe("Lifecycle action"),
    options: z.record(z.any()).optional().describe("Config options"),
    auto_update: z.boolean().optional(),
    boot: z.enum(["auto","manual"]).optional(),
    watchdog: z.boolean().optional(),
    path: z.string().optional().describe("Proxy API path, ví dụ: /api/events"),
    method: z.string().optional().describe("HTTP method cho proxy (default GET)"),
    body: z.record(z.any()).optional(),
  }, async ({ slug, action, options, auto_update, boot, watchdog, path: proxyPath, method = "GET", body }) => {
    if (action) {
      const r = await haREST("POST", `/api/hassio/addons/${slug}/${action}`);
      return { content: [{ type: "text", text: fmtJ(r) }] };
    }
    if (options !== undefined || auto_update !== undefined || boot || watchdog !== undefined) {
      const data = {};
      if (options) data.options = options;
      if (auto_update !== undefined) data.auto_update = auto_update;
      if (boot) data.boot = boot;
      if (watchdog !== undefined) data.watchdog = watchdog;
      const r = await haREST("POST", `/api/hassio/addons/${slug}/options`, data);
      return { content: [{ type: "text", text: fmtJ(r) }] };
    }
    if (proxyPath) {
      const r = await haREST(method, `/api/hassio/addons/${slug}/api${proxyPath}`, body);
      return { content: [{ type: "text", text: fmtJ(r) }] };
    }
    return { content: [{ type: "text", text: "Cần action, options, hoặc path" }] };
  });

  // ── SYSTEM & HEALTH ────────────────────────────────────────

  server.tool("ha_get_overview", {
    fields: z.array(z.string()).optional().describe("Giới hạn fields: system_info, domain_stats, repairs"),
  }, async ({ fields }) => {
    const [states, config] = await Promise.all([
      haREST("GET", "/api/states"),
      haREST("GET", "/api/config"),
    ]);
    const repairs = await haREST("GET", "/api/repairs/issues?include_dismissed=false").catch(() => ({}));
    const domains = {};
    for (const s of (states || [])) { const d = s.entity_id.split(".")[0]; domains[d] = (domains[d] || 0) + 1; }
    const result = {
      system_info: { version: config?.version, location_name: config?.location_name, timezone: config?.time_zone, total_entities: (states || []).length },
      domain_stats: domains,
      repairs: (repairs?.issues || []).map(r => ({ domain: r.domain, severity: r.severity, title: r.title })),
    };
    if (fields) { const f = {}; for (const k of fields) if (result[k]) f[k] = result[k]; return { content: [{ type: "text", text: fmtJ(f) }] }; }
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  server.tool("ha_get_system_health", {
    include: z.string().optional().describe("Extras: config_check, repairs, dead_entities. Comma-separated."),
    include_dismissed_repairs: z.boolean().optional().describe("Include dismissed repairs (default false)"),
  }, async ({ include, include_dismissed_repairs = false }) => {
    const parts = (include || "").split(",").map(s => s.trim()).filter(Boolean);
    const results = {};
    results.system_health = await haWS({ type: "system_health/info" });
    if (parts.includes("config_check")) results.config_check = await haREST("POST", "/api/config/core/check_config");
    if (parts.includes("repairs")) {
      const dismissed = include_dismissed_repairs ? "true" : "false";
      const r = await haREST("GET", `/api/repairs/issues?include_dismissed=${dismissed}`);
      const allIssues = r?.issues || [];
      const active = allIssues.filter(i => !i.dismissed);
      const dismissed_list = allIssues.filter(i => i.dismissed);
      results.repairs = { issues: active, count: active.length, dismissed_count: dismissed_list.length };
    }
    if (parts.includes("dead_entities")) {
      // Tier-based dead entity detection — mirrors ha:ha_get_system_health(dead_entities)
      // Tier 1: config_entry_orphans — entity has config_entry_id but that entry no longer exists
      // Tier 2: stale_restored — entity restored from registry on startup but integration no longer provides it
      //         (state=unavailable AND has "restored" attribute OR state machine has it as unavailable+restored)
      const [states, registry, configEntries] = await Promise.all([
        haREST("GET", "/api/states"),
        haWS({ type: "config/entity_registry/list" }),
        haWS({ type: "config_entries/get" }),
      ]);
      const stateMap = new Map((states || []).map(s => [s.entity_id, s]));
      const liveEntryIds = new Set((configEntries || []).map(e => e.entry_id));

      // Platforms that ALWAYS have null config_entry_id (YAML-native) — not orphans
      const YAML_PLATFORMS = new Set([
        "template", "command_line", "rest", "group", "derivative", "min_max",
        "threshold", "statistics", "trend", "filter", "tod", "generic_thermostat",
        "generic_hygrostat", "automation", "script", "scene", "schedule",
        "input_boolean", "input_number", "input_text", "input_select",
        "input_datetime", "counter", "timer", "person", "zone", "tag",
        "sun", "homeassistant", "persistent_notification",
        "smartir", "am_lich", "proxmox", "utility_meter",
      ]);

      const config_entry_orphans = [];
      const stale_restored = [];

      for (const entry of (registry || [])) {
        const eid = entry.entity_id;
        const stateObj = stateMap.get(eid);
        const hasState = stateObj !== undefined;
        const state = stateObj?.state;
        const isRestored = stateObj?.attributes?.restored === true;

        // Tier 1: has config_entry_id but entry is gone from live set
        if (entry.config_entry_id && !liveEntryIds.has(entry.config_entry_id)) {
          config_entry_orphans.push({ entity_id: eid, platform: entry.platform, config_entry_id: entry.config_entry_id });
          continue;
        }

        // Tier 2: stale_restored
        // Criteria: entity in registry + (no state in machine OR state=unavailable with restored flag)
        // Exclude: unknown state, YAML-native platforms, entities that are simply offline
        if (!hasState && entry.config_entry_id && !YAML_PLATFORMS.has(entry.platform)) {
          stale_restored.push({ entity_id: eid, platform: entry.platform, config_entry_id: entry.config_entry_id });
          continue;
        }
        if (hasState && (state === "unavailable") && isRestored && entry.config_entry_id) {
          stale_restored.push({ entity_id: eid, platform: entry.platform, config_entry_id: entry.config_entry_id });
        }
        // automation platform + no config_entry_id + not in state machine = stale automation entity
        if (!hasState && entry.platform === "automation" && !entry.config_entry_id) {
          stale_restored.push({ entity_id: eid, platform: entry.platform, config_entry_id: null });
        }
      }

      results.dead_entities = {
        config_entry_orphans: { items: config_entry_orphans, count: config_entry_orphans.length },
        stale_restored: { items: stale_restored, count: stale_restored.length },
        summary: {
          candidate_total: config_entry_orphans.length + stale_restored.length,
          registry_total: (registry || []).length,
        },
        note: "config_entry_orphans = integration removed; stale_restored = integration exists but no longer provides entity. Remove confirmed-dead entities with ha_remove_entity.",
      };
    }
    return { content: [{ type: "text", text: fmtJ(results) }] };
  });

  server.tool("ha_reload_core", {
    target: z.enum(["automation","script","template","scene","group","input_boolean","input_number","input_text","input_select","input_datetime","counter","timer","schedule","zone","person","themes","core"]).optional()
      .describe("Reload target. 'core'=restart HA. Bỏ = reload automation+script+template."),
  }, async ({ target }) => {
    const reloads = target ? [target] : ["automation","script","template"];
    for (const t of reloads) {
      if (t === "core") await haREST("POST", "/api/services/homeassistant/restart");
      else await haREST("POST", `/api/services/${t}/reload`).catch(() => {});
    }
    return { content: [{ type: "text", text: `Reload done: ${reloads.join(", ")}` }] };
  });

  server.tool("ha_restart", {
    confirm: z.boolean().describe("Phải là true"),
  }, async ({ confirm }) => {
    if (!confirm) return { content: [{ type: "text", text: "confirm:true để restart HA" }] };
    await haREST("POST", "/api/services/homeassistant/restart");
    return { content: [{ type: "text", text: "HA restart initiated" }] };
  });

  server.tool("ha_get_updates", {}, async () => {
    const states = await haREST("GET", "/api/states");
    const updates = (states || []).filter(s => s.entity_id.startsWith("update.") && s.state === "on");
    return { content: [{ type: "text", text: fmtJ(updates.map(u => ({ entity_id: u.entity_id, name: u.attributes?.friendly_name, installed: u.attributes?.installed_version, latest: u.attributes?.latest_version }))) }] };
  });

  // ── HA LOGS (WS/REST based) ────────────────────────────────

  server.tool("ha_get_logs_ws", {
    source: z.enum(["error_log","system","logbook","supervisor"]).optional().describe("error_log (default), system=structured, logbook=entity events, supervisor=addon logs"),
    level: z.enum(["ERROR","WARNING","INFO","DEBUG"]).optional(),
    lines: z.number().int().optional().describe("Số dòng (default 100)"),
    slug: z.string().optional().describe("Addon slug cho source=supervisor"),
    entity_id: z.string().optional().describe("Entity filter cho logbook"),
    hours_back: z.number().int().optional().describe("Logbook: số giờ lùi (default 1)"),
    search: z.string().optional().describe("Text filter"),
  }, async ({ source = "error_log", level, lines = 100, slug, entity_id, hours_back = 1, search }) => {
    if (source === "supervisor" && slug) {
      const r = await haREST("GET", `/api/hassio/addons/${slug}/logs`);
      const text = typeof r === "string" ? r : fmtJ(r);
      const filtered = text.split("\n").filter(l => !search || l.includes(search)).slice(-lines).join("\n");
      return { content: [{ type: "text", text: filtered }] };
    }
    if (source === "system") {
      const r = await haWS({ type: "system_log/list" });
      let entries = r || [];
      // Level filter: WARNING → include WARNING + ERROR; ERROR → ERROR only; no filter = all
      const LEVEL_ORDER = { "DEBUG": 0, "INFO": 1, "WARNING": 2, "ERROR": 3, "CRITICAL": 4 };
      if (level) {
        const minLevel = LEVEL_ORDER[level] ?? 0;
        entries = entries.filter(e => (LEVEL_ORDER[e.level] ?? 0) >= minLevel);
      }
      if (search) entries = entries.filter(e => JSON.stringify(e).toLowerCase().includes(search.toLowerCase()));
      // system_log/list returns oldest-first — reverse to get newest first, then slice
      const sorted = [...entries].reverse().slice(0, lines);
      // Format human-readable
      const formatted = sorted.map(e => {
        const ts = e.timestamp ? new Date(e.timestamp * 1000).toISOString().replace("T"," ").slice(0,19) : "?";
        const src = Array.isArray(e.source) ? e.source.join(":") : (e.source || "");
        const msg = Array.isArray(e.message) ? e.message[0] : (e.message || "");
        const cnt = e.count > 1 ? ` [x${e.count}]` : "";
        return `${ts} ${e.level.padEnd(8)} ${src}\n  ${msg}${cnt}`;
      }).join("\n");
      return { content: [{ type: "text", text: formatted || "(no entries)" }] };
    }
    if (source === "logbook") {
      const startTime = new Date(Date.now() - hours_back * 3600000).toISOString();
      let path2 = `/api/logbook/${startTime}`;
      if (entity_id) path2 += `?entity_id=${entity_id}`;
      const r = await haREST("GET", path2);
      let entries = Array.isArray(r) ? r : [];
      if (search) entries = entries.filter(e => JSON.stringify(e).includes(search));
      return { content: [{ type: "text", text: fmtJ(entries.slice(-lines)) }] };
    }
    const r = await haREST("GET", "/api/error_log");
    let text = typeof r === "string" ? r : fmtJ(r);
    if (level) text = text.split("\n").filter(l => l.includes(level)).join("\n");
    if (search) text = text.split("\n").filter(l => l.includes(search)).join("\n");
    return { content: [{ type: "text", text: text.split("\n").slice(-lines).join("\n") }] };
  });

  // ── INTEGRATION ────────────────────────────────────────────

  server.tool("ha_get_integration", {
    entry_id: z.string().optional().describe("Config entry ID cho single detail"),
    domain: z.string().optional().describe("Lọc domain: zha, esphome, mqtt, frigate, sonoff..."),
    include_options: z.boolean().optional().describe("Kèm options/config data"),
  }, async ({ entry_id, domain }) => {
    const entries = await haWS({ type: "config_entries/get" });
    if (entry_id) return { content: [{ type: "text", text: fmtJ((entries || []).find(e => e.entry_id === entry_id) || "Not found") }] };
    let filtered = entries || [];
    if (domain) filtered = filtered.filter(e => e.domain === domain);
    return { content: [{ type: "text", text: fmtJ(filtered.map(e => ({ entry_id: e.entry_id, domain: e.domain, title: e.title, state: e.state, disabled_by: e.disabled_by }))) }] };
  });

  server.tool("ha_set_integration_enabled", {
    entry_id: z.string().describe("Config entry ID"),
    enabled: z.boolean().describe("true=enable, false=disable"),
  }, async ({ entry_id, enabled }) => {
    const type2 = enabled ? "config_entries/enable" : "config_entries/disable";
    const result = await haWS({ type: type2, entry_id });
    return { content: [{ type: "text", text: fmtJ(result) }] };
  });

  // ── BACKUP ─────────────────────────────────────────────────

  server.tool("ha_manage_backup", {
    scope: z.enum(["snapshot","edits"]),
    action: z.enum(["create","list","restore","delete"]),
    backup_id: z.string().optional(),
    name: z.string().optional(),
    limit: z.number().int().optional().describe("Default 20"),
  }, async ({ scope, action, backup_id, name, limit = 20 }) => {
    if (scope === "snapshot") {
      if (action === "list") {
        const r = await haREST("GET", "/api/hassio/backups");
        return { content: [{ type: "text", text: fmtJ((r?.data?.backups || []).slice(0, limit).map(b => ({ slug: b.slug, name: b.name, date: b.date, size: b.size }))) }] };
      }
      if (action === "create") {
        const r = await haREST("POST", "/api/hassio/backups/new/full", { name: name || `Backup_${new Date().toISOString().slice(0,10)}` });
        return { content: [{ type: "text", text: fmtJ(r) }] };
      }
      if (action === "restore" && backup_id) {
        const r = await haREST("POST", `/api/hassio/backups/${backup_id}/restore/full`);
        return { content: [{ type: "text", text: fmtJ(r) }] };
      }
    }
    return { content: [{ type: "text", text: `scope=${scope} action=${action}: dùng ha_run cho edits scope` }] };
  });

  // ── HACS ───────────────────────────────────────────────────

  server.tool("ha_get_hacs_info", {
    action: z.enum(["search","info"]),
    query: z.string().optional(),
    category: z.enum(["integration","lovelace","theme","appdaemon","python_script"]).optional(),
    installed_only: z.boolean().optional(),
    repository_id: z.string().optional().describe("Numeric HACS ID hoặc owner/repo"),
    max_results: z.number().int().optional().describe("Default 10"),
  }, async ({ action, query = "", category, installed_only, repository_id, max_results = 10 }) => {
    if (action === "info" && repository_id) {
      const r = await haWS({ type: "hacs/repository/info", repository_id });
      return { content: [{ type: "text", text: fmtJ(r) }] };
    }
    const r = await haWS({ type: "hacs/repositories/list" });
    let repos = r || [];
    if (category) repos = repos.filter(x => x.category === category);
    if (installed_only) repos = repos.filter(x => x.installed);
    if (query) repos = repos.filter(x => (x.full_name + " " + (x.description || "")).toLowerCase().includes(query.toLowerCase()));
    return { content: [{ type: "text", text: fmtJ(repos.slice(0, max_results).map(x => ({ id: x.id, name: x.full_name, category: x.category, installed: x.installed, installed_version: x.installed_version, available_version: x.available_version }))) }] };
  });

  server.tool("ha_manage_hacs", {
    action: z.enum(["download","add_repository"]),
    repository_id: z.string().optional(),
    repository: z.string().optional().describe("owner/repo cho add_repository"),
    category: z.string().optional(),
    version: z.string().optional(),
  }, async ({ action, repository_id, repository, category, version }) => {
    if (action === "add_repository") {
      const r = await haWS({ type: "hacs/repository/add", repository, category });
      return { content: [{ type: "text", text: fmtJ(r) }] };
    }
    const r = await haWS({ type: "hacs/repository/download", repository_id, version });
    return { content: [{ type: "text", text: fmtJ(r) }] };
  });

  // ── ZONES, TODO, BLUEPRINT ─────────────────────────────────

  server.tool("ha_get_zone", {
    zone_id: z.string().optional().describe("Zone ID. Bỏ = list tất cả."),
  }, async ({ zone_id }) => {
    const r = await haWS({ type: "config/zone/list" });
    if (zone_id) return { content: [{ type: "text", text: fmtJ((r || []).find(z2 => z2.id === zone_id) || "Not found") }] };
    return { content: [{ type: "text", text: fmtJ(r) }] };
  });

  server.tool("ha_set_zone", {
    zone_id: z.string().optional().describe("Zone ID để update. Bỏ = create."),
    name: z.string().optional(), latitude: z.number().optional(), longitude: z.number().optional(),
    radius: z.number().optional(), icon: z.string().optional(), passive: z.boolean().optional(),
  }, async ({ zone_id, ...data }) => {
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    const r = zone_id
      ? await haWS({ type: "config/zone/update", id: zone_id, ...data })
      : await haWS({ type: "config/zone/create", ...data });
    return { content: [{ type: "text", text: fmtJ(r) }] };
  });

  server.tool("ha_remove_zone", {
    zone_id: z.string(),
  }, async ({ zone_id }) => {
    const r = await haWS({ type: "config/zone/delete", id: zone_id });
    return { content: [{ type: "text", text: fmtJ(r) }] };
  });

  server.tool("ha_get_todo", {
    entity_id: z.string().optional().describe("Todo list entity_id. Bỏ = list tất cả todo lists."),
    status: z.enum(["needs_action","completed"]).optional(),
  }, async ({ entity_id, status }) => {
    if (!entity_id) {
      const states = await haREST("GET", "/api/states");
      const todos = (states || []).filter(s => s.entity_id.startsWith("todo.")).map(s => ({ entity_id: s.entity_id, name: s.attributes?.friendly_name, incomplete: s.state }));
      return { content: [{ type: "text", text: fmtJ(todos) }] };
    }
    const r = await haWS({ type: "todo/item/list", entity_id, ...(status ? { status: [status] } : {}) });
    return { content: [{ type: "text", text: fmtJ(r) }] };
  });

  server.tool("ha_set_todo_item", {
    entity_id: z.string(), item: z.string().describe("UID hoặc summary text"),
    summary: z.string().optional(), status: z.enum(["needs_action","completed"]).optional(),
    description: z.string().optional(), due: z.string().optional(),
  }, async ({ entity_id, item, ...changes }) => {
    const r = await haWS({ type: "todo/item/update", entity_id, uid: item, ...changes });
    return { content: [{ type: "text", text: fmtJ(r) }] };
  });

  server.tool("ha_remove_todo_item", {
    entity_id: z.string(), item: z.string().describe("UID hoặc exact summary text"),
  }, async ({ entity_id, item }) => {
    const r = await haWS({ type: "todo/item/delete", entity_id, uids: [item] });
    return { content: [{ type: "text", text: fmtJ(r) }] };
  });

  server.tool("ha_get_blueprint", {
    domain: z.enum(["automation","script"]).optional().describe("Default: automation"),
    path: z.string().optional().describe("Blueprint path cho single detail"),
  }, async ({ domain = "automation", path }) => {
    const r = await haWS({ type: "blueprint/list", domain });
    if (path) return { content: [{ type: "text", text: fmtJ((r || {})[path] || "Not found") }] };
    const list = Object.entries(r || {}).map(([p, b]) => ({ path: p, name: b.metadata?.name }));
    return { content: [{ type: "text", text: fmtJ(list) }] };
  });

  server.tool("ha_import_blueprint", {
    url: z.string().describe("URL blueprint, ví dụ: https://community.home-assistant.io/.../xxx.yaml"),
    domain: z.enum(["automation","script"]).optional().describe("Default: automation"),
  }, async ({ url, domain = "automation" }) => {
    const r = await haWS({ type: "blueprint/import", url, domain });
    return { content: [{ type: "text", text: fmtJ(r) }] };
  });

  // ── MISC ───────────────────────────────────────────────────

  server.tool("ha_get_camera_image", {
    entity_id: z.string().describe("Camera entity_id, ví dụ: camera.frigate_front_door"),
  }, async ({ entity_id }) => {
    return { content: [{ type: "text", text: `Camera snapshot URL:\n${HA_BASE}/api/camera_proxy/${entity_id}\nAuthorization: Bearer ${haToken().slice(0,30)}...` }] };
  });

  server.tool("ha_manage_theme", {
    action: z.enum(["list","set"]),
    theme_name: z.string().optional().describe("Tên theme. 'default' để reset."),
    mode: z.enum(["light","dark"]).optional().describe("Default: light"),
  }, async ({ action, theme_name, mode = "light" }) => {
    if (action === "list") {
      const r = await haWS({ type: "frontend/get_themes" });
      return { content: [{ type: "text", text: Object.keys(r?.themes || {}).join("\n") }] };
    }
    await haREST("POST", "/api/services/frontend/set_theme", { name: theme_name || "default", mode });
    return { content: [{ type: "text", text: `Theme set: ${theme_name} (${mode})` }] };
  });

  server.tool("ha_manage_pipeline", {
    action: z.enum(["list","get","create","update","delete"]),
    pipeline_id: z.string().optional(),
    config: z.record(z.any()).optional(),
  }, async ({ action, pipeline_id, config }) => {
    if (action === "list") return { content: [{ type: "text", text: fmtJ(await haWS({ type: "assist_pipeline/pipeline/list" })) }] };
    if (action === "get") return { content: [{ type: "text", text: fmtJ(await haWS({ type: "assist_pipeline/pipeline/get", pipeline_id })) }] };
    if (action === "delete") return { content: [{ type: "text", text: fmtJ(await haWS({ type: "assist_pipeline/pipeline/delete", pipeline_id })) }] };
    const t2 = action === "create" ? "assist_pipeline/pipeline/create" : "assist_pipeline/pipeline/update";
    const r = await haWS({ type: t2, ...(pipeline_id ? { pipeline_id } : {}), ...config });
    return { content: [{ type: "text", text: fmtJ(r) }] };
  });

  server.tool("ha_manage_energy_prefs", {
    action: z.enum(["get","update"]).describe("get=xem config, update=cập nhật"),
    config: z.record(z.any()).optional().describe("Energy config object (cho update)"),
  }, async ({ action, config }) => {
    if (action === "get") {
      const r = await haWS({ type: "energy/get_prefs" });
      return { content: [{ type: "text", text: fmtJ(r) }] };
    }
    const r = await haWS({ type: "energy/save_prefs", ...config });
    return { content: [{ type: "text", text: fmtJ(r) }] };
  });

  server.tool("ha_get_entity_exposure", {
    entity_id: z.string().optional().describe("Entity ID cụ thể. Bỏ = list tất cả."),
  }, async ({ entity_id }) => {
    const r = await haWS({ type: "homeassistant/expose_entity/list" }).catch(() => null);
    if (!r) return { content: [{ type: "text", text: "Exposure API not available" }] };
    const entries = Array.isArray(r) ? r : (r?.exposed_entities || []);
    if (entity_id) return { content: [{ type: "text", text: fmtJ(entries.filter(e => e.entity_id === entity_id)) }] };
    return { content: [{ type: "text", text: fmtJ(entries) }] };
  });

  server.tool("ha_get_hacs_installed", {}, async () => {
    const r = await haWS({ type: "hacs/repositories/list" });
    const installed = (r || []).filter(x => x.installed);
    return { content: [{ type: "text", text: fmtJ(installed.map(x => ({ name: x.full_name, category: x.category, version: x.installed_version, available: x.available_version, pending_update: x.pending_upgrade }))) }] };
  });

  server.tool("ha_install_mcp_tools", {
    action: z.enum(["check","install"]).describe("check=kiểm tra, install=cài ha_mcp_tools custom component"),
  }, async ({ action }) => {
    if (action === "check") {
      const r = await haWS({ type: "config_entries/get" });
      const installed = (r || []).filter(e => e.domain === "ha_mcp_tools");
      return { content: [{ type: "text", text: installed.length ? `ha_mcp_tools installed: ${fmtJ(installed)}` : "ha_mcp_tools NOT installed" }] };
    }
    return { content: [{ type: "text", text: "Để install ha_mcp_tools: dùng ha_manage_hacs(action='download', repository_id='ha-mcp-tools')" }] };
  });

  server.tool("ha_report_issue", {
    integration: z.string().optional().describe("Integration domain để collect diagnostics"),
    config_entry_id: z.string().optional(),
  }, async ({ integration, config_entry_id }) => {
    const [health, config, entries] = await Promise.all([
      haWS({ type: "system_health/info" }),
      haREST("GET", "/api/config"),
      haWS({ type: "config_entries/get" }),
    ]);
    const filteredEntries = config_entry_id
      ? (entries || []).filter(e => e.entry_id === config_entry_id)
      : (entries || []).filter(e => !integration || e.domain === integration);
    return { content: [{ type: "text", text: fmtJ({ ha_version: config?.version, system_health: health, entries: filteredEntries }) }] };
  });

  server.tool("ha_config_set_yaml", {
    yaml_path: z.string().describe("Top-level YAML key: command_line, shell_command, rest, notify, knx..."),
    action: z.enum(["add","replace","remove"]),
    content: z.string().optional().describe("YAML content (required cho add/replace)"),
    file: z.string().optional().describe("Relative path trong /config, default: configuration.yaml"),
  }, async ({ yaml_path, action, content, file = "configuration.yaml" }) => {
    // Dùng ha_run SSH vì cần file system access
    const script = `
import re, os, shutil
from datetime import datetime
path = '/config/${file}'
bak = f'/config/.mcp_backups/' + os.path.basename(path) + '.' + datetime.now().strftime('%Y%m%d_%H%M%S') + '.bak'
os.makedirs('/config/.mcp_backups', exist_ok=True)
if os.path.exists(path): shutil.copy2(path, bak)
with open(path, 'r') as f: raw = f.read()
if '${action}' == 'remove':
    raw2 = re.sub(r'^${yaml_path}:.*?(?=^\\w|\\Z)', '', raw, flags=re.MULTILINE|re.DOTALL)
    with open(path, 'w') as f: f.write(raw2)
    print('Removed:', '${yaml_path}')
else:
    c = """${(content || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n")}"""
    block = '${yaml_path}:\\n' + '\\n'.join('  ' + l for l in c.strip().split('\\n'))
    if '${action}' == 'replace' and '${yaml_path}:' in raw:
        raw2 = re.sub(r'^${yaml_path}:.*?(?=^\\w|\\Z)', block + '\\n', raw, flags=re.MULTILINE|re.DOTALL)
    else:
        raw2 = raw.rstrip() + '\\n\\n' + block + '\\n'
    with open(path, 'w') as f: f.write(raw2)
    print('${action}:', '${yaml_path}')
`;
    const b64 = Buffer.from(script).toString("base64");
    const out = await runSSH("root", HA, `echo '${b64}' | base64 -d | python3`, HA_PORT);
    return { content: [{ type: "text", text: out }] };
  });

  server.tool("ha_get_skill_guide", {
    topic: z.string().optional().describe("Topic: automation, template, helper, dashboard, script, yaml, best-practices"),
  }, async ({ topic }) => {
    const guides = {
      automation: "Dùng ha_config_get_automation → ha_config_set_automation. python_transform cho surgical edit (cần automation_id). Triggers/conditions/actions native tốt hơn template.",
      template: "Test bằng ha_eval_template trước. Templates chỉ dùng trong data.* fields. Tránh template trong condition/trigger — dùng state/numeric_state/time native.",
      helper: "ha_config_set_helper cho 8 simple types qua WS. Template/group/utility_meter: dùng ha_call_service hoặc config_entries flow.",
      dashboard: "ha_config_get_dashboard (list/get/search), ha_config_set_dashboard (python_transform cho surgical). ha_config_list_dashboard_resources cho custom cards.",
      script: "ha_config_get_script + ha_config_set_script. Scripts dùng 'sequence', không phải 'triggers'. mode:single + max_exceeded:silent cho wait_for_trigger.",
      yaml: "ha_config_set_yaml cho YAML-only integrations (command_line, shell_command, rest, notify, knx). Backup tự động trước khi sửa.",
      "best-practices": "1) Audit trước, sửa sau. 2) safe_write: backup+atomic. 3) Verify: ha_reload_core + ha_get_logs_ws. 4) mode:single trên scripts có wait_for_trigger. 5) base64-pipe cho complex shell.",
    };
    if (topic && guides[topic]) return { content: [{ type: "text", text: guides[topic] }] };
    return { content: [{ type: "text", text: "Topics: " + Object.keys(guides).join(", ") + "\n\nHa 1 tools: pve_run, dsm_run, dsm_sudo_run, ha_run, ssh_run, ct_exec, smart_check, balloon_status, fstrim_all, fstrim_status, system_overview, pve_logs, dsm_logs, ha_logs, ha_addon_list, ha_addon_logs, ha_config_check + 50+ HA native tools" }] };
  });


  return server;
}

// ---------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------
function json(res, code, obj, headers) {
  res.writeHead(code, Object.assign({ "Content-Type": "application/json" }, headers || {}));
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise(resolve => {
    let data = "";
    req.on("data", c => (data += c));
    req.on("end", () => resolve(data));
  });
}

function parseBody(req, raw) {
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (ct.indexOf("application/json") !== -1) {
    try { return JSON.parse(raw || "{}"); } catch (e) { return {}; }
  }
  const out = {};
  try {
    const sp = new URLSearchParams(raw || "");
    for (const pair of sp.entries()) out[pair[0]] = pair[1];
  } catch (e) {}
  return out;
}

function escapeHtml(s) {
  const str = String(s === undefined || s === null ? "" : s);
  return str.replace(/[&<>"']/g, function (c) {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === "\"") return "&quot;";
    return "&#39;";
  });
}

function renderAuthorizeForm(params, error) {
  let hidden = "";
  for (const k in params) {
    if (k === "password") continue;
    hidden += `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(params[k])}">\n`;
  }
  const errBlock = error ? `<p style="color:#c00">${escapeHtml(error)}</p>` : "";
  return `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Homelab MCP - Authorize</title></head>
<body style="font-family:system-ui,sans-serif;max-width:380px;margin:60px auto;padding:0 16px">
<h3>Homelab MCP</h3>
<p style="color:#555">Enter the access token to authorize this connection.</p>
${errBlock}
<form method="POST" action="/authorize">
${hidden}<input type="password" name="password" placeholder="Access token" autofocus style="width:100%;box-sizing:border-box;padding:10px;font-size:16px;margin-bottom:10px">
<button type="submit" style="width:100%;padding:10px;font-size:16px;cursor:pointer">Authorize</button>
</form>
</body></html>`;
}

// ---------------------------------------------------------------------
// HTTP server: MCP transport + OAuth (password-gated)
// ---------------------------------------------------------------------
const httpServer = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, BASE_URL);
  const path = url.pathname;
  const effectiveBase = getBaseUrl(req);

  if (path.indexOf("/.well-known/oauth-protected-resource") === 0) {
    return json(res, 200, { resource: effectiveBase, authorization_servers: [effectiveBase] });
  }
  if (path.indexOf("/.well-known/oauth-authorization-server") === 0 || path.indexOf("/.well-known/openid-configuration") === 0) {
    return json(res, 200, {
      issuer: effectiveBase,
      authorization_endpoint: `${effectiveBase}/authorize`,
      token_endpoint: `${effectiveBase}/token`,
      registration_endpoint: `${effectiveBase}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"]
    });
  }

  if (path === "/register" && req.method === "POST") {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || "{}"); } catch (e) {}
    const client_id = "client_" + crypto.randomBytes(8).toString("hex");
    return json(res, 201, {
      client_id: client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: body.redirect_uris || [],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"]
    });
  }

  if (path === "/authorize" && req.method === "GET") {
    const params = Object.fromEntries(url.searchParams);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderAuthorizeForm(params, null));
    return;
  }

  if (path === "/authorize" && req.method === "POST") {
    const raw = await readBody(req);
    const params = parseBody(req, raw);
    if (!AUTH_PASSWORD || params.password !== AUTH_PASSWORD) {
      res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderAuthorizeForm(params, "Incorrect token, please try again."));
      return;
    }
    const code = crypto.randomBytes(16).toString("hex");
    pendingCodes[code] = {
      code_challenge: params.code_challenge || null,
      code_challenge_method: params.code_challenge_method || "plain",
      expires: Date.now() + CODE_TTL_MS,
      used: false
    };
    const redirect_uri = params.redirect_uri;
    const state = params.state;
    if (redirect_uri) {
      const sep = redirect_uri.indexOf("?") !== -1 ? "&" : "?";
      const loc = redirect_uri + sep + "code=" + code + (state ? "&state=" + encodeURIComponent(state) : "");
      res.writeHead(302, { Location: loc });
      res.end();
      return;
    }
    return json(res, 200, { code: code, state: state });
  }

  if (path === "/token" && req.method === "POST") {
    const raw = await readBody(req);
    const params = parseBody(req, raw);
    const code = params.code;
    const entry = code ? pendingCodes[code] : null;
    if (!entry || entry.used || entry.expires < Date.now()) {
      return json(res, 400, { error: "invalid_grant" });
    }
    if (entry.code_challenge) {
      const verifier = params.code_verifier || "";
      let check;
      if (entry.code_challenge_method === "S256") {
        check = crypto.createHash("sha256").update(verifier).digest("base64url");
      } else {
        check = verifier;
      }
      if (check !== entry.code_challenge) {
        return json(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
      }
    }
    entry.used = true;
    const token = "tok_" + crypto.randomBytes(24).toString("hex");
    tokens[token] = { issued: Date.now() }; saveTokens();
    return json(res, 200, { access_token: token, token_type: "Bearer", expires_in: Math.floor(TOKEN_TTL_MS / 1000) });
  }

  if (req.method === "GET" && path === "/health") {
    return json(res, 200, { status: "ok", server: "homelab-mcp", version: "1.2.0" });
  }

  const authHeader = req.headers["authorization"] || "";
  const bearer = authHeader.indexOf("Bearer ") === 0 ? authHeader.slice(7) : null;
  const tok = bearer ? tokens[bearer] : null;
  if (!tok || Date.now() - tok.issued > TOKEN_TTL_MS) {
    res.writeHead(401, {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${effectiveBase}/.well-known/oauth-protected-resource"`
    });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  // ── /merged aggregator ──
  if (path.startsWith("/merged")) {
    try {
      const raw = await readBody(req);
      let body = {};
      try { body = JSON.parse(raw || "{}"); } catch {}
      const mcpMethod = body.method || "";

      if (mcpMethod === "initialize" || mcpMethod === "notifications/initialized") {
        return json(res, 200, { jsonrpc: "2.0", id: body.id, result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "homelab-merged-mcp", version: "1.0.0" }
        }});
      }

      if (mcpMethod === "tools/list") {
        const [selfTools, haTools] = await Promise.all([
          parseSseTools(fetch(`http://127.0.0.1:${PORT}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json, text/event-stream",
              "Authorization": req.headers["authorization"] || "",
            },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
            signal: AbortSignal.timeout(10000),
          })),
          getHaMcpTools(),
        ]);
        return json(res, 200, { jsonrpc: "2.0", id: body.id, result: { tools: [...selfTools, ...haTools] } });
      }

      if (mcpMethod === "tools/call") {
        const toolName = (body.params && body.params.name) || "";
        const toolArgs = (body.params && body.params.arguments) || {};

        if (toolName.startsWith("ha__")) {
          // Route → ha-mcp-dev backend
          const originalName = toolName.slice(4);
          const sessionId = req.headers["mcp-session-id"] || null;
          const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": `Bearer ${HA_MCP_TOKEN}`,
          };
          if (sessionId) headers["Mcp-Session-Id"] = sessionId;
          const r = await fetch(HA_MCP_URL, {
            method: "POST", headers,
            body: JSON.stringify({ jsonrpc: "2.0", id: body.id || 1, method: "tools/call", params: { name: originalName, arguments: toolArgs } }),
            signal: AbortSignal.timeout(30000),
          });
          const text = await r.text();
          for (const line of text.split("\n")) {
            const t = line.trim();
            if (t.startsWith("data:")) {
              try {
                const d = JSON.parse(t.slice(5).trim());
                if (d.result) return json(res, 200, { jsonrpc: "2.0", id: body.id, result: d.result });
                if (d.error)  return json(res, 200, { jsonrpc: "2.0", id: body.id, error: d.error });
              } catch {}
            }
          }
          return json(res, 200, { jsonrpc: "2.0", id: body.id, error: { code: -32603, message: "No response from ha-mcp backend" } });
        } else {
          // Route → Ha 1 self
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
          res.on("close", () => { transport.close().catch(() => {}); });
          const server = buildMcpServer();
          await server.connect(transport);
          await transport.handleRequest(req, res, body);
          return;
        }
      }

      return json(res, 200, { jsonrpc: "2.0", id: body.id, result: {} });
    } catch (err) {
      if (!res.headersSent) json(res, 500, { error: String(err) });
    }
    return;
  }
  // ── end /merged ──

  try {
    const raw = await readBody(req);
    let body = {};
    try { body = JSON.parse(raw || "{}"); } catch (e) {}
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close().catch(() => {}); });
    const server = buildMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    if (!res.headersSent) json(res, 500, { error: String(err) });
  }
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Homelab MCP server v1.2.0 listening on :${PORT}, base ${BASE_URL}`);
  if (!AUTH_PASSWORD) {
    console.warn("WARNING: MCP_AUTH_TOKEN is not set in environment -- /authorize will reject ALL requests!");
  }
});
