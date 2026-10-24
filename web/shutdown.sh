#!/bin/bash
# ========================================================
# Script dừng WEB Frontend (Node.js)
# ========================================================

APP_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$APP_DIR"

PID=""

# 1. Tìm PID từ file app.pid nếu có
if [ -f "$APP_DIR/app.pid" ]; then
    PID=$(cat "$APP_DIR/app.pid")
fi

# 2. Nếu file không có hoặc PID không đúng, tìm qua lệnh ps
if [ -z "$PID" ] || ! ps -p "$PID" > /dev/null 2>&1; then
    PID=$(ps -ef | grep "node server.js" | grep "$APP_DIR" | grep -v grep | awk '{print $2}')
fi
if [ -z "$PID" ] || ! ps -p "$PID" > /dev/null 2>&1; then
    PID=$(ps -ef | grep "node server.js" | grep -v grep | awk '{print $2}')
fi

if [ -z "$PID" ]; then
    echo "⚠️  WEB Frontend daemon was not started."
else
    echo "🛑 Killing WEB Frontend (PID: $PID) ..."
    kill $PID

    # Chờ tiến trình dừng hẳn trong tối đa 5 giây
    for i in {1..5}; do
        if ! ps -p $PID > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    # Nếu sau 5 giây vẫn chưa tắt thì force kill (-9)
    if ps -p $PID > /dev/null 2>&1; then
        echo "⚠️  Process didn't stop, force killing $PID ..."
        kill -9 $PID
    fi

    rm -f "$APP_DIR/app.pid"
    echo "✅ WEB Frontend daemon has been shutdown."
fi
