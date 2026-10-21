#!/bin/sh
set -eu
mkdir -p /app/server/data
nginx -g 'daemon off;' &
NGINX_PID=$!
cd /app/server
node src/index.js &
BACKEND_PID=$!
terminate() {
    exit_code=${1:-0}
    trap - TERM INT
    kill -TERM "$BACKEND_PID" "$NGINX_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
    wait "$NGINX_PID" 2>/dev/null || true
    exit "$exit_code"
}
trap 'terminate 0' TERM INT
attempt=0
healthy=false
while [ "$attempt" -lt 30 ]; do
    if ! kill -0 "$BACKEND_PID" 2>/dev/null || ! kill -0 "$NGINX_PID" 2>/dev/null; then
        terminate 1
    fi
    if wget -q -T 2 --spider http://127.0.0.1/health; then
        healthy=true
        break
    fi
    attempt=$((attempt + 1))
    sleep 1
done
if [ "$healthy" != true ]; then
    echo 'Backend readiness check failed' >&2
    terminate 1
fi
echo 'ZooLuck is ready'
while kill -0 "$BACKEND_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
    sleep 1
done
terminate 1
