# omnimux-browser

[English](README.md) | [中文](README.zh.md)

OmniMux 浏览器伴侣插件与 Chrome 扩展，Fork 自 [Lum1104/dsh-browser](https://github.com/Lum1104/dsh-browser)，遵循 MIT 许可。

## 架构

宿主和 Chrome 扩展通过 `/ext/bridge` 上带认证的 WebSocket 桥通信。宿主提供 `browser_*` 工具；扩展执行浏览器操作并回传结构化页面文本。扩展同时提供原生侧边栏对话界面，并捕捉选中文字作为输入框引用。

连接地址属于实际运行的宿主，不应假设固定端口。浏览器自动化读取结构化文本，不把页面快照当作图片。

## 保存灵感

侧栏、顶部按钮、媒体预览和视频悬浮收藏由同一后台保存流程处理。推特收藏保存当前选中帖子，使用其永久链接；图片悬浮收藏仍加入资产库。

只有主程序确认条目完整入库才显示“已保存”。素材未齐时保留正文、来源和已保存素材，显示“部分保存”并可重试补齐；本机浏览器缓存不算主库保存。保存不会自动分析、发布或生成内容。

已提交任务保留主程序与条目身份，关闭侧栏或后台重启后继续核对。结果不明时先查回，不换主程序重复提交；主程序未启动时提示启动，不排入离线收藏队列。

## 源码布局

- `package.json`：服务端包元数据与构建命令。
- `cordis.patch.yml`：宿主服务声明。
- `tsconfig.json`、`tsdown.config.ts`：服务端编译与打包。
- `src/index.ts`：插件入口与宿主集成。
- `src/server.ts`：WebSocket 会话与连接注册表。
- `src/tools.ts`：浏览器工具定义。
- `src/protocol.ts`：共享协议帧。
- `src/client.js`：宿主网页客户端辅助脚本。
- `lib/`：服务端编译产物。
- `extension/`：Chrome Manifest V3 扩展；后台、内容与侧边栏源码位于 `extension/src/`，打包产物位于 `extension/dist/`。

## 开发

安装工作区依赖后，在 `plugins/omnimux-browser` 目录执行：

```sh
pnpm run build:server
pnpm run build:extension
# 或同时构建两端：
pnpm run build
```

隔离预览扩展时，打开 `chrome://extensions/`，启用开发者模式，选择「加载已解压的扩展程序」，加载当前检出的 `plugins/omnimux-browser/extension/dist`。源码变更后重新构建，再刷新该扩展卡片。这不会自动更新另一份已安装副本。

另行安装的分发副本可能位于 `~/.dsh/browser-extension` 或 `~/.omnimux-dev/browser-extension`；不要将其与当前检出产物混淆，也不要在隔离开发时覆盖它。

主程序插件更新、扩展构建、分发副本更新和浏览器实际重新加载是四个独立状态；交付时分别核实，不能用源码已更新代替已加载版本。

## 许可与致谢

Fork 自 [Lum1104/dsh-browser](https://github.com/Lum1104/dsh-browser)。MIT；保留原作者 Yuxiang Lin 的版权声明。
