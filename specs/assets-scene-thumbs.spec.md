# 规格：修场景分类 3 张超高分辨率封面 (Issue #3897)

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3897
- 前置：https://github.com/omnimux-ai/omnimux-dsh/issues/3892（角色分类缩略图已完成）
- 状态：已确认
- 工作树：`.worktrees/assets-scene-thumbs`（分支 `agent/assets-scene-thumbs-issue-3897`）

## 1. 现象

排查「其他分类是否也加载慢」时，用真实 HTTP HEAD 实测各分类首屏 24 张封面：

| 分类 | 首屏 24 张 | 最大单张 | 中位数 |
| --- | --- | --- | --- |
| 角色 | 79.07 MB | 6073 KB | 3131 KB |
| 场景 | 4.79 MB | **1216 KB** | 132 KB |
| 道具 | 3.46 MB | 288 KB | 136 KB |
| 素材 | 0.14 MB | 11 KB | 5 KB |
| 风格 | 0.40 MB | 20 KB | 19 KB |

**场景与道具的中位数只有 132/136 KB，整体健康。** 只有场景首屏 3 张明显异常：

| 名称 | 尺寸 | 字节 |
| --- | --- | --- |
| 城市街景 · 实景素材 251 | 3024×4032 | 1216 KB |
| 城市街景 · 实景素材 219 | 2268×4032 | 560 KB |
| 城市街景 · 实景素材 033 | 1080×1920 | 300 KB |

卡片宽度是 260–300 CSS px，2× DPR 下 640px 足够。3024px 源图是 10 倍过采样。

## 2. 用户操作旅程

1. 打开资产中心 → 公共 → 场景。
2. 首屏 24 张封面在骨架后快速成图，不再因 3 张大图拖慢整体。
3. 画质肉眼无差（640w 在 300px 卡片里仍是 2× 过采样）。
4. 点开详情看原图，不受影响。

## 3. 期望界面反馈

- 场景首屏从 4.79 MB 降到约 3.9 MB。
- 3 张异常封面降到 ≤60 KB。
- 其余 21 张封面字节不变。

## 4. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | 3 张封面 ≤60 KB | 生成后读文件大小 |
| AC-2 | 场景首屏 ≤4.0 MB | HEAD 实测合计 |
| AC-3 | `--ids` 参数不影响既有 `--all` / `--limit` / 默认行为 | 契约测试 |
| AC-4 | 其余场景行字节不变（未命中行不写 `thumb_url`） | 全目录扫描 |
| AC-5 | 真实浏览器场景首屏无裂图，缩略图命中 | ego-browser 截图 |

## 5. 设计

### 5.1 给缩略图脚本加 `--ids=<file>`

现有选择逻辑在 `planThumbs(rows, options)`，只按扩展名与 `--all` 过滤。新增一个
`ids` 选项：给定 id 集合时，只保留其中的行。优先级高于扩展名过滤（显式点名
即视为要处理，不管格式），但低于 `--limit`。

参数形态：`--ids=<path>`，文件内容为每行一个 catalog row id，空行与 `#` 注释忽略。

### 5.2 只处理这 3 行

```bash
node scripts/build-cover-thumbnails.mjs --out=<dir> --ids=<file>
```

不传 `--all`，因此不会连带把 4675 张 jpg 全部重编码。

### 5.3 上传与注入

沿用 #3882 的流程：`wrangler r2 object put` 上传到 `omnimux-public/thumbs/`，
再用注入脚本把 `thumb_url` 写进对应页与 `index.json`。

注入只碰这 3 行；其余行字节不变。

## 6. 边界与降级

- 若某张原图本身已损坏（解码失败），如实 SKIP 并记录，不伪造。
- 若 CDN 上传失败，重试；仍失败则记录并保留该行原样（客户端回落原图）。
- `--ids` 文件里出现目录中不存在的 id：忽略并告警，不报错中断。

## 7. 新用户基线

全新安装签入后，场景分类首屏 24 张全部正常加载，无一张超过 300 KB。

## 8. 非目标

- 不重编码全库 3154 张场景 jpg（中位数 132 KB，收益是四舍五入级别）。
- 不给素材/风格分类做缩略图（首屏 0.14/0.40 MB）。
- 不改 `THUMB_WIDTH` / `THUMB_QUALITY` 的既有取值。
- 不动角色分类已完成的优化。

## 旧标准变更

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约十五：--ids 精确点名行，压过格式过滤且不影响既有选择 (AC-3, AC-4)`
  - **原断言**：用例体内用 `await import("node:fs")` 等动态 import 读取临时目录来验证 `readIdList`。
  - **必须改的理由**：动态 import 被仓库门禁判定为 `dynamic-test-execution-needs-review`——该风险不可经声明放行，必须撤回。改法是把临时文件读写换成静态 `import fs from "node:fs"`（文件头已有），并把 `assert.deepEqual` 换成 `assert.equal` 的显式值比较，断言强度不降。
  - **新期望证据**：`--ids` 的选择优先级（ids > all > 默认 PNG）、`file:` 行拒绝、以及 `readIdList` 对注释与空行的处理，全部以 `assert.equal` 逐条断言。

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约十六：场景 3 张超高分辨率封面已带缩略图 (AC-1, AC-2, AC-4)`
  - **原断言**：`assert.deepEqual(withThumb.map(id).sort(), fixed.sort(), "场景分类只应有这 3 行带缩略图")`。
  - **必须改的理由**：这条断言是我在本任务中新增的草稿，写窄了——场景分类里原本就有 3 张 PNG 行在 #3882 时已带缩略图，总数是 6 而非 3。断言本身与需求无关，是我把「本次改动范围」误当成了「分类全集」。
  - **新期望证据**：改为断言场景分类共 6 行带缩略图，并逐条确认本次修的 3 个 id 在其中；这样既不误伤前一次任务的成果，又能守住本次的验收点。

## 假设

1. 这 3 张是原始上传质量问题（分辨率过高），不是 CDN 转码失败——已通过解析 JPEG 头确认尺寸 3024×4032 等。
2. 640w WebP 在 300px 卡片里肉眼无差（角色分类已验证过同类结论）。
3. 场景首屏只有这 3 张异常，其余 21 张中位 132 KB，无需处理。

## 证伪方式

1. 若重编码后这 3 张仍 >60 KB，则假设 1 错 → 检查源图是否本身已是低质量高分辨率，改用更激进的 quality。
2. 若真实浏览器里 640w 在场景卡片上肉眼可辨地糊，则假设 2 错 → 提高 `THUMB_WIDTH` 到 800 并重测。
3. 若扫描发现场景首屏还有其它 >300 KB 的封面，则假设 3 错 → 一并纳入本次 `--ids` 清单。
4. 可执行验证：
   - `node --test plugins/omnimux-assets/src/client/*.test.js`
   - `node --test tests/e2e/assets-cover-payload.e2e.test.mjs`
   - ego-browser 打开场景分类，截图与网络记录落 `docs/evidence/`
