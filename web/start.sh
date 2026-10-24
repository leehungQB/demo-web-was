#!/bin/bash
# ========================================================
# Script khởi động WEB Frontend (Node.js)
# ========================================================

APP_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$APP_DIR"

# Thư mục chứa log (Ưu tiên /var/log/node, nếu không có quyền sẽ lưu tại ./logs)
LOG_DIR="/var/log/node"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/web-frontend.log"

# Kiểm tra xem app đã chạy chưa
PID=$(ps -ef | grep "node server.js" | grep "$APP_DIR" | grep -v grep | awk '{print $2}')
if [ -z "$PID" ]; then
    PID=$(ps -ef | grep "node server.js" | grep -v grep | awk '{print $2}')
fi

if [ -n "$PID" ]; then
    echo "⚠️  WEB Frontend is already running with PID: $PID"
    exit 0
fi

echo "🚀 Starting WEB Frontend..."
nohup node server.js > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo $NEW_PID > "$APP_DIR/app.pid"

# Chờ 1 giây để kiểm tra tiến trình có sống không
sleep 1
if ps -p $NEW_PID > /dev/null 2>&1; then
    echo "✅ WEB Frontend started successfully (PID: $NEW_PID)"
    echo "📄 Log file: $LOG_FILE"
    echo "👉 Xem log: tail -f $LOG_FILE"
else
    echo "❌ Failed to start WEB Frontend. Check log at: $LOG_FILE"
    exit 1
fi
