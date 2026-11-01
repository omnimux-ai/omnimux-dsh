# 规格：把已上传的缩略图键注入随包目录 (Issue #3881)

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3881
- 前置：https://github.com/omnimux-ai/omnimux-dsh/issues/3875、https://github.com/omnimux-ai/omnimux-dsh/issues/3879
- 状态：已确认（用户明确要求走 CLI + 凭证上传）
- 工作树：`.worktrees/assets-thumb-apply`（分支 `agent/assets-thumb-apply-issue-3881`）

## 1. 现象

#3875 交付了缩略图生成脚本与客户端取图阶梯，#3879 修好了 image 行死路与悬停 timer，但**缩略图对象从未上传、随包目录仍 0 行带 `thumb_url`**，所以「79 MB → 1.74 MB」在交付形态下尚未成立——首屏仍在下载原图。

## 2. 已完成的上游步骤（本次会话内实测）

| 步骤 | 结果 |
| --- | --- |
| 定位凭证 | `wrangler` 已登录（账号 `861a8093c2f17a53b4f5a8375a347ff0`），`r2 bucket list` 可读 |
| 确认桶身份 | `omnimux-public` 取回 `Judge Owl.png` = 2918048 字节，与 `assets.omnimux.ai` 完全一致 |
| 生成缩略图 | 105 张 640w WebP，共 6.80 MB，单张 3–131 KB（6 张源文件损坏 + 1 张网络重试） |
| 上传 R2 | `thumbs/` 前缀下 105 个对象，全部 Upload complete |
| CDN 核验 | 逐个 HEAD：**105/105 返回 200，content-length 与本地字节完全一致** |

## 3. 用户操作旅程

1. 打开资产中心 → 公共 → 角色。
2. 首屏 24 张封面全部走缩略图，下载量从 79.07 MB 降到约 1.74 MB。
3. 场景 / 道具分类里那 11 张 PNG image 大图同样命中缩略图。
4. 缩略图缺失的行（6 张损坏源）自动回落原图，行为与改造前一致。

## 4. 期望界面反馈

- 首屏在骨架之后快速成图，不再「拉窗帘」。
- 卡片画质无肉眼可辨下降（640w @ 2× DPR）。
- 任何单张失败都退到原图或类型图标，不出现永久破图。

## 5. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | `index.json` 与页分片中 105 行带 `thumb_url`，均为 `https://assets.omnimux.ai/thumbs/*.webp` | 端到端契约测试 |
| AC-2 | 其余 6283 行不含 `thumb_url`，未命中行字节不变 | 契约测试（行数守恒 + 字段缺失） |
| AC-3 | 角色首屏 `character/page-0000.json` 24 行全部带 `thumb_url` | 契约测试 |
| AC-4 | 每个 `thumb_url` 在 CDN 返回 200 且字节与清单一致 | 人工/脚本核验（已在上游完成） |
| AC-5 | 客户端取图阶梯命中缩略图 | 既有 e2e 契约 + 真实浏览器 |

## 6. 设计

只做一次窄注入，**不重跑采集**：

- 输入：`/tmp/thumbs-upload/thumb-manifest.json`（105 行 `id → key`）
- 遍历 `cloud-catalog/**/page-*.json` 与 `index.json`
- 对清单命中的行补 `thumb_url = https://assets.omnimux.ai/<key>`
- 其余行与字节保持不变

不重跑全量构建的理由：本机没有 OPC 资产库（`--assets-root` 必需），全量构建会删掉 6283 行它采不到的资产，属破坏性操作。

## 7. 边界与降级

- 清单里没有的行：不写 `thumb_url`，客户端从原图开始（行为不变）。
- 缩略图 CDN 404：阶梯降档到原图，再失败退类型图标。
- 未命中行的 JSON 字节必须完全不变——`JSON.stringify` 往返已验证 byte-identical。

## 8. 新用户基线

全新安装签入后打开资产中心即可命中缩略图，无需任何配置或联网探测；缩略图缺失时回落原图，不报错、不空白。

## 9. 非目标

- 不改缩略图尺寸/质量，不重跑采集。
- 不动 302 缓存策略与取图阶梯实现。
- 不修那 6 张损坏的源立绘（需重新上传原始素材）。

## 旧标准变更

无。本任务只向目录数据注入字段，不修改任何既有测试断言。

## 假设

1. 105 张缩略图已全部上传且 CDN 字节与本地一致（已在本次会话逐个 HEAD 核验）。
2. `JSON.parse` → `JSON.stringify` 往返对未命中的行保持字节完全一致（已在 `character/page-0000.json` 上验证）。
3. 客户端阶梯在 `thumbUrl` 存在时会优先使用它（已由 #3879 的纯函数与 e2e 契约覆盖）。

## 证伪方式

1. 若注入后 `index.json` 出现任何非 `https://assets.omnimux.ai/thumbs/` 的 `thumb_url`，则假设 1 错 → 停止并回滚注入。
2. 若未命中行的 JSON 字节发生变化（`git diff` 显示非 `thumb_url` 改动），则假设 2 错 → 改用逐行字符串补丁而非整体重序列化。
3. 若真实浏览器首屏仍发出原图请求（`cover_url` 命中而非 `thumbs/`），则假设 3 错 → 检查 `normalizeCloudAsset` 的 `thumbUrl` 透出与阶梯顺序。
4. 可执行验证：
   - `node --test tests/e2e/assets-cover-payload.e2e.test.mjs`
   - `git diff --stat plugins/omnimux-assets/cloud-catalog/`
   - 真实浏览器测量首屏请求与字节
