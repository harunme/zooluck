#!/bin/bash

echo "🚀 启动大连森林动物园..."
echo ""

# 设置项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 安装依赖
echo "📦 安装服务器依赖..."
cd "$PROJECT_ROOT/server"
npm install > /dev/null 2>&1

echo "📦 安装客户端依赖..."
cd "$PROJECT_ROOT/client"
npm install > /dev/null 2>&1

# 构建前端应用
echo "🔨 构建前端应用..."
npm run build > /dev/null 2>&1

# 启动后端服务（同时提供前端和游戏文件）
echo "⚙️  启动服务器 (端口 3001)..."
cd "$PROJECT_ROOT/server"
npm start &
SERVER_PID=$!

echo ""
echo "✅ 系统启动完成!"
echo ""
echo "📍 访问地址："
echo "   - 管理后台: http://localhost:3001"
echo "   - 游戏中心: http://localhost:3001/games/"
echo "   - API: http://localhost:3001/api"
echo ""
echo "🔑 默认登录凭证:"
echo "   - 用户名: admin"
echo "   - 密码: admin"
echo ""
echo "⌛ 按 Ctrl+C 停止服务..."
echo ""

# 等待进程
wait $SERVER_PID

