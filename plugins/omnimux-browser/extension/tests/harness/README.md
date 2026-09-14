# 对话媒体画廊 · 真实浏览器验收 harness

在真实浏览器里渲染**产品自身的** `src/panel/MessageImages.tsx` 与 `src/panel/styles.css`，
用固定假数据（`session.attachment` 由 `fakeApi.ts` 返回 data URI）复现对话媒体画廊，
用于人工核对几何、交互与深浅两套配色。

## 构建与启动

```bash
# 1) 构建静态产物（输出到 tests/harness/dist/）
cd plugins/omnimux-browser/extension && pnpm run build:harness

# 2) 起静态服务器（任选一个端口）
cd plugins/omnimux-browser/extension/tests/harness && python3 -m http.server 8137 --directory dist
```

访问：

| 用途 | URL |
| --- | --- |
| 总览（浅色/深色 × 440px/320px 四个窗格） | <http://127.0.0.1:8137/> |
| 单个窗格（可直接调参） | <http://127.0.0.1:8137/frame.html?theme=dark&width=320> |

`frame.html` 支持的查询参数：

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `theme` | `light` / `dark` | 写 `<html data-theme>`，走产品两条配色令牌路径之一 |
| `width` | 数字（px） | 模拟侧边栏宽度，默认 `440` |
| `delay` | 数字（ms） | `session.attachment` 的假延迟，默认 `350`，用于观察骨架占位 |
| `locale` | `zh` / `en` | 面板文案语言 |

## 用例（自上而下）

| `data-case` | 内容 |
| --- | --- |
| `single` | 单素材 —— 只有舞台，不渲染小图条 |
| `quad` | 4 张图片素材 |
| `mixed` | 首项为 `video/mp4` 的视频素材 + 3 张图片 |
| `oct` | 8 张素材 —— 小图条横向溢出并两端渐隐 |
| `flaky` | 首次 `session.attachment` 故意 reject —— 点「重试」后成功 |

## 说明

- 素材取自 `public/media/`（3 张 JPG + 1 张 PNG + 1 个 MP4），构建时原样拷进 `dist/media/`；
  每个 fixture 声明的 `mediaType` 与其文件真实格式一致（`file public/media/*` 可核对）。
- `dist/` 已被 `extension/.gitignore` 忽略，构建产物不进版本库。
- 本 harness 不加载宿主、不连接 dsh 实例，只用于组件级的真实浏览器核对。
