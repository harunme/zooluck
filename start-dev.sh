#!/bin/bash

echo "🚀 启动开发环境..."
echo ""

# 设置项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 启动后端服务（开发模式）
echo "⚙️  启动后端服务 (端口 3001，开发模式)..."
cd "$PROJECT_ROOT/server"
npm run dev &
SERVER_PID=$!

# 等待后端启动
sleep 2

# 启动前端应用
echo "🎨 启动前端应用 (端口 3000，开发模式)..."
cd "$PROJECT_ROOT/client"
npm start &
CLIENT_PID=$!

echo ""
echo "✅ 开发环境启动完成!"
echo ""
echo "📍 访问地址："
echo "   - 管理后台: http://localhost:3000"
echo "   - 后端 API: http://localhost:3001/api"
echo "   - 游戏中心: http://localhost:3000/games/"
echo ""
echo "🔑 默认登录凭证:"
echo "   - 用户名: admin"
echo "   - 密码: admin"
echo ""
echo "📝 中奖记录页面: http://localhost:3000 -> 点击"中奖记录"选项卡"
echo ""
echo "✋ 按 Ctrl+C 停止所有服务..."
echo ""

# 处理 Ctrl+C
trap "kill $SERVER_PID $CLIENT_PID" EXIT

# 等待进程
wait $SERVER_PID $CLIENT_PID
