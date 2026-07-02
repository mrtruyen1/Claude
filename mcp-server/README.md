# Homelab MCP Server — CT102 (192.168.31.26)

Snapshot mã nguồn MCP server đang chạy tại `/opt/mcp-server/server.js` trên CT102 (systemd unit `mcp-server.service`, Node v22+, port 3456, Tailscale Funnel `https://mcp-server.tail1105f.ts.net`).

- **v1.2.0 (2026-07-02):** 17 tool PVE/DSM/HA + aggregator `/merged` (ha-mcp-dev). Fix smart_check +NVMe, VM list động, secrets → `.env`. Thêm `backup_status`, `journal_errors`, `security_check`.
- Secrets nằm trong `/opt/mcp-server/.env` (MCP_AUTH_TOKEN, HA_TOKEN, HA_MCP_URL, HA_MCP_TOKEN) — KHÔNG commit.
- Deploy: chép `server.js` lên CT102, `node --check server.js`, rồi `systemctl restart mcp-server` (dùng `systemd-run --on-active=2` nếu restart từ chính MCP).
- md5 bản đang chạy khớp bản này: `d4cf4412669fd0ede1916af8e0360c87`.
