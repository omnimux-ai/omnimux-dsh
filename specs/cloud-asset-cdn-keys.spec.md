# 云端资产地址唯一收敛规格 (Issue #1962)

## 1. 背景与问题
本地 6,284 个生产资产已全量同步至 `omnimux-public` 存储桶，但资产目录中仍有 4 类行携带
**外部第三方地址**（含会过期失效的签名链接）或**占位图地址**，客户端在无本地文件的机器上会取不到图：

| 品类 | 现状 | 影响 |
| --- | --- | --- |
| 前三秒钩子 (528) | 指向 `media.aftermark.workers.dev` | 外部域名，随时可能失效 |
| 动态绿幕 (150) | 视频指向 `media.aftermark.ai` | 外部域名 |
| 风格预设 (123) | 指向 `lf-xiaoyunque.jianying.com` 与 `picsum.photos` 占位图 | 第三方图床 + 无意义占位 |
| 背景音 (103) | 指向 `media.aftermark.workers.dev` | 外部域名 |
| 实景数字人 (329) | 封面指向 `p16-heycan-image-sign-sg.ibyteimg.com` 的**签名链接** | 签名过期后封面全挂 |

## 2. 目标
资产目录中每一条带本地文件的行，其云端地址必须是 `https://assets.omnimux.ai/<对象键>`，
且对象键与已上传到 `omnimux-public` 的实际键**逐字一致**（原始路径拼写，不做 URL 编码）。

## 3. 对象键规则（权威表）

| 品类 | 对象键规则 |
| --- | --- |
| 实景数字人 | `public-avatars/pippit/{云端目录}/preview.mp4`、`.../cover.jpg` |
| 免费数字人 | `avatars/free-ai-avatars/{原生分类}/{名称}/{文件名}` |
| 前三秒钩子 | `elements/hooks/{文件名}` |
| 动态绿幕 | `elements/green-screen/{文件名}` |
| 场景 | `scenes/{二级分类}/{文件名}` |
| 道具 | `props/{二级分类}/{文件名}` |
| 风格预设 | `styles/{二级分类}/{文件名}` |
| 背景音 / 音效 | `audio/bgm/{文件名}`、`audio/sfx/{文件名}` |

## 4. 验收标准
- **AC-1** 目录中不再出现 `media.aftermark.*`、`lf-xiaoyunque.jianying.com`、`picsum.photos`、
  `p16-heycan-image-sign-sg.ibyteimg.com` 等外部主机。
- **AC-2** 每条有本地文件的行，其 `meta.source_media_url` / `meta.source_cover_url` 均以
  `https://assets.omnimux.ai/` 开头。
- **AC-3** 目录地址去掉域名前缀后得到的对象键，与本地文件一一对应，抽样经公网请求返回 200。
- **AC-4** 实景数字人的云端目录映射来自资产库内的持久文件 `cloud-index.json`，不再依赖临时清单。
- **AC-5** 既有单元测试与端到端测试全绿。
