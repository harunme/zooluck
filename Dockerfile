FROM node:18-alpine

# 安装 nginx 和 ImageMagick（用于静态文件服务和图片压缩）
RUN apk add --no-cache nginx imagemagick

# 配置 ImageMagick
COPY .imagemagick /etc/ImageMagick-7/policy.xml

WORKDIR /app

# 配置 npm 使用国内镜像源
RUN npm config set registry https://registry.npmmirror.com

# 复制前端依赖文件
COPY client/package*.json ./client/

# 安装前端依赖
RUN cd /app/client && npm install

# 复制前端源代码
COPY client/public ./client/public
COPY client/src ./client/src

# 构建前端应用
RUN cd /app/client && npm run build

# 复制游戏文件
COPY games ./games

# 复制图片压缩脚本并设置权限
COPY docker/compress-images.sh /app/compress-images.sh
RUN chmod +x /app/compress-images.sh

# 压缩图片资源
RUN /app/compress-images.sh

# 复制后端依赖文件
COPY server/package*.json ./server/

# 安装后端依赖
RUN cd /app/server && npm install --only=production

# 复制后端源代码
COPY server/src ./server/src

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
