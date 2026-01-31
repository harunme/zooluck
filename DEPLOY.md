# 🚀 Docker 部署指南

## 📋 部署环境

- **目标服务器**: 172.30.234.193
- **部署方式**: Docker + Docker Compose
- **架构**: Nginx (前端) + Node.js (后端)

## 📦 部署文件说明

| 文件 | 说明 |
|------|------|
| `Dockerfile` | Docker 镜像构建文件 |
| `docker-compose.yml` | Docker Compose 编排文件 |
| `docker/nginx.conf` | Nginx 配置文件 |
| `docker/entrypoint.sh` | 容器启动脚本 |
| `deploy.sh` | 自动化部署脚本 |
| `.dockerignore` | Docker 构建忽略文件 |

## 🚀 快速部署

### 前置要求

1. **本地环境**:
   - Docker 已安装
   - SSH 访问目标服务器的权限
   - 项目代码已克隆

2. **服务器环境** (172.30.234.193):
   - Docker 已安装
   - Docker Compose 已安装
   - 端口 80 可用

### 安装 Docker（服务器端）

如果服务器未安装 Docker，执行以下命令：

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 安装 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 一键部署

```bash
# 完整部署流程
./deploy.sh deploy
```

这会自动执行以下操作：
1. ✅ 检查 Docker 环境
2. ✅ 备份当前版本
3. ✅ 构建 Docker 镜像
4. ✅ 上传到服务器
5. ✅ 停止旧容器
6. ✅ 启动新容器
7. ✅ 健康检查
8. ✅ 清理临时文件

## 🔧 部署脚本命令

| 命令 | 说明 |
|------|------|
| `./deploy.sh build` | 仅构建 Docker 镜像 |
| `./deploy.sh deploy` | 完整部署流程 |
| `./deploy.sh quick` | 快速部署（跳过构建） |
| `./deploy.sh backup` | 仅备份当前版本 |
| `./deploy.sh logs` | 查看容器日志 |
| `./deploy.sh health` | 健康检查 |
| `./deploy.sh clean` | 清理本地构建文件 |

## 📁 部署目录结构

```
服务器目录: /opt/zooluck
├── zooluck.tar.gz          # Docker 镜像文件
├── docker-compose.yml       # 编排文件
└── data/                    # 数据持久化目录
    └── zooluck.db          # SQLite 数据库
```

## 🔍 验证部署

### 1. 检查容器状态

```bash
ssh root@172.30.234.193
docker ps
```

应该看到 `zooluck-app` 容器正在运行。

### 2. 访问应用

- **前端**: http://172.30.234.193
- **API**: http://172.30.234.193/api
- **健康检查**: http://172.30.234.193/health

### 3. 查看日志

```bash
# 本地执行
./deploy.sh logs

# 或直接在服务器上
ssh root@172.30.234.193
docker logs -f zooluck-app
```

## 🔄 更新部署

当需要更新应用时：

```bash
# 1. 修改代码
# 2. 提交代码到仓库（可选）
# 3. 执行部署
./deploy.sh deploy
```

部署脚本会自动：
- 备份当前版本到 `/opt/zooluck_backup_<timestamp>`
- 部署新版本
- 保留数据库数据

## 🗑️ 回滚部署

如果新版本有问题，可以回滚：

```bash
ssh root@172.30.234.193

# 查看备份
ls -la /opt/ | grep zooluck_backup

# 恢复备份（示例）
cd /opt/zooluck_backup_20240131_120000
docker load < zooluck.tar.gz
docker-compose up -d
```

## 📊 监控和维护

### 查看资源使用

```bash
ssh root@172.30.234.193
docker stats zooluck-app
```

### 重启容器

```bash
ssh root@172.30.234.193
cd /opt/zooluck
docker-compose restart
```

### 备份数据库

```bash
ssh root@172.30.234.193
cp /opt/zooluck/data/zooluck.db /opt/zooluck_backup/zooluck_$(date +%Y%m%d).db
```

## 🔐 安全建议

1. **修改 JWT Secret**:
   编辑 `server/.env.production` 中的 `JWT_SECRET` 为强随机字符串。

2. **使用 HTTPS**:
   配置 SSL 证书，修改 `docker/nginx.conf` 添加 443 端口配置。

3. **防火墙设置**:
   ```bash
   # 只允许必要端口
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw enable
   ```

4. **定期备份**:
   设置定时任务自动备份数据库。

## 🐛 故障排除

### 容器无法启动

```bash
# 查看容器日志
docker logs zooluck-app

# 检查端口占用
netstat -tlnp | grep :80
```

### 端口冲突

修改 `docker-compose.yml` 中的端口映射：
```yaml
ports:
  - "8080:80"  # 改为其他端口
```

### 数据库权限问题

```bash
ssh root@172.30.234.193
chmod 755 /opt/zooluck/data
chmod 644 /opt/zooluck/data/zooluck.db
```

### 部署失败

检查 SSH 连接：
```bash
ssh root@172.30.234.193 "echo 'Connection OK'"
```

## 📞 支持

如有问题，请检查：
1. Docker 日志
2. Nginx 日志: `/var/log/nginx/`
3. 应用日志: `docker logs zooluck-app`
