# 规格说明：支持生成任务并发提交与相对参考图 URL 自动补全

**Issue**: #2871  
**状态**: 实施中  
**范围**: `plugins/omnimux/src/client/media-viewer/`  

---

## 1. 目标与缺陷场景

### 缺陷表现 1：连发第二个任务被阻断或状态相互覆盖
当第一个任务处于 `generating` 生成中状态时，用户继续在输入框输入提示词并提交第二个任务：
- 第一个任务完成后，其 `finally` 代码块执行单例 `store.setGenerating(false)`，提前将全局生成态置为 false，导致后续任务状态机脱节；
- 两个任务竞态抢占 `activeId`，完成时主视口可能误塌缩回空态。

### 缺陷表现 2：站内相对路径参考图探针报错 500
从资产库中选择的素材（如 `/omnimux/assets/library/preview?id=...`），由于是站内相对路径（以 `/` 开头），后端在执行前置检查 `probeTextImage` 时被误当成服务端文件系统根目录绝对路径读取，抛出 `image file not found` 导致 500 报错。

---

## 2. 修复方案

1. **并发任务状态安全管理 (`MediaViewerTab.jsx`)**：
   - 移除简单的单例 `store.setGenerating(false)`；
   - 任务结算时，检查当前会话是否还有其他任务处于 `generating` 状态，仅在所有并发任务全部完成后才将全局 `isGenerating` 置为 `false`；
   - 任务提交后，确保新任务作为 activeId 或保持正在生成态，并在缩略图栏安全保留所有正在生成或已完成的任务卡片。
2. **参考图 URL 完整性规范化 (`serializeReferenceAssets` in `media-slot.js`)**：
   - 在序列化参考图时，若检测到以 `/` 开头的站内同源相对路径（且非以 `//` 开头的协议相对路径），在客户端自动补全当前页面的 `window.location.origin`，确保后端与上游网关接收到完整的合规 HTTP URL，消除 `image file not found` 错误。

---

## 3. 验收标准
1. 在第一个任务正在生成时，输入新内容成功提交第二个任务，两个任务均正常排队/生成；
2. 选入资产库素材后生成，后端正常 probe 并成功返回，无 500 报错；
3. 单元测试与 auto-qa-gate 全部通过。
