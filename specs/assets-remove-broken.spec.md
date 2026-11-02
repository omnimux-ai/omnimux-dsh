# 规格：移除 6 张源文件损坏的角色立绘 (Issue #3892)

- Issue：https://github.com/omnimux-ai/omnimux-dsh/issues/3892
- 前置诊断：https://github.com/omnimux-ai/omnimux-dsh/issues/3885
- 状态：已确认（用户明确要求「移除这 6 个坏图」）
- 工作树：`.worktrees/assets-remove-broken`（分支 `agent/assets-remove-broken-issue-3892`）

## 1. 现象

资产中心「公共 → 角色 → 数字人」首屏 24 张里有 6 张是裂图（第 5、11、15、22、23、24 位）。#3885 已确认根因：这 6 张 PNG 的 `IEND` 缺失、在 IDAT 中间被截断，本地原件与 CDN 是同一个坏文件，工程侧无法修复。

用户决定直接移除这 6 个角色，而不是让裂图继续出现在首屏。

## 2. 涉及的 6 行

| id | 名称 |
| --- | --- |
| `character-digital-human-2894d810df1f` | Coquette Destiny |
| `character-digital-human-4735a1b47285` | Brainrot Jayden |
| `character-digital-human-7046fdf8cc44` | Cool Grandpa Hiroshi |
| `character-digital-human-a75f2fc74e2d` | Cottagecore Lily |
| `character-digital-human-b9deac16eeaf` | Boomer Grandma Betty |
| `character-digital-human-c69f04ccae0f` | Clean Girl Aria |

分布在 3 个 scope（`all/`、`character/`、`character/digital-human/`），共 18 处。

## 3. 用户操作旅程

1. 打开资产中心 → 公共 → 角色 → 数字人。
2. 首屏 24 张封面全部正常显示，**没有裂图**。
3. 往下滚动分页连续，不出现空位或重复卡片。
4. 「全部」分类里同样看不到这 6 个角色。

## 4. 期望界面反馈

- 首屏 24 张全部可渲染。
- 分页不出现「最后一页只有 18 张却标 24」这类错位。
- 分类计数（数字人 30 → 24）与实际可见数量一致。

## 5. 验收标准

| 编号 | 标准 | 验证方式 |
| --- | --- | --- |
| AC-1 | 6 个 id 在 `index.json` 与所有页文件中均不存在 | 全目录扫描 |
| AC-2 | 其余 6382 行的 id 集合与移除前完全相同（一字不改） | 前后 id 集合对比 |
| AC-3 | 每页 `items.length` ≤ `pageSize`；`total` = 该 scope 实际行数；`totalPages` = ceil(total/pageSize) | 契约测试 |
| AC-4 | `manifest.json` 各级 `total` / `pages` 与页文件实际行数一致 | 契约测试 |
| AC-5 | 分页连续：某 scope 所有页的 items 拼接后，正好等于该 scope 全部行，无重复无遗漏 | 契约测试 |
| AC-6 | 数字人首屏不再出现裂图 | 真实浏览器截图 |

## 6. 设计

一次性数据迁移脚本，不重跑全量采集（本机无 OPC 资产库，全量构建会删掉 6283 行采不到的资产）：

1. 从 `index.json` 删除 6 行（6388 → 6382）。
2. 从每个受影响的 scope 页文件删除 6 行，按 `pageSize` **重排分页**——不是简单留空。
3. 重算每个 scope 的 `total` / `totalPages`，以及 `manifest.json` 的各级计数。
4. 未受影响的 scope 与页文件保持字节不变。

重排而非留空，是因为页内 `items` 少 6 条却仍标 `pageSize: 24` 会让前端分页错位（`total` 与 `totalPages` 不自洽）。

## 7. 边界与降级

- 只删目录行，不删音频或其它关联资产。
- 未受影响的文件不重写，避免无谓的字节变化。
- 若某 scope 移除后为空，保留空页文件而非删除文件（前端按 URL 取页）。
- 回滚：本次是纯数据变更，`git revert` 即可恢复。

## 8. 新用户基线

全新安装签入后，数字人分类显示 24 个可用角色，全部有正常封面。用户不会看到裂图，也不会看到「该分类缺失角色」的提示——分类计数已同步为 24。

## 9. 非目标

- 不伪造、不用占位图掩盖。
- 不删这 6 个角色的音频文件或 R2 上的对象。
- 不改其它 6382 行的任何字段。

## 旧标准变更

- `tests/e2e/assets-cover-payload.e2e.test.mjs` :: `E2E 契约二：PNG 行的缩略图计划覆盖完整，清单可现场生成 (AC-8)`
  - **原断言**：`assert.equal(pngRows.length, 111, "PNG 行数应为 111")`、`assert.equal(plan.length, 111, ...)`、`assert.equal(manifest.total, 111, ...)`。
  - **必须改的理由**：这 111 张里包含本次移除的 6 张损坏立绘。移除后目录中 PNG 行实际为 105；继续断言 111 会让测试在正确的数据状态下失败，而它要证明的「计划覆盖完整、不静默缩小」语义不变。
  - **新期望证据**：三条断言改为 105，并新增一条断言——被移除的 6 个 id 既不在 `catalogIndex` 也不在 `plan` 里，防止日后误把坏图加回来。

## 假设

1. 这 6 个 id 在目录里只出现在 3 个 scope，且每个 scope 各出现一次（已扫描确认共 18 处）。
2. 前端按 `page-*.json` 的 `items` 渲染、按 `total` / `totalPages` 分页，因此重排分页即可保持自洽。
3. 删除这 6 行不会破坏其它行的引用关系（角色行之间无交叉引用）。

## 证伪方式

1. 若扫描发现 6 个 id 出现在更多 scope 或更多页，则假设 1 错 → 按实际分布重做，并以扫描结果为准。
2. 若前端出现分页错位或空卡片，则假设 2 错 → 检查 `totalPages` 与 `items.length` 的自洽性，必要时改用「留空位」策略。
3. 若移除后出现其它角色的封面缺失，则假设 3 错 → 检查是否有行间引用被破坏。
4. 可执行验证：
   - `node --test tests/e2e/assets-remove-broken.e2e.test.mjs`
   - 真实浏览器打开数字人分类，截图留证
   - 全目录扫描确认 6 个 id 归零
