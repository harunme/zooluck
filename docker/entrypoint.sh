#!/bin/sh
set -e

echo "🚀 Starting ZooLuck Application..."

# 检查数据目录
if [ ! -d "/app/server/data" ]; then
    echo "📁 Creating data directory..."
    mkdir -p /app/server/data
fi

# 启动 Nginx（后台）
echo "🌐 Starting Nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

# 启动后端服务（后台）
echo "🔧 Starting Backend Server..."
cd /app/server
npm start &
BACKEND_PID=$!

# 等待服务启动
echo "⏳ Waiting for services to start..."
sleep 5

# 健康检查
for i in {1..10}; do
    if wget --quiet --tries=1 --spider http://localhost/health; then
        echo "✅ Services are healthy!"
        break
    fi
    echo "⏳ Waiting... ($i/10)"
    sleep 3
done

# 保持容器运行
echo "🎉 Application is running!"
echo "   Frontend: http://localhost"
echo "   Backend API: http://localhost/api"

# 等待任一进程退出
wait $NGINX_PID $BACKEND_PID
