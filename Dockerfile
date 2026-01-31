# 多阶段构建 - 后端
FROM node:18-alpine AS backend-builder

WORKDIR /app/server

# 复制后端依赖文件
COPY server/package*.json ./

# 安装后端依赖
RUN npm ci --only=production

# 复制后端源代码
COPY server/src ./src
COPY server/.env.example ./.env

# 多阶段构建 - 前端
FROM node:18-alpine AS frontend-builder

WORKDIR /app/client

# 复制前端依赖文件
COPY client/package*.json ./

# 安装前端依赖
RUN npm ci

# 复制前端源代码
COPY client/public ./public
COPY client/src ./src

# 构建前端应用
RUN npm run build

# 生产环境镜像
FROM node:18-alpine

WORKDIR /app

# 安装 nginx（用于静态文件服务）
RUN apk add --no-cache nginx

# 从后端构建阶段复制文件
COPY --from=backend-builder /app/server/package*.json ./server/
COPY --from=backend-builder /app/server/node_modules ./server/node_modules
COPY --from=backend-builder /app/server/src ./server/src

# 从前端构建阶段复制构建产物
COPY --from=frontend-builder /app/client/build ./client/build

# 复制游戏文件
COPY games ./games

# 复制 Nginx 配置文件
COPY docker/nginx.conf /etc/nginx/nginx.conf

# 创建数据目录
RUN mkdir -p /app/server/data

# 暴露端口
EXPOSE 80 443

# 启动脚本
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

CMD ["/app/entrypoint.sh"]
