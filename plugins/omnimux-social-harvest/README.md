# omnimux-social-harvest

OmniMux 社媒采集插件：封装本机 OpenCLI 官方内置社媒适配器（只读采集），服务爆款视频复刻主线的发现与解构环节。

## 能力

- 9 个平台：TikTok / Instagram / Pinterest（免登录）/ YouTube / X / Facebook / 小红书 / 抖音 / LinkedIn
- 工作台 Tab「社媒采集」：左平台列表（登录状态徽章）+ 右命令工具集 + 点击弹窗表单（规格驱动）
- 6 个 Agent 工具：`harvest_tiktok_search` / `harvest_tiktok_user` / `harvest_pinterest_pins` / `harvest_pinterest_download` / `harvest_sites_status` / `harvest_site_login`

## 边界

- **只读**：点赞、发帖、评论等写操作永不开放。
- **登录**：复用本机浏览器登录态（OpenCLI Browser Bridge），产品不接触账号密码；登录动作由人在浏览器完成。
- **显式开启**：默认关。设置 → 插件 → 社媒采集 打开总开关后才可用；未装 OpenCLI 时响亮报错（`HARVEST_NOT_INSTALLED`），不静默降级。
- **环境依赖**：本机安装 OpenCLI（OpenCLIApp 或 `npm i -g @jackwener/opencli`）+ Chrome 浏览器扩展。

## 错误契约

| 码 | 含义 | 可重试 |
|---|---|---|
| HARVEST_DISABLED | 总开关未开启 | 否 |
| HARVEST_NOT_INSTALLED | 未装 OpenCLI | 否 |
| HARVEST_UNAVAILABLE | 桥接断开/超时 | 是 |
| HARVEST_AUTH | 平台登录态失效 | 否（引导登录） |
| HARVEST_BAD_PAYLOAD | 输出结构变化 | 否 |
| （exit 66） | 合法空结果 | — |

## 开发

```bash
pnpm --filter omnimux-social-harvest test   # 53 项单测
node scripts/build-client.mjs               # 打包客户端
```

设计：`.agent-reports/opencli-plugin-survey/architecture-design.md`；规格：`specs/social-harvest-opencli.spec.md`。
