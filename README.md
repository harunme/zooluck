# 🎁 AI无界 智享未来

一个现代化的B/S架构AI无界 智享未来，包含后端API服务和前端管理界面，以及H5游戏集成。

## ✨ 最新更新

### 中奖记录 API 对接完成！ ✅

前端中奖记录页面已完全对接后端 API，支持：
- 📋 实时获取中奖记录列表
- 🔍 按奖品名称搜索
- 📅 按年份筛选
- ✏️ 编辑记录数量
- 🗑️ 删除记录
- 📄 分页显示

**快速开始：**
```bash
bash start-dev.sh
```

**查看详细文档：**
- 📖 [快速开始指南](./QUICK_START.md)
- 📖 [完整使用手册](./RECORDS_API_README.md)
- 📖 [集成配置指南](./INTEGRATION_GUIDE.md)
- 📖 [实现总结报告](./IMPLEMENTATION_SUMMARY.md)

---

## 📁 项目结构

```
project-root/
├── client/                 # 前端React应用
│   ├── public/
│   ├── src/
│   │   ├── components/     # 组件目录
│   │   ├── pages/          # 页面目录
│   │   └── App.js
│   └── package.json
├── server/                 # Node.js后端服务
│   ├── src/
│   │   ├── routes/         # API路由
│   │   │   ├── prizes.js
│   │   │   ├── records.js
│   │   │   └── settings.js
│   │   └── index.js
│   └── package.json
├── games/                  # H5游戏文件
│   ├── index.html          # 游戏中心入口
│   ├── lucky-draw/         # 幸运抽奖
│   ├── scratch-card/       # 刮刮乐
│   └── spin-wheel/         # 转盘游戏
└── README.md
```

## 🚀 快速开始

### 环境要求
- Node.js >= 14.0.0
- npm >= 6.0.0 或 yarn >= 1.22.0

### 1. 安装服务器依赖

```bash
cd server
npm install
```

### 2. 安装客户端依赖

```bash
cd client
npm install
```

### 3. 启动服务

#### 启动后端服务器（在项目根目录或server目录）

```bash
cd server
npm run dev          # 开发模式（支持热重载）
# 或
npm start            # 生产模式
```

服务器将运行在 `http://localhost:3001`

#### 启动前端应用（在client目录新开终端）

```bash
cd client
npm start
```

前端应用将运行在 `http://localhost:3000`

## 📝 API 端点

### 奖品管理
- `GET /api/prizes` - 获取所有奖品
- `GET /api/prizes/:id` - 获取单个奖品
- `POST /api/prizes` - 创建奖品
- `PUT /api/prizes/:id` - 更新奖品
- `DELETE /api/prizes/:id` - 删除奖品

### 中奖记录
- `GET /api/records` - 获取所有记录
- `GET /api/records/:id` - 获取单个记录
- `POST /api/records` - 创建记录
- `PUT /api/records/:id` - 更新记录
- `DELETE /api/records/:id` - 删除记录

### 系统设置
- `GET /api/settings` - 获取设置
- `PUT /api/settings` - 更新设置
- `POST /api/settings/verify` - 验证兑奖密码
- `DELETE /api/settings` - 清除设置

## 🎮 H5游戏

### 游戏中心
访问 `http://localhost:3000/games/` 查看所有可用游戏

### 可用游戏
1. **幸运抽奖** - `/games/lucky-draw/`
   - 选择幸运号码进行抽奖
   - 概率为70%中奖

2. **刮刮乐** - `/games/scratch-card/`
   - 刮卡片揭露奖品
   - 刮开50%卡片即可完全揭露

3. **转盘游戏** - `/games/spin-wheel/`
   - 转动转盘赢取大奖
   - 8个奖品等级

## 🎯 主要功能

### 后端功能
- ✅ RESTful API服务
- ✅ 奖品CRUD操作
- ✅ 中奖记录管理
- ✅ 系统设置管理
- ✅ 密码验证功能
- ✅ CORS跨域支持

### 前端功能
- ✅ 现代化SaaS级UI设计
- ✅ 顶部导航菜单
- ✅ 奖品设置管理
- ✅ 中奖记录查看
- ✅ 系统设置（兑奖密码）
- ✅ 用户登录/退出
- ✅ 响应式设计

## 🔐 登录凭证

默认登录账号：
- 用户名：admin
- 密码：admin

## 📦 技术栈

### 前端
- React 18
- Ant Design 5
- Axios
- Day.js

### 后端
- Node.js
- Express 4
- CORS
- Express Validator

## 🛠️ 开发

### 添加新的API路由

1. 在 `server/src/routes/` 目录下创建新文件
2. 定义路由处理逻辑
3. 在 `server/src/index.js` 中引入并使用

示例：
```javascript
import newRoutes from './routes/new.js';
app.use('/api/new', newRoutes);
```

### 添加新游戏

1. 在 `games/` 目录下创建新文件夹
2. 创建 `index.html` 文件
3. 更新 `games/index.html` 的游戏列表链接

## 📄 环境变量

### 后端配置

创建 `server/.env` 文件：

```
PORT=3001
NODE_ENV=development
```

## 🐛 故障排除

### 端口已被占用
```bash
# 修改PORT环境变量
PORT=3002 npm start
```

### CORS错误
确保后端服务器正在运行且前端正确配置了代理

### 模块未找到
重新安装依赖：
```bash
npm install
```

## 📞 支持

如有问题，请查看项目文档或联系开发团队。

## 📅 更新日志

### v1.0.0 (2024-12-18)
- 初始化项目
- 实现B/S架构
- 创建3个H5游戏
- 完成管理后台UI

## 📄 许可证

ISC

---

**祝你使用愉快！** 🎉
