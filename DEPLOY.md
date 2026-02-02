# ZooLuck 部署说明

## 前置要求

- 服务器已安装 Docker 和 Docker Compose
- 服务器端口 80 和 443 可访问

## 部署步骤

### 1. 克隆仓库

```bash
git clone <repository-url>
cd zooluck
```

### 2. 启动服务

```bash
docker-compose up -d
```

### 3. 查看日志

```bash
docker-compose logs -f
```

### 4. 访问应用

- 管理后台: http://your-server-ip
- API: http://your-server-ip/api
- 健康检查: http://your-server-ip/health

## 常用命令

```bash
# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 重新构建并启动
docker-compose up -d --build
```

## 数据持久化

以下目录会持久化到宿主机：
- `./data` - 数据库文件
- `./logs` - Nginx 日志

## 默认登录凭证

- 用户名: admin
- 密码: admin
