#!/bin/bash

# ZooLuck Docker 部署脚本
# 目标服务器：172.30.234.193

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
SERVER_USER="root"
SERVER_HOST="172.30.234.193"
SERVER_DIR="/opt/zooluck"
DOCKER_IMAGE_NAME="zooluck"
DOCKER_CONTAINER_NAME="zooluck-app"

# 打印带颜色的信息
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Docker 是否安装
check_docker() {
    info "Checking Docker installation..."
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed locally"
        exit 1
    fi
    info "Docker is installed: $(docker --version)"
}

# 构建 Docker 镜像
build_image() {
    info "Building Docker image..."
    docker build -t $DOCKER_IMAGE_NAME:latest .
    info "Docker image built successfully!"
}

# 导出 Docker 镜像
export_image() {
    info "Exporting Docker image..."
    docker save $DOCKER_IMAGE_NAME:latest | gzip > zooluck.tar.gz
    info "Image exported to zooluck.tar.gz"
}

# 上传到服务器
upload_to_server() {
    info "Uploading to server $SERVER_HOST..."
    
    # 检查 SSH 连接
    if ! ssh -o ConnectTimeout=5 $SERVER_USER@$SERVER_HOST echo "SSH connection successful"; then
        error "Cannot connect to server $SERVER_HOST"
        exit 1
    fi
    
    # 创建远程目录
    ssh $SERVER_USER@$SERVER_HOST "mkdir -p $SERVER_DIR"
    
    # 上传镜像
    scp zooluck.tar.gz $SERVER_USER@$SERVER_HOST:$SERVER_DIR/
    
    # 上传部署脚本
    scp docker-compose.yml $SERVER_USER@$SERVER_HOST:$SERVER_DIR/
    
    info "Upload completed!"
}

# 在服务器上部署
deploy_on_server() {
    info "Deploying on server..."
    
    ssh $SERVER_USER@$SERVER_HOST << ENDSSH
set -e

# 进入部署目录
cd $SERVER_DIR

# 加载 Docker 镜像
echo "Loading Docker image..."
docker load < zooluck.tar.gz

# 停止并删除旧容器
echo "Stopping old container..."
if docker ps -a | grep -q $DOCKER_CONTAINER_NAME; then
    docker stop $DOCKER_CONTAINER_NAME || true
    docker rm $DOCKER_CONTAINER_NAME || true
fi

# 启动新容器
echo "Starting new container..."
docker-compose up -d

# 查看容器状态
echo "Container status:"
docker ps | grep $DOCKER_CONTAINER_NAME || echo "Container not running"

echo ""
echo "✅ Deployment completed!"
echo "Application URL: http://$SERVER_HOST"
ENDSSH
}

# 备份当前版本
backup_current() {
    info "Creating backup..."
    ssh $SERVER_USER@$SERVER_HOST << ENDSSH
cd $SERVER_DIR
BACKUP_DIR="\${SERVER_DIR}_backup_\$(date +%Y%m%d_%H%M%S)"
if [ -d "$SERVER_DIR" ]; then
    mkdir -p $BACKUP_DIR
    cp -r $SERVER_DIR/* $BACKUP_DIR/ 2>/dev/null || true
    echo "Backup created at: $BACKUP_DIR"
fi
ENDSSH
}

# 查看日志
view_logs() {
    info "Viewing container logs..."
    ssh $SERVER_USER@$SERVER_HOST "docker logs -f $DOCKER_CONTAINER_NAME"
}

# 健康检查
health_check() {
    info "Performing health check..."
    sleep 5
    
    if curl -f -s http://$SERVER_HOST/health > /dev/null; then
        info "✅ Health check passed!"
    else
        warn "⚠️  Health check failed, but deployment may still be successful"
        warn "   Check logs: ./deploy.sh logs"
    fi
}

# 显示帮助信息
show_help() {
    cat << EOF
ZooLuck Docker 部署脚本

用法: ./deploy.sh [选项]

选项:
    build       构建 Docker 镜像
    deploy      完整部署流程（构建 + 上传 + 部署）
    quick       快速部署（使用已构建的镜像）
    backup      仅备份当前版本
    logs        查看容器日志
    health      健康检查
    clean       清理本地构建文件
    help        显示帮助信息

示例:
    ./deploy.sh deploy          # 完整部署
    ./deploy.sh quick           # 快速部署
    ./deploy.sh logs            # 查看日志

服务器: $SERVER_HOST
部署目录: $SERVER_DIR
EOF
}

# 清理构建文件
clean_build() {
    info "Cleaning build files..."
    rm -f zooluck.tar.gz
    info "Clean completed!"
}

# 主流程
main() {
    case "${1:-deploy}" in
        build)
            check_docker
            build_image
            export_image
            ;;
        deploy)
            check_docker
            backup_current
            build_image
            export_image
            upload_to_server
            deploy_on_server
            health_check
            clean_build
            ;;
        quick)
            check_docker
            backup_current
            export_image
            upload_to_server
            deploy_on_server
            health_check
            clean_build
            ;;
        backup)
            backup_current
            ;;
        logs)
            view_logs
            ;;
        health)
            health_check
            ;;
        clean)
            clean_build
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
}

# 运行主流程
main "$@"
