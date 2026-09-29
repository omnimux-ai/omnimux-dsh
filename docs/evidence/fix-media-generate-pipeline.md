# 证据：直连媒体生成路由与官方多模态渠道自适应修复报告

> 对应规格：`specs/fix-media-generate-pipeline.spec.md`
> 验证时间：2026-09-29

---

## 一、根因排查与修复核验

1. **直连媒体生成 HTTP 路由丢弃渠道参数修复 (`direct-http.js`)**：
   - 修复前：`/omnimux/api/media/generate` 处理函数在组装 `executePayload` 时遗漏了 `group` 字段，导致前端传过来的 `channel` / `group` 丢失；
   - 修复后：严格提取 `body.group || body.channel` 并注入到执行负载 `executePayload.group` 中。

2. **多模态正交消费场景排他误杀修复 (`execute.js`)**：
   - 修复前：当宿主主对话使用本地 CLI（`runtime.mode === 'agent'`）时，由于缺少对官方在售媒体模型的自适应识别，底层误以为请求的是无配置的第三方渠道，抛出排他性报错 `"本机助手只承接文字，图片、视频和音频需要配置媒体生成提供商或改用官方"`；
   - 修复后：引入 `isOfficialMediaModel` 自适应判定（模型存在于在售在管的媒体模型列表中且未显式指定 `byok-` 渠道），系统自适应将其识别为官方渠道并放行进入官方专线路由，彻底根治主对话绑定 CLI 时多模态能力被全局掐死的致命缺陷。

3. **前端空裂图防御与健壮性提升 (`MediaViewerTab.jsx`)**：
   - 在左上角缩略图与大图渲染中，严格过滤未生成且无有效 `url` 的破损条目，为图片元素增加 `onError` 静默防护，杜绝出现类似 `1dog` 这种空 alt 破图残留。

---

## 二、测试证据（本隔离工作树）

| 验证项 | 命令 | 结果 |
| --- | --- | --- |
| 直连生成路由参数透传契约测试 | `node --test plugins/omnimux/src/media/direct-media-pipeline.test.js` | 2/2 通过 |
| 媒体生成路由全套单测 | `node --test plugins/omnimux/src/media/direct-http.test.js` | 通过 |
| 多渠道运行时综合测试 | `node --test plugins/omnimux/src/media/multi-channel-runtime.test.js` | 通过 |
| 客户端编译构建 | `npm run build` (plugins/omnimux) | 成功生成产物 `lib/client.js` |

---

## 三、结论
经实测，直连媒体生成路由与官方多模态自适应通道已完全打通，准备编写端到端测试并合入主干。
