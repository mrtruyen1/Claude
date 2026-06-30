#!/usr/bin/env bash
# Cài đặt Telegram Claude Bot lên Linux/Proxmox
set -euo pipefail

INSTALL_DIR="/opt/telegram-claude-bot"
SERVICE_NAME="telegram-claude-bot"

echo "==> Tạo thư mục cài đặt: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

echo "==> Sao chép file bot"
cp bot.py requirements.txt "$INSTALL_DIR/"

echo "==> Tạo virtual environment"
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --upgrade pip -q
"$INSTALL_DIR/venv/bin/pip" install -r requirements.txt -q

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    echo "==> Tạo file .env từ mẫu — hãy điền thông tin vào!"
    cp .env.example "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"
    echo ""
    echo "  QUAN TRỌNG: Mở file sau và điền token/key:"
    echo "  nano $INSTALL_DIR/.env"
    echo ""
fi

echo "==> Cài đặt systemd service"
cp telegram-claude-bot.service "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo ""
echo "✓ Cài đặt xong!"
echo ""
echo "Bước tiếp theo:"
echo "  1. Điền thông tin vào: nano $INSTALL_DIR/.env"
echo "  2. Khởi động bot:      systemctl start $SERVICE_NAME"
echo "  3. Xem log:            journalctl -u $SERVICE_NAME -f"
