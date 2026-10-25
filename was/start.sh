#!/bin/bash
# ========================================================
# Script khởi động WAS Backend (Node.js)
# ========================================================

APP_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$APP_DIR"

# 1. Kiểm tra node_modules
if [ ! -d "$APP_DIR/node_modules" ]; then
    echo "⚠️  Chưa tìm thấy node_modules, tiến hành chạy 'npm install'..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 'npm install' thất bại. Vui lòng kiểm tra lại kết nối mạng hoặc bộ nhớ."
        exit 1
    fi
fi

# 2. Xác định thư mục log có quyền ghi
LOG_DIR="/var/log/node"
if ! mkdir -p "$LOG_DIR" 2>/dev/null || ! touch "$LOG_DIR/.write_test" 2>/dev/null; then
    LOG_DIR="$APP_DIR/logs"
    mkdir -p "$LOG_DIR"
else
    rm -f "$LOG_DIR/.write_test"
fi
LOG_FILE="$LOG_DIR/was-backend.log"

# 3. Kiểm tra xem app đã chạy chưa
PID=$(ps -ef | grep "node server.js" | grep -v grep | awk '{print $2}')

if [ -n "$PID" ]; then
    echo "⚠️  WAS Backend is already running with PID: $PID"
    exit 0
fi

echo "🚀 Starting WAS Backend..."
nohup node server.js > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo $NEW_PID > "$APP_DIR/app.pid"

# Chờ 1.5 giây để kiểm tra tiến trình có sống không
sleep 1.5
if ps -p $NEW_PID > /dev/null 2>&1; then
    echo "✅ WAS Backend started successfully (PID: $NEW_PID)"
    echo "📄 Log file: $LOG_FILE"
    echo "👉 Xem log: tail -f $LOG_FILE"
else
    echo "❌ Failed to start WAS Backend."
    echo "----------------------------------------"
    echo "📋 Chi tiết lỗi từ log ($LOG_FILE):"
    if [ -f "$LOG_FILE" ]; then
        cat "$LOG_FILE"
    else
        echo "(Không tìm thấy file log hoặc không có quyền ghi file)"
    fi
    echo "----------------------------------------"
    echo "👉 Mẹo: Hãy thử chạy lệnh 'node server.js' trực tiếp để xem lỗi cụ thể."
    exit 1
fi
