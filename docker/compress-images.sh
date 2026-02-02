#!/bin/sh
set -e

echo "🖼️  Compressing images in games and client directories..."

# 检查是否安装了 ImageMagick
if ! command -v convert >/dev/null 2>&1; then
    echo "❌ ImageMagick not found. Installing..."
    apk add --no-cache imagemagick
fi

# 压缩 games 目录中的 PNG 图片
echo "📁 Compressing PNG images in games directory..."
find /app/games -type f \( -name "*.png" -o -name "*.PNG" \) | while read -r img; do
    echo "  Compressing: $img"
    # 使用 pngquant 压缩（如果可用），否则使用 ImageMagick
    if command -v pngquant >/dev/null 2>&1; then
        pngquant --quality=80-95 --ext .png --force "$img"
    else
        convert "$img" -quality 85 -strip "$img.tmp" && mv "$img.tmp" "$img"
    fi
done

# 压缩 games 目录中的 JPG/JPEG 图片
echo "📁 Compressing JPG images in games directory..."
find /app/games -type f \( -name "*.jpg" -o -name "*.JPG" -o -name "*.jpeg" -o -name "*.JPEG" \) | while read -r img; do
    echo "  Compressing: $img"
    convert "$img" -quality 85 -strip "$img.tmp" && mv "$img.tmp" "$img"
done

# 压缩 client 目录中的图片（构建后的静态资源）
echo "📁 Compressing images in client build directory..."
if [ -d "/app/client/build" ]; then
    find /app/client/build -type f \( -name "*.png" -o -name "*.PNG" -o -name "*.jpg" -o -name "*.JPG" -o -name "*.jpeg" -o -name "*.JPEG" \) | while read -r img; do
        echo "  Compressing: $img"
        if command -v pngquant >/dev/null 2>&1 && echo "$img" | grep -qi "\.png$"; then
            pngquant --quality=80-95 --ext .png --force "$img"
        else
            convert "$img" -quality 85 -strip "$img.tmp" && mv "$img.tmp" "$img"
        fi
    done
fi

# 压缩 GIF 图片（优化帧）
echo "📁 Optimizing GIF images in games directory..."
find /app/games -type f \( -name "*.gif" -o -name "*.GIF" \) | while read -r img; do
    echo "  Optimizing: $img"
    # 使用 gifsicle 优化 GIF
    if command -v gifsicle >/dev/null 2>&1; then
        gifsicle -O3 --lossy=30 --colors 256 "$img" -o "$img.tmp" && mv "$img.tmp" "$img"
    else
        convert "$img" -coalesce -layers Optimize "$img.tmp" && mv "$img.tmp" "$img"
    fi
done

echo "✅ Image compression completed!"
