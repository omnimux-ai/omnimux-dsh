# omnimux-browser

OmniMux 专属浏览器伴侣插件与 Chrome 扩展套件（Fork 自社区主流开源项目 [Lum1104/dsh-browser](https://github.com/Lum1104/dsh-browser)）。

---

## 模块定位与架构

本项目采用 **双端协同架构**，将本地 OmniMux / DSH 的多模态与工具调用能力深度融入用户的真实浏览器日常工作流中：

```
+------------------------------------+        WebSocket         +-------------------------------------+
|        OmniMux / DSH 宿主          |  ws://127.0.0.1:3080/    |           Chrome 浏览器             |
|                                    |  /ext/bridge             |                                     |
|  13 个 browser_* 自动化工具:        | <----------------------> |  OmniMux 浏览器助手 (MV3 Side Panel) |
|  - browser_snapshot (编号 DOM 索引) |   双向指令 / 页面文本回传  |  - 原生侧边栏常驻对话                |
|  - browser_click / browser_type    |                          |  - 页面/社交媒体帖子正文智能提取    |
|  - browser_navigate / scroll       |                          |  - 鼠标划选即刻带入 Composer 引用   |
+------------------------------------+                          +-------------------------------------+
```

---

## 目录结构

```
plugins/omnimux-browser/
├── package.json               # 服务端插件元数据 (包名: omnimux-browser)
├── cordis.patch.yml           # Cordis 宿主服务与路由声明
├── tsconfig.json              # TypeScript 编译配置
├── tsdown.config.ts           # 打包打包器配置
├── src/                       # DSH 桥接服务端源码
│   ├── index.ts               # 插件入口、Cordis WebServer 路由注入
│   ├── server.ts              # WebSocket 会话协议机与连接注册表
│   ├── tools.ts               # 暴露给大模型的 13 个 browser_* 工具
│   ├── protocol.ts            # 通信协议 Frame 定义与验证
│   └── client.js              # 客户端辅助脚本
├── lib/                       # 服务端编译输出产物
└── extension/                 # Chrome MV3 浏览器扩展源码 (React + Vite)
    ├── manifest.json          # Chrome MV3 清单配置
    ├── package.json           # 扩展依赖与构建脚本
    ├── vite.*.config.ts       # Background / Content / Sidepanel 多入口打包配置
    ├── src/
    │   ├── background/        # 后台 Service Worker (WebSocket 连接维护)
    │   ├── content/           # 页面注入脚本 (DOM 数字编号索引、划选捕捉)
    │   └── panel/             # 原生 Side Panel 侧边栏 React 界面
    └── dist/                  # 扩展构建产物 (加载到 Chrome 的目录)
```

---

## 二次开发指引

### 1. 构建服务端插件
```bash
# 在 plugins/omnimux-browser 目录下
pnpm run build:server
```

### 2. 构建浏览器扩展
```bash
# 在 plugins/omnimux-browser 目录下
pnpm run build:extension
# 产物输出至 plugins/omnimux-browser/extension/dist/
```

### 3. 一键全量构建
```bash
pnpm run build
```

### 4. 浏览器热加载调试
1. 打开 Chrome 访问 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择：
   - 调试源码产物：`<当前工作区路径>/plugins/omnimux-browser/extension/dist`
   - 本地全局分发：`~/.dsh/browser-extension`（或 `~/.omnimux-dev/browser-extension`）
4. 修改扩展源码并重新构建后，点击扩展卡片右下角的 🔄 刷新图标即可生效。

---

## 协议与致谢

本项目 Fork 自开源项目 [Lum1104/dsh-browser](https://github.com/Lum1104/dsh-browser)，遵循 MIT 开源许可协议。保留原作者 @Yuxiang Lin 之版权声明。
